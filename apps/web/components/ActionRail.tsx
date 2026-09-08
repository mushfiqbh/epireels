"use client";

import {
  Bookmark,
  Heart,
  MessageCircle,
  Share2,
} from "lucide-react";
import type { MouseEvent } from "react";
import type { ReelItem } from "@/lib/types";
import { formatCompact } from "@/lib/utils";

interface ActionRailProps {
  item: ReelItem;
  liked: boolean;
  saved: boolean;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onOpenComments: () => void;
  onShare: () => void;
}

/**
 * Right-side action rail for the active reel:
 * like / comments / bookmark / share / creator avatar.
 *
 * Always rendered inside the slide as an absolute overlay on top of the
 * video frame (positioning is owned by the parent in <ReelCard />).
 */
export default function ActionRail({
  item,
  liked,
  saved,
  onToggleLike,
  onToggleSave,
  onOpenComments,
  onShare,
}: ActionRailProps) {
  const { series, episode } = item;
  const likeCount = episode.likes + (liked ? 1 : 0);
  const commentCount = formatCompact(episode.commentsCount);
  // The current Series shape only carries the creator's display name
  // as a string; until an avatar URL is plumbed through, we fall back
  // to a coloured monogram circle so next/image never sees `src=""`.
  const creatorName = series.creator?.trim() || series.title;

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-2">
      <RailButton
        label={formatCompact(likeCount)}
        onClick={(e) => {
          e.stopPropagation();
          onToggleLike();
        }}
        active={liked}
        activeClass="text-red-500"
      >
        <Heart
          className={`h-5 w-5 transition-transform ${
            liked ? "animate-like-pop fill-current" : ""
          }`}
        />
      </RailButton>

      <RailButton
        label={commentCount}
        onClick={(e) => {
          e.stopPropagation();
          onOpenComments();
        }}
      >
        <MessageCircle className="h-5 w-5" />
      </RailButton>

      <RailButton
        label={saved ? "Saved" : "Save"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSave();
        }}
        active={saved}
      >
        <Bookmark
          className={`h-5 w-5 ${saved ? "fill-current" : ""}`}
        />
      </RailButton>

      <RailButton
        label="Share"
        onClick={(e) => {
          e.stopPropagation();
          onShare();
        }}
      >
        <Share2 className="h-5 w-5" />
      </RailButton>

      <div className="mt-1 flex flex-col items-center gap-1">
        <div
          aria-label={creatorName}
          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white/10 text-xs font-semibold text-white/80 ring-2 ring-white/70"
        >
          {creatorName.slice(0, 2).toUpperCase()}
        </div>
        <span className="w-14 truncate text-center text-[10px] font-medium text-white/80 drop-shadow">
          {creatorName}
        </span>
      </div>
    </div>
  );
}

interface RailButtonProps {
  label: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  activeClass?: string;
  children: React.ReactNode;
}

function RailButton({
  label,
  onClick,
  active = false,
  activeClass = "text-white",
  children,
}: RailButtonProps) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center gap-1 outline-none"
      aria-label={label}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md transition-all group-hover:bg-black/50 group-active:scale-90">
        {children}
      </span>
      <span className={`text-[11px] font-semibold ${active ? activeClass : "text-white/85"}`}>
        {label}
      </span>
    </button>
  );
}
