/**
 * EpiReels — reels API adapter.
 *
 * Maps the slimmer Nest `EpisodeResponseDto` / `SeriesResponseDto`
 * payloads into the richer `Episode` / `Series` / `ReelItem` shapes the
 * React components consume.
 *
 * Until the backend exposes likes, comments, creator, cover image, etc.
 * directly, the adapter fills those slots with safe defaults (zeros,
 * empty strings, a deterministic grey avatar) so the UI keeps rendering
 * even before those endpoints ship.
 */

import { apiFetch, ApiError } from "./client";
import type {
  Comment,
  Episode,
  EpisodeStatus,
  ReelItem,
  Series,
  VideoCut,
} from "@/lib/types";

// ── Wire-format DTOs ──────────────────────────────────────────────

export interface EpisodeMediaDto {
  url: string;
  type: string;
}

export interface EpisodeResponseDto {
  id: string;
  title: string;
  number: number;
  /** Duration in seconds. */
  duration?: number;
  status: EpisodeStatus;
  video: EpisodeMediaDto | null;
  thumbnailUrl: string | null;
  /** Synopsis / description. Optional in the wire format. */
  synopsis?: string | null;
  /** Like count. Optional. */
  likes?: number;
  /** Comment count. Optional. */
  commentsCount?: number;
}

export interface SeriesResponseDto {
  id: string;
  title: string;
  slug?: string;
  creator?: string;
  coverImage?: string | null;
  tagline?: string;
  genre?: string[];
  accent?: number;
  status?: "draft" | "published" | "archived";
  totalEpisodes?: number;
  episodes?: EpisodeResponseDto[];
}

// ── Defaults used until the API exposes the richer fields ────────

const DEFAULT_THUMBNAIL =
  "https://picsum.photos/seed/epireels-default/720/405";
const DEFAULT_AVATAR = "https://picsum.photos/seed/epireels-creator/200/200";

/** Format seconds → "HH:MM:SS" (or "MM:SS" when under an hour). */
export function formatDuration(totalSeconds?: number): string {
  if (totalSeconds === undefined || totalSeconds === null || Number.isNaN(totalSeconds)) {
    return "00:00";
  }
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Build a mobile/desktop VideoCut pair from a single API cut. Both
 *  cuts share the same URL/thumbnail today (the backend serves one
 *  encode); aspectRatio is the only thing that differs. */
function videoCutsFromDto(
  dto: EpisodeResponseDto,
): { mobile: VideoCut; desktop: VideoCut } {
  const url = dto.video?.url ?? "";
  const thumbnail = dto.thumbnailUrl ?? DEFAULT_THUMBNAIL;
  return {
    mobile: {
      url,
      thumbnail,
      label: "Mobile",
      aspectRatio: "9:16",
    },
    desktop: {
      url,
      thumbnail,
      label: "Desktop",
      aspectRatio: "16:9",
    },
  };
}

/** Map `EpisodeResponseDto` → front-end `Episode`. */
export function mapEpisode(dto: EpisodeResponseDto): Episode {
  const { mobile, desktop } = videoCutsFromDto(dto);
  return {
    id: dto.id,
    episodeNumber: dto.number,
    title: dto.title,
    description: dto.synopsis ?? "",
    duration: formatDuration(dto.duration),
    video: { mobile, desktop },
    creatorNotes: "",
    synopsis: dto.synopsis ?? "",
    likes: dto.likes ?? 0,
    commentsCount: dto.commentsCount ?? 0,
    status: dto.status,
  };
}

/** Map `SeriesResponseDto` → front-end `Series`. */
export function mapSeries(dto: SeriesResponseDto): Series {
  const episodes = (dto.episodes ?? []).map(mapEpisode);
  return {
    id: dto.id,
    title: dto.title,
    slug: dto.slug ?? dto.id,
    creator: dto.creator ?? "EpiReels",
    coverImage: dto.coverImage ?? DEFAULT_THUMBNAIL,
    tagline: dto.tagline ?? "",
    genre: dto.genre ?? [],
    accent: dto.accent ?? 0,
    status: dto.status ?? "published",
    totalEpisodes: dto.totalEpisodes ?? episodes.length,
    episodes,
  };
}

// ── High-level fetches ────────────────────────────────────────────

/** Fetch every published series (no episodes). Used by SearchPage. */
export async function fetchSeriesList(): Promise<Series[]> {
  const list = await apiFetch<SeriesResponseDto[]>("/api/v1/series");
  return list.map(mapSeries);
}

/** Fetch a single series + its episodes in playback order. */
export async function fetchSeriesWithEpisodes(id: string): Promise<Series> {
  const dto = await apiFetch<SeriesResponseDto>(`/api/v1/series/${encodeURIComponent(id)}`);
  return mapSeries(dto);
}

/** Fetch a single episode mapped to the front-end `Episode` shape. */
export async function fetchEpisode(id: string): Promise<Episode> {
  const dto = await apiFetch<EpisodeResponseDto>(
    `/api/v1/episodes/${encodeURIComponent(id)}`,
  );
  return mapEpisode(dto);
}

/** Fetch comments for an episode. The backend doesn't expose this yet
 *  so we return an empty array; the drawer gracefully shows the empty
 *  state until the endpoint ships. */
export async function fetchComments(_episodeId: string): Promise<Comment[]> {
  return [];
}

// ── Feed helpers (client-side composition from the API) ───────────

/** Build a For-You ReelItem list by interleasing episodes across every
 *  available series. */
export async function fetchForYouFeed(): Promise<ReelItem[]> {
  const seriesList = await fetchSeriesList();
  const feed: ReelItem[] = [];
  for (const summary of seriesList) {
    const full = await fetchSeriesWithEpisodes(summary.id).catch(() => summary);
    full.episodes.forEach((episode, index) => {
      feed.push({ series: full, episode, episodeIndex: index });
    });
  }
  return feed;
}

/** Build a Series-mode ReelItem list for the given series id. */
export async function fetchSeriesFeed(seriesId: string): Promise<ReelItem[]> {
  const series = await fetchSeriesWithEpisodes(seriesId);
  return series.episodes.map((episode, episodeIndex) => ({
    series,
    episode,
    episodeIndex,
  }));
}