import {
  EpisodeResponseDto,
  EpisodeStatus,
} from '../../episodes/dto/episode-response.dto';

export type SeriesStatus = 'draft' | 'published' | 'archived';

/** Lightweight summary used by `GET /api/v1/series` (no episodes). */
export class SeriesSummaryDto {
  id!: string;
  title!: string;
  slug!: string;
  creator!: string;
  coverImage!: string | null;
  tagline!: string;
  genre!: string[];
  accent!: number;
  status!: SeriesStatus;
  totalEpisodes!: number;
}

/** Full series payload returned by `GET /api/v1/series/:id`. */
export class SeriesResponseDto extends SeriesSummaryDto {
  episodes!: EpisodeResponseDto[];
}

/** Re-export for backwards compatibility. */
export type { EpisodeStatus };
