/**
 * EpiReels — shared front-end types.
 *
 * These types describe the shape the React components consume. They are
 * produced by the API client in `lib/api/reels.ts`, which maps the slimmer
 * `EpisodeResponseDto` (and the new `SeriesResponseDto`) from the Nest
 * backend into the richer structures the player expects.
 *
 * Fields the API does not yet expose (likes, commentsCount, creator
 * avatar, etc.) are filled with safe defaults in the adapter — they will
 * be replaced by real values once the corresponding endpoints land.
 */

export type EpisodeStatus = "draft" | "published" | "archived";

/** One playable cut of an episode. The mobile/desktop pair lets the
 *  player pick the right aspect ratio for the device. */
export interface VideoCut {
  url: string;
  thumbnail: string;
  label: string;
  aspectRatio: "9:16" | "16:9";
}

/** Episode metadata surfaced in the player. */
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
  status: "draft" | "published" | "archived";
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

/** Comment payload for the comment drawer. */
export interface Comment {
  id: string;
  user: string;
  handle: string;
  avatar: string;
  /** Human-readable relative time. */
  time: string;
  text: string;
  likes: number;
}
