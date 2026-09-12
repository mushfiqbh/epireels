import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.interface';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import { Inject } from '@nestjs/common';
import { VideoPlaybackDto } from './video.types';

@Injectable()
export class VideoService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  async getPlayback(videoId: string): Promise<VideoPlaybackDto> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
    });
    if (!video) throw new NotFoundException(`Video not found: ${videoId}`);

    const result: VideoPlaybackDto = {
      videoId: video.id,
      status: video.processingStatus,
    };
    if (video.processingStatus === 'READY') {
      const hasPoster = video.thumbnailPath
        ? await this.storage.exists(video.thumbnailPath)
        : false;
      const hasManifest = video.streamPath
        ? await this.storage.exists(video.streamPath)
        : false;
      if (!hasPoster || !hasManifest) {
        return {
          videoId: video.id,
          status: 'FAILED',
          error: 'Processed media files are missing from storage.',
        };
      }
      if (video.thumbnailPath)
        result.posterUrl = this.withVideoVersion(
          this.storage.getUrl(video.thumbnailPath),
          video.id,
        );
      if (video.streamPath)
        result.manifestUrl = this.withVideoVersion(
          this.storage.getUrl(video.streamPath),
          video.id,
        );
    }
    if (video.processingStatus === 'FAILED' && video.processingError) {
      result.error = video.processingError;
    }
    return result;
  }

  private withVideoVersion(url: string, videoId: string): string {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${encodeURIComponent(videoId)}`;
  }
}
