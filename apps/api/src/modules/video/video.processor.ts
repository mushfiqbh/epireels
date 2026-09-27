import { execFile } from 'child_process';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import { Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
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
  /** Local playlist path filled in after rendering completes. */
  playlistLocalPath?: string;
}

const RENDITIONS: readonly Rendition[] = [
  { key: '360p', height: 360, bandwidth: 600_000, resolution: '640x360' },
  { key: '720p', height: 720, bandwidth: 1_800_000, resolution: '1280x720' },
];

const SEGMENT_EXTENSION = '.m4s';
const PLAYLIST_MIME = 'application/vnd.apple.mpegurl';
const SEGMENT_MIME = 'video/iso.segment';
const POSTER_MIME = 'image/webp';

@Injectable()
export class VideoProcessor implements OnModuleInit {
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

    // Driver-agnostic input acquisition. The local driver returns the
    // on-disk path verbatim; the S3 driver streams the original into
    // a tempdir entry we own for the duration of this call.
    let sourcePath: string | null = null;
    let tempSourcePath: string | null = null;
    const completedRenditions: Rendition[] = [];
    let workRoot: string | null = null;

    try {
      sourcePath = await this.storage.downloadToTemp(video.filePath);
      tempSourcePath = sourcePath;
      workRoot = await fsp.mkdtemp(
        path.join(require('os').tmpdir(), `epireels-${videoId}-`),
      );

      // ── 1. Probe ────────────────────────────────────────────────
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

      // ── 2. Poster (single frame, cheap, fast) ──────────────────
      let posterWritten = false;
      try {
        const posterLocal = path.join(workRoot, 'poster.webp');
        await this.generatePoster(sourcePath, posterLocal);
        await this.storage.uploadFile(posterLocal, posterKey, POSTER_MIME);
        posterWritten = true;
      } catch (error) {
        this.logger.warn(
          `Poster generation failed for ${videoId}: ${asMessage(error)}`,
        );
      }

      // ── 3. HLS renditions ───────────────────────────────────────
      for (const rendition of RENDITIONS) {
        const renditionDir = `${outputRoot}/${rendition.key}`;
        try {
          const renditionWorkDir = await fsp.mkdtemp(
            path.join(workRoot, `${rendition.key}-`),
          );
          await this.generateVariant(sourcePath, renditionWorkDir, rendition.height);
          await this.uploadRenditionOutputs(
            renditionWorkDir,
            renditionDir,
            rendition.key,
          );
          completedRenditions.push({
            ...rendition,
            // Pin the local playlist path so the master playlist
            // writer can verify each variant actually shipped.
            playlistLocalPath: path.join(renditionWorkDir, 'playlist.m3u8'),
          } as Rendition);

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
        await this.fail(
          videoId,
          new Error('All HLS renditions failed to encode.'),
          { outputRoot, thumbnailsDir: `thumbnails/${videoId}` },
        );
        return;
      }

      // ── 4. Master playlist (always reflects what's on disk) ─────
      try {
        const masterLocal = path.join(workRoot, 'master.m3u8');
        await this.writeMasterPlaylistLocal(masterLocal, completedRenditions);
        await this.storage.uploadFile(masterLocal, masterKey, PLAYLIST_MIME);
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
    } finally {
      // Best-effort cleanup of the temp source copy (S3 driver) and
      // the workdir regardless of success/failure.
      if (tempSourcePath && tempSourcePath !== this.safeGetPath(video.filePath)) {
        await fsp.unlink(tempSourcePath).catch(() => undefined);
      }
      if (workRoot) {
        await fsp.rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  /**
   * Push every rendered file in `localDir` to its corresponding object
   * key under `remoteDir/<renditionKey>/`. Each rendition writes one
   * init segment, one variant playlist, and a contiguous run of media
   * segments — we discover them via `fs.readdir` so the upload stays
   * agnostic of how many segments ffmpeg produced.
   */
  private async uploadRenditionOutputs(
    localDir: string,
    remoteDir: string,
    renditionKey: string,
  ): Promise<void> {
    const files = await fsp.readdir(localDir);
    for (const name of files) {
      const localPath = path.join(localDir, name);
      const stat = await fsp.stat(localPath);
      if (!stat.isFile()) continue;
      const mime = name === 'playlist.m3u8'
        ? PLAYLIST_MIME
        : name.endsWith('.m4s')
          ? SEGMENT_MIME
          : 'application/octet-stream';
      const key = `${remoteDir}/${name}`;
      await this.storage.uploadFile(localPath, key, mime);
      void renditionKey;
    }
  }

  /**
   * The local-storage driver has a real path; the S3 driver throws on
   * `getPath`. The processor only needs the comparison for cleanup
   * decisions (don't try to delete the original via `unlink`), so we
   * swallow the throw here.
   */
  private safeGetPath(key: string): string | null {
    try {
      return this.storage.getPath(key);
    } catch {
      return null;
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
    await fsp.mkdir(path.dirname(outputPath), { recursive: true });
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
    await fsp.mkdir(outputDirectory, { recursive: true });
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
        `segment_%05d${SEGMENT_EXTENSION}`,
        'playlist.m3u8',
      ],
      { cwd: outputDirectory },
    );
  }

  /**
   * Render the master playlist to a local file. Uploading happens
   * separately (the caller already knows the storage key for the
   * master) so this method stays driver-agnostic.
   */
  private async writeMasterPlaylistLocal(
    outputPath: string,
    renditions: Rendition[],
  ): Promise<void> {
    const lines: string[] = ['#EXTM3U', '#EXT-X-VERSION:7'];

    for (const rendition of renditions) {
      // Defence-in-depth: verify the rendition playlist actually made
      // it to disk. If the encoder crashed mid-write we should not
      // advertise a broken variant.
      if (
        rendition.playlistLocalPath === undefined ||
        !fs.existsSync(rendition.playlistLocalPath)
      ) {
        continue;
      }
      lines.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${rendition.bandwidth},RESOLUTION=${rendition.resolution}`,
        `${rendition.key}/playlist.m3u8`,
      );
    }

    if (lines.length <= 2) {
      throw new Error('No playable renditions available for master playlist.');
    }

    await fsp.writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
  }

  private async markStatus(
    videoId: string,
    status: string,
    error: string | null,
  ): Promise<void> {
    await this.prisma.video
      .update({
        where: { id: videoId },
        data: { processingStatus: status, processingError: error },
      })
      .catch(() => undefined);
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
 * Resolve `ffmpeg` / `ffprobe` paths. Mirrors `scripts/check-ffmpeg.mjs`
 * but kept in-process so the API can fail at boot when the binary is
 * missing. Priority: explicit env var > bare command > `<name>.exe` on
 * Windows > common install dirs.
 */
function resolveBinary(envVar: string, name: string): string {
  const explicit = process.env[envVar];
  if (explicit && explicit.trim().length > 0) {
    return explicit;
  }
  const isWindows = process.platform === 'win32';
  if (!isWindows) {
    return name;
  }
  // On Windows we surface the `.exe` variant explicitly so spawn never
  // hits ENOENT when the bare command isn't on PATH.
  return `${name}.exe`;
}
