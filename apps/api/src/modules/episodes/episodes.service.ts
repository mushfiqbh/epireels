import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { StorageService } from '../storage/storage.interface';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import {
  EpisodeResponseDto,
  EpisodeStatus,
  VideoMediaDto,
} from './dto/episode-response.dto';

const ALLOWED_STATUSES: ReadonlyArray<EpisodeStatus> = [
  'draft',
  'published',
  'archived',
];

function normaliseStatus(raw: string | null | undefined): EpisodeStatus {
  const candidate = (raw ?? 'draft').toLowerCase() as EpisodeStatus;
  return ALLOWED_STATUSES.includes(candidate) ? candidate : 'draft';
}

@Injectable()
export class EpisodesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: StorageService,
  ) {}

  async findOne(id: string): Promise<EpisodeResponseDto> {
    const episode = await this.prisma.episode.findUnique({
      where: { id },
      include: {
        season: {
          include: { series: true },
        },
        videos: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!episode) {
      throw new NotFoundException(`Episode not found: ${id}`);
    }

    const firstVideo = episode.videos[0];
    const video: VideoMediaDto | null = firstVideo
      ? {
          url: this.storageService.getUrl(firstVideo.filePath),
          type: firstVideo.mimeType,
        }
      : null;

    const thumbnailUrl = episode.thumbnailUrl
      ? this.storageService.getUrl(episode.thumbnailUrl)
      : null;

    return {
      id: episode.id,
      title: episode.title,
      number: episode.episodeNumber,
      duration: episode.durationSeconds,
      status: normaliseStatus(episode.season.series.status),
      video,
      thumbnailUrl,
    };
  }
}