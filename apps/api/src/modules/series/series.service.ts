import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import type { StorageService } from '../storage/storage.interface';
import {
  EpisodeResponseDto,
  EpisodeStatus,
  VideoMediaDto,
} from '../episodes/dto/episode-response.dto';
import {
  SeriesResponseDto,
  SeriesStatus,
  SeriesSummaryDto,
} from './dto/series-response.dto';

const ALLOWED_SERIES_STATUSES: ReadonlyArray<SeriesStatus> = [
  'draft',
  'published',
  'archived',
];

const ALLOWED_EPISODE_STATUSES: ReadonlyArray<EpisodeStatus> = [
  'draft',
  'published',
  'archived',
];

const DEFAULT_COVER = 'https://picsum.photos/seed/epireels-default/720/405';

function normaliseSeriesStatus(raw: string | null | undefined): SeriesStatus {
  const candidate = (raw ?? 'draft').toLowerCase() as SeriesStatus;
  return ALLOWED_SERIES_STATUSES.includes(candidate) ? candidate : 'draft';
}

function normaliseEpisodeStatus(raw: string | null | undefined): EpisodeStatus {
  const candidate = (raw ?? 'draft').toLowerCase() as EpisodeStatus;
  return ALLOWED_EPISODE_STATUSES.includes(candidate) ? candidate : 'draft';
}

interface SeriesRowForSummary {
  id: string;
  title: string;
  slug: string;
  thumbnailUrl: string | null;
  status: string;
  /** When undefined, `deriveSummary` leaves `totalEpisodes` at 0. */
  totalEpisodes?: number;
}

function deriveSummary(row: SeriesRowForSummary): SeriesSummaryDto {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    // The Prisma `Series` model has no `creator` / `tagline` / `genre` /
    // `accent` columns yet (a future migration will add them). Until
    // then we emit safe defaults — the slug doubles as a handle so the
    // SearchPage's filters keep matching.
    creator: row.slug,
    coverImage: row.thumbnailUrl ?? DEFAULT_COVER,
    tagline: '',
    genre: [],
    accent: 0,
    status: normaliseSeriesStatus(row.status),
    totalEpisodes: row.totalEpisodes ?? 0,
  };
}

@Injectable()
export class SeriesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  /** Build an EpisodeResponseDto from a Prisma Episode row + the
   *  parent's series status (so unpublished episodes surface as draft
   *  on the wire). */
  private toEpisodeDto(
    episode: {
      id: string;
      title: string;
      episodeNumber: number;
      description: string | null;
      thumbnailUrl: string | null;
      durationSeconds: number;
      videos: { filePath: string; mimeType: string }[];
    },
    parentStatus: string,
  ): EpisodeResponseDto {
    const firstVideo = episode.videos[0];
    const video: VideoMediaDto | null = firstVideo
      ? {
          url: this.storage.getUrl(firstVideo.filePath),
          type: firstVideo.mimeType,
        }
      : null;

    const thumbnailUrl = episode.thumbnailUrl
      ? this.storage.getUrl(episode.thumbnailUrl)
      : null;

    return {
      id: episode.id,
      title: episode.title,
      number: episode.episodeNumber,
      duration: episode.durationSeconds,
      status: normaliseEpisodeStatus(parentStatus),
      video,
      thumbnailUrl,
      synopsis: episode.description ?? '',
      likes: 0,
      commentsCount: 0,
    };
  }

  /** List every series as a lightweight summary (no episodes). */
  async findAll(): Promise<SeriesSummaryDto[]> {
    const rows = await this.prisma.series.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) =>
      deriveSummary({
        id: row.id,
        title: row.title,
        slug: row.slug,
        thumbnailUrl: row.thumbnailUrl,
        status: row.status,
      }),
    );
  }

  /** Fetch a single series with every episode (in playback order). */
  async findOne(id: string): Promise<SeriesResponseDto> {
    const row = await this.prisma.series.findUnique({
      where: { id },
      include: {
        seasons: {
          orderBy: { seasonNumber: 'asc' },
          include: {
            episodes: {
              orderBy: { episodeNumber: 'asc' },
              include: {
                videos: { orderBy: { createdAt: 'asc' } },
              },
            },
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException(`Series not found: ${id}`);
    }

    const episodes = row.seasons.flatMap((season) =>
      season.episodes.map((episode) =>
        this.toEpisodeDto(episode, row.status),
      ),
    );

    return {
      ...deriveSummary({
        id: row.id,
        title: row.title,
        slug: row.slug,
        thumbnailUrl: row.thumbnailUrl,
        status: row.status,
        totalEpisodes: episodes.length,
      }),
      episodes,
    };
  }
}