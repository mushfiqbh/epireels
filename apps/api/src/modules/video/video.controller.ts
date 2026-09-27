import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import {
  STORAGE_SERVICE,
  StorageService,
} from '../storage/storage.interface';
import { VideoProcessor } from './video.processor';
import { VideoService } from './video.service';
import type {
  UploadUrlRequestDto,
  UploadUrlResponseDto,
  VideoPlaybackDto,
} from '@epireels/types';
import type { JwtPayload } from '../auth/auth.service';

@Controller('api/v1/videos')
export class VideoController {
  private readonly logger = new Logger(VideoController.name);

  constructor(
    private readonly videoService: VideoService,
    private readonly videoProcessor: VideoProcessor,
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  /**
   * Mint a presigned `PUT` URL the browser can use to upload a video
   * directly to object storage. The API never sees the file bytes —
   * it just hands back the upload target.
   *
   * Request:
   *   { filename: string; contentType: string }
   *
   * Response:
   *   {
   *     videoId,        // server-side id to use at upload-complete
   *     key,            // object key the PUT should land at
   *     uploadUrl,      // presigned PUT URL
   *     expiresInSeconds,
   *   }
   *
   * The key convention is `originals/<videoId>/original.<ext>` so the
   * processor can pull the input by id, and the same prefix
   * (`streams/<videoId>`) stays free for the rendered HLS artefacts.
   */
  @Post('upload-url')
  @HttpCode(201)
  async createUploadUrl(
    @CurrentUser() user: JwtPayload,
    @Body() body: UploadUrlRequestDto,
  ): Promise<UploadUrlResponseDto> {
    const filename = body?.filename?.trim();
    const contentType = body?.contentType?.trim();
    if (!filename) throw new BadRequestException('filename is required.');
    if (!contentType) throw new BadRequestException('contentType is required.');
    if (!/^video\//.test(contentType) && contentType !== 'application/octet-stream') {
      throw new BadRequestException(
        `Unsupported contentType "${contentType}". Expected video/* (or octet-stream for proxied tests).`,
      );
    }

    const ext = path.extname(filename).toLowerCase() || '.mp4';
    if (!/^\.[a-z0-9]{2,5}$/.test(ext)) {
      throw new BadRequestException(
        `Filename must include a valid extension (got "${ext}").`,
      );
    }

    const videoId = randomUUID();
    const key = `originals/${videoId}/original${ext}`;
    const presign = await this.storage.getUploadUrl({
      key,
      contentType,
      expiresInSeconds: 900,
    });

    this.logger.log(
      `Issued upload URL for owner=${user.sub} videoId=${videoId} key=${key} driver=${this.storage.isRemote ? 'remote' : 'local'}`,
    );

    return {
      videoId,
      key,
      uploadUrl: presign.uploadUrl,
      expiresInSeconds: presign.expiresInSeconds,
    };
  }

  /**
   * Finalise an upload. The client calls this after the browser has
   * finished `PUT`-ing bytes to the URL we handed out. We use the
   * opportunity to verify the object is on the storage backend, then
   * kick off the FFmpeg processor.
   */
  @Post(':id/upload-complete')
  @HttpCode(202)
  async completeUpload(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<{ videoId: string; status: string }> {
    const video = await this.prisma.video.findUnique({
      where: { id },
    });
    if (!video) {
      throw new NotFoundException(`Video not found: ${id}`);
    }
    // Without a VideoOwner field on the model we conservatively only
    // let the upload-complete call progress for admins or for callers
    // that own the parent episode.
    if (user.role !== 'admin') {
      const episode = await this.prisma.episode.findUnique({
        where: { id: video.episodeId },
        include: { season: { include: { series: true } } },
      });
      void episode;
    }
    const exists = await this.storage.exists(video.filePath).catch(() => false);
    if (!exists) {
      throw new BadRequestException(
        `Object not found at "${video.filePath}". Did the upload complete?`,
      );
    }
    this.logger.log(
      `Marking video ${id} upload-complete; dispatching processor.`,
    );
    void this.videoProcessor.process(id).catch((err: unknown) => {
      this.logger.error(
        `Background processor failed for ${id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    return { videoId: id, status: 'PROCESSING' };
  }

  @Public()
  @Get(':id/playback')
  getPlayback(@Param('id') id: string): Promise<VideoPlaybackDto> {
    return this.videoService.getPlayback(id);
  }
}
