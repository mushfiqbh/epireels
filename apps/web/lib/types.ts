/**
 * EpiReels — front-end type entry point.
 *
 * Wire-format DTOs (`EpisodeResponseDto`, `SeriesResponseDto`,
 * `VideoPlaybackDto`, `AdminUploadResponseDto`, `Comment`, status unions)
 * are owned by `@epireels/types` so the API and the client can never drift
 * apart. This module re-exports them and adds the front-end-only enriched
 * shapes (`Episode`, `Series`, `ReelItem`) that the React components
 * consume — these carry fields the wire doesn't expose (mobile/desktop
 * video cuts, engagement defaults, etc.) and are produced by the adapter
 * in `lib/api/reels.ts`.
 */

import type {
  Comment,
  EpisodeResponseDto,
  EpisodeStatus,
  SeriesResponseDto,
  SeriesStatus,
  VideoCut,
  VideoProcessingStatus,
} from "@epireels/types";

export type {
  Comment,
  EpisodeResponseDto,
  EpisodeStatus,
  SeriesResponseDto,
  SeriesStatus,
  VideoCut,
  VideoProcessingStatus,
};

/** One playable cut of an episode. The mobile/desktop pair lets the
 *  player pick the right aspect ratio for the device. */
export interface Episode {
  id: string;
  /** Episode number within its season (1-indexed). */
  episodeNumber: number;
  title: string;
  description: string;
  /** Human-readable duration in HH:MM:SS form (mock consumers split on
   *  ":" for the fallback readout). */
  duration: string;
  video: {
    mobile: VideoCut;
    desktop: VideoCut;
  };
  videoId?: string;
  processingStatus?: VideoProcessingStatus;
  creatorNotes: string;
  synopsis: string;
  likes: number;
  commentsCount: number;
  status: EpisodeStatus;
}

/** Show / series metadata. */
export interface Series {
  id: string;
  title: string;
  slug: string;
  /** Creator display name. */
  creator: string;
  coverImage: string;
  /** Shorter marketing copy. */
  tagline: string;
  /** Genre tags — used for chips + search filtering. */
  genre: string[];
  /** Tailwind colour index for theming accents (optional, default 0). */
  accent: number;
  status: SeriesStatus;
  /** Total number of episodes in the series. */
  totalEpisodes: number;
  /** Episodes in playback order. */
  episodes: Episode[];
}

/** A single reel feed entry — pair of series + episode + position. */
export interface ReelItem {
  series: Series;
  episode: Episode;
  episodeIndex: number;
}
