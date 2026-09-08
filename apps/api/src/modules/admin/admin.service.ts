import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import type { StorageService } from '../storage/storage.interface';
import type { AdminUploadResponseDto } from './dto/admin-upload.dto';
import { probeMp4 } from './mp4-probe';

/**
 * Minimal subset of multer's file shape that we rely on. Defined
 * locally so this module compiles even when the express types are not
 * imported transitively.
 */
export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Admin upload service.
 *
 * Persists the uploaded video to the configured {@link StorageService}
 * and — when the request includes enough metadata — links it to a
 * Season → Episode → Video row chain so it appears in the public feed.
 *
 * **No auth.** This service is intentionally open for the duration of
 * the prototype. Disable it in production by setting
 * `ADMIN_UPLOAD_ENABLED=false` (or `NODE_ENV=production` together with
 * `ADMIN_ALLOW_PROD=false`).
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  /**
   * Upload a single video file and optionally attach it to a season.
   *
   * @param file            Multipart file uploaded under the `file` field.
   * @param seriesId        Existing Series cuid to attach the episode to.
   *                        If omitted, a new Series is created from
   *                        `seriesTitle`.
   * @param seriesTitle     Title used when creating a new Series (also
   *                        becomes the season title).
   * @param episodeTitle    Title for the new Episode row.
   * @param description     Optional synopsis / show notes.
   * @param seasonNumber    Season number (defaults to 1).
   * @param episodeNumber   Episode number within the season (defaults
   *                        to one greater than the current max).
   */
  async uploadVideo(params: {
    file: MulterFile | undefined;
    seriesId?: string;
    seriesTitle?: string;
    episodeTitle?: string;
    description?: string;
    seasonNumber?: number;
    episodeNumber?: number;
  }): Promise<AdminUploadResponseDto> {
    if (!params.file) {
      throw new BadRequestException('A `file` multipart field is required.');
    }

    const ext = path.extname(params.file.originalname).toLowerCase() || '.mp4';
    const key = `uploads/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext}`;

    await this.storage.upload(params.file.buffer, key, params.file.mimetype);
    const url = this.storage.getUrl(key);
    this.logger.log(`Uploaded ${params.file.size} bytes → ${key}`);

    // Best-effort probe of the upload's duration / resolution. The
    // container MP4 boxes carry this information in plain text, so we
    // can pull it out without spawning `ffprobe` and without adding a
    // native dep to the container. For non-MP4 files (`.webm`, `.mkv`)
    // this returns zeros and the row keeps the Prisma defaults — the
    // `<video>` element will still discover the real duration via
    // `loadedmetadata` once the bytes reach the browser.
    const probed = probeMp4(params.file.buffer);
    if (probed.durationSeconds > 0 || probed.width > 0) {
      this.logger.log(
        `Probed ${key}: ${probed.durationSeconds}s @ ${probed.width}x${probed.height}`,
      );
    }

    const response: AdminUploadResponseDto = {
      key,
      url,
      mimeType: params.file.mimetype || 'application/octet-stream',
      size: params.file.size,
      durationSeconds: probed.durationSeconds,
      width: probed.width,
      height: probed.height,
    };

    // Only attach to an Episode row when an episode title is supplied.
    // The /admin page always sends one, but a raw API consumer might
    // want a "storage-only" smoke test.
    if (params.episodeTitle) {
      const episode = await this.attachEpisode({
        seriesId: params.seriesId,
        seriesTitle: params.seriesTitle,
        seasonNumber: params.seasonNumber,
        episodeTitle: params.episodeTitle,
        description: params.description,
        episodeNumber: params.episodeNumber,
        filePath: key,
        mimeType: response.mimeType,
        fileSize: params.file.size,
        durationSeconds: probed.durationSeconds,
        width: probed.width,
        height: probed.height,
      });
      response.episode = {
        id: episode.id,
        title: episode.title,
        seriesId: episode.season.seriesId,
      };
    }

    return response;
  }

  /** Ensure Series + Season exist and create an Episode + Video row
   *  pointing at the freshly uploaded file. */
  private async attachEpisode(input: {
    seriesId?: string;
    seriesTitle?: string;
    seasonNumber?: number;
    episodeTitle: string;
    description?: string;
    episodeNumber?: number;
    filePath: string;
    mimeType: string;
    fileSize: number;
    durationSeconds?: number;
    width?: number;
    height?: number;
  }) {
    let seriesId = input.seriesId;

    if (!seriesId) {
      if (!input.seriesTitle) {
        throw new BadRequestException(
          'Either `seriesId` or `seriesTitle` is required when ' +
            'uploading with an episode title.',
        );
      }
      const slug = slugify(input.seriesTitle);
      // Upsert by slug so repeated uploads don't double-create the
      // same series.
      const series = await this.prisma.series.upsert({
        where: { slug },
        create: {
          title: input.seriesTitle,
          slug,
          description: input.description ?? null,
          status: 'draft',
        },
        update: {
          description: input.description ?? undefined,
        },
      });
      seriesId = series.id;
    }

    const seasonNumber = input.seasonNumber ?? 1;
    const season = await this.prisma.season.upsert({
      where: { seriesId_seasonNumber: { seriesId, seasonNumber } },
      create: {
        seriesId,
        seasonNumber,
        title: `Season ${seasonNumber}`,
      },
      update: {},
    });

    // Pick the next episode number if the caller didn't override it.
    let episodeNumber = input.episodeNumber;
    if (episodeNumber === undefined) {
      const last = await this.prisma.episode.findFirst({
        where: { seasonId: season.id },
        orderBy: { episodeNumber: 'desc' },
        select: { episodeNumber: true },
      });
      episodeNumber = (last?.episodeNumber ?? 0) + 1;
    }

    // Mirror the probed duration + dimensions onto the Episode row too:
    // the public Episode DTO formatter reads `Episode.durationSeconds`
    // (not the Video row), so without this the client still gets
    // "00:00" for newly-uploaded reels even after the Video row knows
    // the real length.
    const durationSeconds = input.durationSeconds ?? 0;

    const episode = await this.prisma.episode.create({
      data: {
        seasonId: season.id,
        episodeNumber,
        title: input.episodeTitle,
        description: input.description ?? null,
        durationSeconds,
        videos: {
          create: {
            filePath: input.filePath,
            mimeType: input.mimeType,
            fileSize: BigInt(input.fileSize),
            durationSeconds,
            width: input.width ?? 0,
            height: input.height ?? 0,
          },
        },
      },
      include: { season: true },
    });

    return episode;
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `series-${Date.now()}`;
}