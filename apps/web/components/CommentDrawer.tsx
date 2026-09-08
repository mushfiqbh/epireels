"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { Heart, MessageCircle, Send, X } from "lucide-react";
import { fetchComments } from "@/lib/api/reels";
import type { Comment, Episode } from "@/lib/types";
import { formatCompact } from "@/lib/utils";

const YOU_AVATAR = "https://picsum.photos/seed/you-avatar/200/200";

interface CommentDrawerProps {
  episode: Episode;
  onClose: () => void;
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
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");

  // The remote comments endpoint isn't wired up yet — fetchComments
  // returns [] — so we just render the empty state until it is.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchComments(episode.id)
      .then((list) => {
        if (cancelled) return;
        setComments(list);
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

  const toggleCommentLike = (commentId: string) => {
    setLikedComments((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setComments((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        user: "You",
        handle: "@you",
        avatar: YOU_AVATAR,
        time: "now",
        text,
        likes: 0,
      },
    ]);
    setDraft("");
  };

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
                <button
                  onClick={() => toggleCommentLike(comment.id)}
                  className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-white/50 transition-colors hover:text-white"
                  aria-label={liked ? "Unlike comment" : "Like comment"}
                >
                  <Heart
                    className={`h-3.5 w-3.5 ${
                      liked ? "animate-like-pop fill-red-500 text-red-500" : ""
                    }`}
                  />
                  {formatCompact(comment.likes + (liked ? 1 : 0))}
                </button>
              </div>
            </div>
          );
        })
        )}
      </div>

      {/* Sticky composer */}
      <form
        onSubmit={submit}
        className="flex shrink-0 items-center gap-2 border-t border-line bg-[#1c1c1c] px-3 py-3"
      >
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white/10">
          <Image
            src={YOU_AVATAR}
            alt="Your avatar"
            fill
            sizes="32px"
            className="object-cover"
          />
        </div>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
          className="h-10 min-w-0 flex-1 rounded-full border border-line bg-white/5 px-4 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send comment"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yt-red text-white transition-all enabled:hover:brightness-110 enabled:active:scale-90 disabled:opacity-30"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
