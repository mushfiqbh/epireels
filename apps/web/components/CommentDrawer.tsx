"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { Heart, LogIn, MessageCircle, Send, X } from "lucide-react";
import {
  createComment,
  deleteComment as deleteCommentRequest,
  listComments,
  toggleCommentLike,
} from "@/lib/api/engagement";
import type { CommentDto, ID } from "@epireels/types";
import type { Comment, Episode } from "@/lib/types";
import { formatCompact } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";

interface CommentDrawerProps {
  episode: Episode;
  onClose: () => void;
}

/** Fallback avatar when the author hasn't set one — keeps `next/image`
 *  from receiving `src=""`. */
const FALLBACK_AVATAR = "https://picsum.photos/seed/epireels-guest/200/200";

/** Tiny relative-time formatter — no `Intl.RelativeTimeFormat` so the
 *  SSR markup matches the client (avoids hydration mismatches). */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "just now";
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString();
}

/** Build the UI-shaped `Comment` from the server `CommentDto`. */
function toUiComment(dto: CommentDto): Comment {
  const displayName = dto.author.displayName || "EpiReels viewer";
  return {
    id: String(dto.id),
    user: displayName,
    handle: `@${displayName.toLowerCase().replace(/\s+/g, "_")}`,
    avatar: dto.author.avatarUrl ?? FALLBACK_AVATAR,
    time: formatRelative(dto.createdAt),
    text: dto.body,
    likes: dto.likes,
  };
}

/**
 * Comments panel — opens as an overlay, so the video player never
 * resizes. The app shell positions this panel on top of the player:
 * - mobile  → bottom sheet covering the lower ~70% of the stage
 * - desktop → right-docked column over the cinematic stage
 *
 * The shell keys this component by episode id, so every open remounts
 * with a fresh thread + composer (no state-reset effect needed).
 */
export default function CommentDrawer({ episode, onClose }: CommentDrawerProps) {
  const { user, status } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());

  // Initialize likedComments from the comment data
  useEffect(() => {
    const liked = new Set<string>();
    comments.forEach((comment) => {
      // We need to track which comments are liked by the current user
      // This will be populated from the DTO's likedByCurrentUser field
    });
    setLikedComments(liked);
  }, [comments]);
  const [draft, setDraft] = useState("");

  // Fetch the thread when the drawer mounts.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listComments(episode.id as ID)
      .then((dtos) => {
        if (cancelled) return;
        const uiComments = dtos.map(toUiComment);
        setComments(uiComments);
        // Set liked comments from the DTO
        const liked = new Set<string>();
        dtos.forEach((dto) => {
          if (dto.likedByCurrentUser) {
            liked.add(String(dto.id));
          }
        });
        setLikedComments(liked);
      })
      .catch(() => {
        if (cancelled) return;
        setComments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [episode.id]);

  const handleToggleLike = async (commentId: string) => {
    try {
      const result = await toggleCommentLike(commentId as ID);
      setLikedComments((prev) => {
        const next = new Set(prev);
        if (result.liked) {
          next.add(commentId);
        } else {
          next.delete(commentId);
        }
        return next;
      });
      // Update the comment's like count
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, likes: c.likes + (result.liked ? 1 : -1) }
            : c,
        ),
      );
    } catch {
      // Revert on error
      setLikedComments((prev) => {
        const next = new Set(prev);
        if (next.has(commentId)) {
          next.delete(commentId);
        } else {
          next.add(commentId);
        }
        return next;
      });
    }
  };

  const removeComment = async (commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    try {
      await deleteCommentRequest(commentId as ID);
    } catch {
      // Restore if the server rejected the delete.
      void listComments(episode.id as ID)
        .then((dtos) => setComments(dtos.map(toUiComment)))
        .catch(() => undefined);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || submitting) return;
    if (status !== "authenticated") {
      // Belt-and-braces: the composer is disabled below, but a race
      // could leave the button enabled briefly.
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const dto = await createComment({
        episodeId: episode.id,
        body: text,
      });
      setComments((prev) => [...prev, toUiComment(dto)]);
      setDraft("");
    } catch {
      setError("Couldn't post your comment — try again");
    } finally {
      setSubmitting(false);
    }
  };

  const signedIn = status === "authenticated" && user !== null;
  const composerDisabled = !signedIn || submitting;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden border-t border-line bg-[#161616] md:border-l md:border-t-0">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <MessageCircle className="h-4 w-4 shrink-0 text-white/70" />
          <h2 className="truncate text-sm font-bold text-white">
            Comments
            <span className="ml-1.5 font-medium text-white/45">
              {formatCompact(episode.commentsCount)}
            </span>
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close comments"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="shrink-0 truncate px-4 py-2 text-xs text-white/40">
        {episode.title} · EP {String(episode.episodeNumber).padStart(2, "0")}
      </p>

      {/* Thread */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {loading ? (
          <p className="py-10 text-center text-sm text-white/45">
            Loading comments…
          </p>
        ) : comments.length === 0 ? (
          <p className="py-10 text-center text-sm text-white/45">
            Be the first to comment.
          </p>
        ) : (
          comments.map((comment) => {
            const liked = likedComments.has(comment.id);
            const isAuthor = signedIn && user
              ? comment.handle === `@${user.displayName.toLowerCase().replace(/\s+/g, "_")}`
              : false;
            return (
              <div
                key={comment.id}
                className="flex items-start gap-3 border-b border-white/5 py-3"
              >
                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white/10">
                  <Image
                    src={comment.avatar}
                    alt={comment.user}
                    fill
                    sizes="36px"
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-1.5">
                    <span className="text-[13px] font-semibold text-white">
                      {comment.user}
                    </span>
                    <span className="text-[11px] text-white/40">
                      {comment.handle} · {comment.time}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-white/85">
                    {comment.text}
                  </p>
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] font-semibold text-white/50">
                    <button
                      onClick={() => handleToggleLike(comment.id)}
                      className="flex items-center gap-1.5 transition-colors hover:text-white"
                      aria-label={liked ? "Unlike comment" : "Like comment"}
                    >
                      <Heart
                        className={`h-3.5 w-3.5 ${
                          liked ? "animate-like-pop fill-red-500 text-red-500" : ""
                        }`}
                      />
                      {formatCompact(comment.likes)}
                    </button>
                    {isAuthor && (
                      <button
                        onClick={() => void removeComment(comment.id)}
                        className="transition-colors hover:text-red-400"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <p className="shrink-0 px-4 py-2 text-[11px] font-semibold text-red-400">
          {error}
        </p>
      )}

      {/* Sticky composer */}
      <form
        onSubmit={submit}
        className="flex shrink-0 items-center gap-2 border-t border-line bg-[#1c1c1c] px-3 py-3"
      >
        {signedIn && user ? (
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white/10">
            <Image
              src={user.avatarUrl ?? FALLBACK_AVATAR}
              alt={user.displayName}
              fill
              sizes="32px"
              className="object-cover"
            />
          </div>
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
            <LogIn className="h-4 w-4 text-white/60" />
          </div>
        )}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={signedIn ? "Add a comment…" : "Sign in to comment"}
          disabled={!signedIn}
          className="h-10 min-w-0 flex-1 rounded-full border border-line bg-white/5 px-4 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={composerDisabled || !draft.trim()}
          aria-label="Send comment"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yt-red text-white transition-all enabled:hover:brightness-110 enabled:active:scale-90 disabled:opacity-30"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
