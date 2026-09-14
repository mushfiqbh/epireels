/**
 * @epireels/types
 *
 * Cross-app shared types. Every constant here is consumed by at least one of
 * `apps/web`, `apps/api`, or `apps/mobile`. Keep this package dependency-free
 * so it never bloats the install graph.
 */

// ─── Generic API envelopes ─────────────────────────────────────────────────

/** Standard JSON response envelope returned by every API endpoint. */
export interface ApiResponse<T> {
  data: T;
  meta?: ResponseMeta;
}

/** Optional pagination / timing metadata attached to API responses. */
export interface ResponseMeta {
  requestId?: string;
  /** ISO-8601 timestamp at which the server produced the response. */
  timestamp?: string;
  pagination?: Pagination;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

// ─── Error handling ────────────────────────────────────────────────────────

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE_ENTITY"
  | "INTERNAL_SERVER_ERROR";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  /** Optional machine-readable field path (e.g. `"user.email"`). */
  field?: string;
  details?: Record<string, unknown>;
}

// ─── Domain primitives ─────────────────────────────────────────────────────

export type ID = string & { readonly __brand: "ID" };

/** Create a branded ID — use this at the boundary, not the type itself. */
export const asId = (value: string): ID => value as ID;

export type ISODateString = string & { readonly __brand: "ISODateString" };

// ─── User ──────────────────────────────────────────────────────────────────

export interface User {
  id: ID;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt: ISODateString;
}

export type UserRole = "admin" | "member" | "guest";

export interface PublicUser
  extends Pick<User, "id" | "displayName" | "avatarUrl"> {}

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface AuthSession {
  user: PublicUser;
  accessToken: string;
  refreshToken?: string;
  expiresAt: ISODateString;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SignupInput extends LoginInput {
  displayName: string;
}

// ─── Health (used by uptime probes & the web "system status" page) ────────

export interface HealthSnapshot {
  status: "ok" | "degraded" | "down";
  uptimeSeconds: number;
  timestamp: ISODateString;
  nodeEnv: "development" | "test" | "production";
  storageDriver?: string;
  version?: string;
}

// ─── Feature flags ────────────────────────────────────────────────────────

export interface FeatureFlags {
  /** Server-side override map; `null` = use client default. */
  overrides?: Record<string, boolean | string | number | null> | null;
}

// ─── Versioning ────────────────────────────────────────────────────────────

export interface BuildInfo {
  /** SemVer of the deployed build. */
  version: string;
  /** Short git SHA. */
  commit: string;
  /** ISO-8601 build timestamp. */
  builtAt: ISODateString;
}

// ─── Content domains (shared between api + web + mobile) ───────────────────
//
// These types describe the wire shape returned by the public API. Both
// `apps/api` (Nest controllers/services) and `apps/web` (Next.js client +
// React components) import them from this package so the front-end and the
// back-end can never drift apart silently.

/** Lifecycle of a single Episode / Series row. */
export type EpisodeStatus = "draft" | "published" | "archived";
export type SeriesStatus = "draft" | "published" | "archived";

/** Asynchronous video-processing state (Prisma `Video.processingStatus`). */
export type VideoProcessingStatus =
  | "UPLOADED"
  | "PROCESSING"
  | "READY"
  | "FAILED";

/** Single playable render of a video. The mobile/desktop pair lets the
 *  player pick the right aspect ratio for the device. */
export interface VideoCut {
  url: string;
  thumbnail: string;
  label: string;
  aspectRatio: "9:16" | "16:9";
}

/** Media row attached to an Episode (Prisma `Video`). */
export interface VideoMediaDto {
  id: string;
  url: string;
  type: string;
  processingStatus: VideoProcessingStatus | string;
}

/** Episode metadata surfaced in the player / feed. */
export interface EpisodeResponseDto {
  id: string;
  title: string;
  /** Episode number within its season (1-indexed). */
  number: number;
  /** Duration in seconds. */
  duration?: number;
  status: EpisodeStatus;
  video: VideoMediaDto | null;
  /** Public URL for the episode poster / thumbnail. */
  thumbnailUrl: string | null;
  /** Short description / show-notes for the episode. */
  synopsis?: string | null;
  /** Like count. Optional — back-end fills defaults when absent. */
  likes?: number;
  /** Comment count. Optional. */
  commentsCount?: number;
  /** Creator / author display name. */
  creator?: string;
}

/** Lightweight series summary used by `GET /api/v1/series` (no episodes). */
export interface SeriesSummaryDto {
  id: string;
  title: string;
  slug: string;
  creator: string;
  coverImage: string | null;
  tagline: string;
  genre: string[];
  /** Tailwind accent index used by the front-end for theming. */
  accent: number;
  status: SeriesStatus;
  /** Total number of episodes in the series. */
  totalEpisodes: number;
}

/** Full series payload returned by `GET /api/v1/series/:id`. */
export interface SeriesResponseDto extends SeriesSummaryDto {
  episodes: EpisodeResponseDto[];
}

/** Playback manifest returned by `GET /api/v1/videos/:id/playback`. */
export interface VideoPlaybackDto {
  videoId: string;
  status: VideoProcessingStatus | string;
  posterUrl?: string;
  manifestUrl?: string;
  error?: string;
}

/** Response payload returned by `POST /api/v1/admin/uploads`. */
export interface AdminUploadResponseDto {
  videoId: string;
  /** Storage key the file was written to. */
  key: string;
  /** Public URL the media controller will serve. */
  url: string;
  mimeType: string;
  size: number;
  /** Duration in seconds probed from the upload (0 for non-MP4). */
  durationSeconds: number;
  width: number;
  height: number;
  processingStatus: VideoProcessingStatus | string;
  /** Episode the uploaded video was attached to, if any. */
  episode?: {
    id: string;
    title: string;
    seriesId: string;
  };
}

/** Comment payload for the comment drawer / feed. */
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
