/**
 * Engagement REST adapter — likes, saves, comments.
 *
 * Every write path is keyed off `apiFetch`, so cookies + CSRF + the
 * refresh-on-401 retry flow through automatically. List endpoints return
 * the raw IDs / DTOs straight from the API.
 */

import type {
  CommentCreateInput,
  CommentDto,
  EngagementToggleInput,
  ID,
} from "@epireels/types";
import { apiFetch } from "./client";

// ─── Likes ──────────────────────────────────────────────────────────────

export async function listLikedEpisodeIds(): Promise<ID[]> {
  const { items } = await apiFetch<{ items: ID[] }>("/api/v1/likes/me");
  return items;
}

/**
/** Toggle a like on an episode and return the resulting liked-state. */
export async function toggleLike(
  input: EngagementToggleInput,
): Promise<{ liked: boolean; episodeId: ID }> {
  return apiFetch<{ liked: boolean; episodeId: ID }>("/api/v1/likes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function unlike(episodeId: ID): Promise<void> {
  await apiFetch<void>(`/api/v1/likes/${encodeURIComponent(String(episodeId))}`, {
    method: "DELETE",
  });
}

// ─── Saves ──────────────────────────────────────────────────────────────

export async function listSavedEpisodeIds(): Promise<ID[]> {
  const { items } = await apiFetch<{ items: ID[] }>("/api/v1/saves/me");
  return items;
}

export async function toggleSave(
  input: EngagementToggleInput,
): Promise<{ saved: boolean; episodeId: ID }> {
  return apiFetch<{ saved: boolean; episodeId: ID }>("/api/v1/saves", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

// ─── Comments ───────────────────────────────────────────────────────────

export async function listComments(episodeId: ID): Promise<CommentDto[]> {
  return apiFetch<CommentDto[]>(
    `/api/v1/comments?episodeId=${encodeURIComponent(String(episodeId))}`,
  );
}

export async function createComment(
  input: CommentCreateInput,
): Promise<CommentDto> {
  return apiFetch<CommentDto>("/api/v1/comments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteComment(id: ID): Promise<void> {
  await apiFetch<void>(
    `/api/v1/comments/${encodeURIComponent(String(id))}`,
    { method: "DELETE" },
  );
}

export async function toggleCommentLike(commentId: ID): Promise<{ liked: boolean }> {
  return apiFetch<{ liked: boolean }>(
    `/api/v1/comments/${encodeURIComponent(String(commentId))}/like`,
    { method: "POST" },
  );
}
