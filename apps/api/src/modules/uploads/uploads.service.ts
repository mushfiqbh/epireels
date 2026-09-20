import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../storage/storage.interface';
import { VideoProcessor } from '../video/video.processor';
import { probeMp4 } from './mp4-probe';
import type { MulterFile, AdminUploadResponseDto } from './dto/upload.dto';

/**
 * Member upload service.
 *
 * Same flow as the legacy admin upload, but every upload is owned by
 * the authenticated caller. The resulting `Upload` row acts as the
 * ownership ledger — `DELETE /api/v1/uploads/:uploadId` only succeeds
 * when the caller is the `ownerId`.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly videoProcessor: VideoProcessor,
  ) {}

  async uploadVideo(params: {
    ownerId: string;
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
    if (!params.episodeTitle) {
      throw new BadRequestException(
        '`episodeTitle` is required for video processing uploads.',
      );
    }

    const ext = path.extname(params.file.originalname).toLowerCase() || '.mp4';
    const videoId = randomUUID();
    const key = `originals/${videoId}/original${ext}`;

    await this.storage.upload(params.file.buffer, key, params.file.mimetype);
    const url = this.storage.getUrl(key);
    this.logger.log(
      `Owner ${params.ownerId} uploaded ${params.file.size} bytes → ${key}`,
    );

    const probed = probeMp4(params.file.buffer);

    const response: AdminUploadResponseDto = {
      key,
      url,
      mimeType: params.file.mimetype || 'application/octet-stream',
      size: params.file.size,
      durationSeconds: probed.durationSeconds,
      width: probed.width,
      height: probed.height,
      videoId,
      processingStatus: 'UPLOADED',
    };

    try {
      const { episode, seriesId: resultingSeriesId } = await this.persistUpload({
        ownerId: params.ownerId,
        videoId,
        seriesId: params.seriesId,
        seriesTitle: params.seriesTitle,
        episodeTitle: params.episodeTitle,
        description: params.description,
        seasonNumber: params.seasonNumber,
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
        seriesId: resultingSeriesId,
      };
    } catch (error) {
      await this.storage.delete(key);
      throw error;
    }

    void this.videoProcessor.process(videoId);

    return response;
  }

  /** List uploads owned by the caller (most recent first). */
  async listForOwner(ownerId: string, limit = 50) {
    return this.prisma.upload.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { videos: true },
    });
  }

  /** Remove an upload, but only if the caller owns it. */
  async removeOwned(uploadId: string, ownerId: string, role?: string): Promise<void> {
    const row = await this.prisma.upload.findUnique({
      where: { id: uploadId },
      include: { videos: true },
    });
    if (!row) {
      throw new BadRequestException('Upload not found');
    }
    if (row.ownerId !== ownerId && role !== 'admin') {
      throw new BadRequestException('You do not own this upload');
    }
    // Best-effort: drop the underlying files from storage, then the row.
    for (const video of row.videos) {
      await this.storage.delete(video.filePath).catch(() => undefined);
    }
    await this.prisma.upload.delete({ where: { id: uploadId } });
  }

  /** Persist an `Upload` row + Episode/Video chain attached to the owner. */
  private async persistUpload(input: {
    ownerId: string;
    videoId: string;
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
          'Either `seriesId` or `seriesTitle` is required when uploading with an episode title.',
        );
      }
      const slug = slugify(input.seriesTitle);
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
      create: { seriesId, seasonNumber, title: `Season ${seasonNumber}` },
      update: {},
    });

    let episodeNumber = input.episodeNumber;
    if (episodeNumber === undefined) {
      const last = await this.prisma.episode.findFirst({
        where: { seasonId: season.id },
        orderBy: { episodeNumber: 'desc' },
        select: { episodeNumber: true },
      });
      episodeNumber = (last?.episodeNumber ?? 0) + 1;
    }

    const durationSeconds = input.durationSeconds ?? 0;

    const upload = await this.prisma.upload.create({
      data: {
        ownerId: input.ownerId,
        title: input.episodeTitle,
        description: input.description ?? null,
        status: 'UPLOADED',
      },
    });

    const episode = await this.prisma.episode.create({
      data: {
        seasonId: season.id,
        episodeNumber,
        title: input.episodeTitle,
        description: input.description ?? null,
        durationSeconds,
        videos: {
          create: {
            id: input.videoId,
            uploadId: upload.id,
            filePath: input.filePath,
            mimeType: input.mimeType,
            fileSize: BigInt(input.fileSize),
            durationSeconds,
            width: input.width ?? 0,
            height: input.height ?? 0,
          },
        },
      },
    });

    return { upload, episode, seriesId };
  }
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || `series-${Date.now()}`
  );
}
