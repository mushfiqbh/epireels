import { execFile } from 'child_process';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { ProbeResult, VIDEO_PROCESSING_STATUS } from './video.types';

const execFileAsync = promisify(execFile);

/**
 * Vertical rendition ladder. Each entry produces one HLS variant under
 * `streams/<videoId>/<key>/`. Ordered lowest → highest so the early-flip
 * in {@link VideoProcessor.process} can publish the 360p playlist as soon
 * as it lands on disk.
 */
interface Rendition {
  key: string;
  height: number;
  /** Average bitrate advertised in the master playlist. */
  bandwidth: number;
  /** Resolution advertised in the master playlist. */
  resolution: string;
}

const RENDITIONS: readonly Rendition[] = [
  { key: '360p', height: 360, bandwidth: 600_000, resolution: '640x360' },
  { key: '720p', height: 720, bandwidth: 1_800_000, resolution: '1280x720' },
];

@Injectable()
export class VideoProcessor {
  private readonly logger = new Logger(VideoProcessor.name);
  private ffmpegPath!: string;
  private ffprobePath!: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  /**
   * Resolve the binary locations once at boot. We do it eagerly so a
   * missing `ffmpeg` fails fast with a clear message rather than during
   * the first user upload.
   */
  onModuleInit(): void {
    this.ffmpegPath = resolveBinary('FFMPEG_PATH', 'ffmpeg');
    this.ffprobePath = resolveBinary('FFPROBE_PATH', 'ffprobe');
    this.logger.log(`ffmpeg  → ${this.ffmpegPath}`);
    this.logger.log(`ffprobe → ${this.ffprobePath}`);
  }

  async process(videoId: string): Promise<void> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
    });
    if (!video) throw new NotFoundException(`Video not found: ${videoId}`);

    const outputRoot = `streams/${videoId}`;
    const posterKey = `thumbnails/${videoId}/poster.webp`;
    const masterKey = `${outputRoot}/master.m3u8`;

    await this.markStatus(videoId, VIDEO_PROCESSING_STATUS.PROCESSING, null);

    const sourcePath = this.storage.getPath(video.filePath);
    const completedRenditions: Rendition[] = [];

    // ── 1. Probe ────────────────────────────────────────────────
    // Sets `durationSeconds` / `width` / `height` so the front-end can
    // render the duration badge before the first segment arrives.
    try {
      const probe = await this.probe(sourcePath);
      await this.prisma.video.update({
        where: { id: videoId },
        data: {
          durationSeconds: probe.durationSeconds,
          width: probe.width,
          height: probe.height,
        },
      });
    } catch (error) {
      await this.fail(videoId, error, {
        outputRoot,
        thumbnailsDir: `thumbnails/${videoId}`,
      });
      return;
    }

    // ── 2. Poster (single frame, cheap, fast) ───────────────────
    // Best-effort: a missing poster shouldn't block the reel from
    // becoming playable — the player falls back to the per-episode
    // thumbnail served from the public feed.
    let posterWritten = false;
    try {
      await fsp.mkdir(this.storage.getPath(`thumbnails/${videoId}`), {
        recursive: true,
      });
      await this.generatePoster(sourcePath, this.storage.getPath(posterKey));
      posterWritten = true;
    } catch (error) {
      this.logger.warn(
        `Poster generation failed for ${videoId}: ${asMessage(error)}`,
      );
    }

    // ── 3. HLS renditions ───────────────────────────────────────
    // Each rendition is rendered independently so a 720p failure
    // can't roll back the 360p playlist that already shipped.
    for (const rendition of RENDITIONS) {
      const renditionDir = `${outputRoot}/${rendition.key}`;
      try {
        await fsp.mkdir(this.storage.getPath(renditionDir), {
          recursive: true,
        });
        await this.generateVariant(
          sourcePath,
          this.storage.getPath(renditionDir),
          rendition.height,
        );
        completedRenditions.push(rendition);

        // First playable variant → flip the row to READY so the
        // browser can start streaming while the rest of the ladder
        // keeps encoding. This is the "instant load" behaviour the
        // player relies on.
        if (completedRenditions.length === 1) {
          await this.publishReady(videoId, {
            streamPath: masterKey,
            thumbnailPath: posterWritten ? posterKey : null,
            posterWritten,
          });
        }
      } catch (error) {
        this.logger.warn(
          `Rendition ${rendition.key} failed for ${videoId}: ${asMessage(error)}`,
        );
      }
    }

    if (completedRenditions.length === 0) {
      // Every variant failed — the reel is genuinely unplayable.
      await this.fail(
        videoId,
        new Error('All HLS renditions failed to encode.'),
        { outputRoot, thumbnailsDir: `thumbnails/${videoId}` },
      );
      return;
    }

    // ── 4. Master playlist (always reflects what's on disk) ─────
    try {
      await this.writeMasterPlaylist(masterKey, completedRenditions);
      // If more renditions landed after the early READY flip, re-stamp
      // the row so callers who compare timestamps see the upgrade.
      await this.prisma.video.update({
        where: { id: videoId },
        data: { processingError: null, updatedAt: new Date() },
      });
      this.logger.log(
        `Processed video ${videoId} (${completedRenditions.map((r) => r.key).join(', ')})`,
      );
    } catch (error) {
      await this.fail(videoId, error, {
        outputRoot,
        thumbnailsDir: `thumbnails/${videoId}`,
      });
    }
  }

  async probe(sourcePath: string): Promise<ProbeResult> {
    const { stdout } = await this.run(this.ffprobePath, [
      '-v',
      'error',
      '-show_streams',
      '-show_format',
      '-print_format',
      'json',
      sourcePath,
    ]);
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
      format?: { duration?: string };
    };
    const stream = parsed.streams?.find((item) => item.codec_type === 'video');
    return {
      durationSeconds: Math.max(
        0,
        Math.round(Number(parsed.format?.duration) || 0),
      ),
      width: Math.max(0, Math.round(stream?.width ?? 0)),
      height: Math.max(0, Math.round(stream?.height ?? 0)),
    };
  }

  private async generatePoster(
    sourcePath: string,
    outputPath: string,
  ): Promise<void> {
    await this.run(this.ffmpegPath, [
      '-y',
      '-ss',
      '1',
      '-i',
      sourcePath,
      '-frames:v',
      '1',
      '-vf',
      'scale=640:-2:flags=lanczos',
      '-c:v',
      'libwebp',
      outputPath,
    ]);
  }

  private async generateVariant(
    sourcePath: string,
    outputDirectory: string,
    height: number,
  ): Promise<void> {
    await this.run(
      this.ffmpegPath,
      [
        '-y',
        '-i',
        sourcePath,
        '-vf',
        `scale=-2:${height}:flags=lanczos`,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        '-f',
        'hls',
        '-hls_time',
        '6',
        '-hls_playlist_type',
        'vod',
        '-hls_segment_type',
        'fmp4',
        '-hls_fmp4_init_filename',
        'init.mp4',
        '-hls_segment_filename',
        'segment_%05d.m4s',
        'playlist.m3u8',
      ],
      { cwd: outputDirectory },
    );
  }

  private async writeMasterPlaylist(
    masterKey: string,
    renditions: Rendition[],
  ): Promise<void> {
    const lines: string[] = ['#EXTM3U', '#EXT-X-VERSION:7'];
    const videoId = path.basename(path.dirname(masterKey));

    for (const rendition of renditions) {
      const playlistPath = this.storage.getPath(
        `streams/${videoId}/${rendition.key}/playlist.m3u8`,
      );
      // Defence-in-depth: also check the filesystem. If the encoder
      // crashed mid-write the directory may exist but the playlist may
      // not, in which case we'd be advertising a broken variant.
      if (!fs.existsSync(playlistPath)) continue;
      lines.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${rendition.bandwidth},RESOLUTION=${rendition.resolution}`,
        `${rendition.key}/playlist.m3u8`,
      );
    }

    if (lines.length <= 2) {
      throw new Error('No playable renditions available for master playlist.');
    }

    await fsp.writeFile(
      this.storage.getPath(masterKey),
      `${lines.join('\n')}\n`,
      'utf8',
    );
  }

  private async markStatus(
    videoId: string,
    status: string,
    error: string | null,
  ): Promise<void> {
    await this.prisma.video.update({
      where: { id: videoId },
      data: { processingStatus: status, processingError: error },
    });
  }

  /**
   * Flip the row to READY the moment a playable manifest is on disk.
   * `posterWritten === false` is a valid state — the player will use
   * the feed-level thumbnail in that case.
   */
  private async publishReady(
    videoId: string,
    payload: {
      streamPath: string;
      thumbnailPath: string | null;
      posterWritten: boolean;
    },
  ): Promise<void> {
    await this.prisma.video.update({
      where: { id: videoId },
      data: {
        processingStatus: VIDEO_PROCESSING_STATUS.READY,
        streamPath: payload.streamPath,
        thumbnailPath: payload.thumbnailPath,
        processingError: payload.posterWritten ? null : 'Poster unavailable.',
      },
    });
  }

  private async fail(
    videoId: string,
    error: unknown,
    cleanup: { outputRoot: string; thumbnailsDir: string },
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Failed to process video ${videoId}: ${message}`);
    await Promise.allSettled([
      this.storage.removeDirectory(cleanup.outputRoot),
      this.storage.removeDirectory(cleanup.thumbnailsDir),
    ]);
    await this.prisma.video.update({
      where: { id: videoId },
      data: {
        processingStatus: VIDEO_PROCESSING_STATUS.FAILED,
        processingError: message.slice(0, 4000),
      },
    });
  }

  private async run(
    command: string,
    args: string[],
    options?: { cwd?: string },
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync(command, args, {
        maxBuffer: 4 * 1024 * 1024,
        ...options,
      });
    } catch (error) {
      const enriched = new Error(formatFfmpegError(command, args, error));
      throw enriched;
    }
  }
}

/**
 * Format an `execFile` error so the `processing_error` column carries
 * the actionable detail (binary missing vs. ffmpeg crash). Pulling
 * `stderr` off the rejection keeps the original cause intact.
 */
function formatFfmpegError(
  command: string,
  args: string[],
  error: unknown,
): string {
  const err = error as NodeJS.ErrnoException & {
    stderr?: string;
    code?: string;
  };
  const stderr = (err.stderr ?? '').toString().trim();
  if (err.code === 'ENOENT') {
    return (
      `${path.basename(command)} binary not found on PATH ` +
      `(looked for \`${command}\`). ` +
      `Install it (e.g. \`winget install Gyan.FFmpeg\` on Windows) ` +
      `or set the FFMPEG_PATH / FFPROBE_PATH env vars. ` +
      `Command: ${command} ${args.join(' ')}`
    );
  }
  if (stderr) {
    return `${err.message ?? 'ffmpeg failed'}\n${stderr.slice(-2000)}`;
  }
  return err.message ?? `Unknown error running ${command}`;
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Resolve the absolute path of `ffmpeg` / `ffprobe`, honouring the env
 * override first and then probing common install locations (important
 * on Windows where the binaries often live outside `PATH`).
 *
 * Returns the bare command name even when nothing is found — that's
 * the path that produces the recognisable `spawn ffmpeg ENOENT` error
 * inside `VideoProcessor`, which is exactly what we want logged when
 * the user forgot to install ffmpeg.
 */
function resolveBinary(
  envVar: 'FFMPEG_PATH' | 'FFPROBE_PATH',
  name: string,
): string {
  const override = process.env[envVar];
  if (override && override.length > 0) return override;

  const exeSuffix = process.platform === 'win32' ? '.exe' : '';

  if (commandExists(`${name}${exeSuffix}`)) return `${name}${exeSuffix}`;
  if (commandExists(name)) return name;

  if (process.platform === 'win32') {
    const candidates = [
      path.join(
        process.env.LOCALAPPDATA ?? '',
        'Microsoft',
        'WindowsApps',
        `${name}.exe`,
      ),
      path.join(
        process.env.LOCALAPPDATA ?? '',
        'Programs',
        'ffmpeg',
        `${name}.exe`,
      ),
      `C:\\Program Files\\ffmpeg\\bin\\${name}.exe`,
      `C:\\Program Files (x86)\\ffmpeg\\bin\\${name}.exe`,
      `C:\\ProgramData\\chocolatey\\bin\\${name}.exe`,
      path.join(process.env.USERPROFILE ?? '', 'scoop', 'shims', `${name}.exe`),
    ];
    for (const candidate of candidates) {
      if (candidate && safeExists(candidate)) return candidate;
    }
  }

  // Fall back to the bare command so the eventual `spawn` failure is
  // loud and recognisable.
  return `${name}${exeSuffix}`;
}

function commandExists(candidate: string): boolean {
  const PATH = process.env.PATH ?? '';
  const separator = process.platform === 'win32' ? ';' : ':';
  for (const dir of PATH.split(separator)) {
    if (!dir) continue;
    const full = path.join(dir, candidate);
    if (safeExists(full)) return true;
  }
  return false;
}

function safeExists(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}
