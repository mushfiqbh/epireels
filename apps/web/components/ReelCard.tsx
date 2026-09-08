"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import VideoPlayer, { type VideoHandle } from "@/components/VideoPlayer";
import OverlayControls from "@/components/OverlayControls";
import ActionRail from "@/components/ActionRail";
import type { ReelItem, Series } from "@/lib/types";

interface ReelCardProps {
  item: ReelItem;
  index: number;
  isActive: boolean;
  isNear: boolean;
  muted: boolean;
  liked: boolean;
  saved: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  /** Desktop cinematic reel renders the 16:9 landscape cut. */
  landscape?: boolean;
  /** When true, hide the playlist button (series-mode feed). */
  seriesMode: boolean;
  onGoPrev: () => void;
  onGoNext: () => void;
  onToggleMute: () => void;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onOpenComments: () => void;
  onShare: () => void;
  onSelectEpisode: (series: Series, episodeIndex: number) => void;
  /** Render the action rail (like / comments / save / share) inside the video frame. */
  showActionRail?: boolean;
  /** Desktop only — true while theatre mode is active (stage spans the tab). */
  theatre?: boolean;
  /** Desktop only — toggle the cinema / theatre layout. */
  onToggleTheatre?: () => void;
  /** Whether the surrounding app is currently displayed in fullscreen. */
  isFullscreen?: boolean;
  /** Toggle the browser's fullscreen view. */
  onToggleFullscreen?: () => void;
}

/**
 * One snap-scroll slide.
 *
 * Memory-light rendering: only the active slide and its immediate
 * neighbours mount a <video> element — everything else renders a cheap
 * poster placeholder (same slide height, so the scroll metrics never
 * shift).
 */
export default function ReelCard({
  item,
  index,
  isActive,
  isNear,
  muted,
  liked,
  saved,
  canGoPrev,
  canGoNext,
  landscape = false,
  seriesMode,
  onGoPrev,
  onGoNext,
  onToggleMute,
  onToggleLike,
  onToggleSave,
  onOpenComments,
  onShare,
  onSelectEpisode,
  showActionRail = true,
  theatre = false,
  onToggleTheatre,
  isFullscreen = false,
  onToggleFullscreen,
}: ReelCardProps) {
  const videoRef = useRef<VideoHandle>(null);
  // Tracks whether the video control bar is currently on screen so the
  // info overlay can slide down when it auto-hides on desktop.
  const [controlsVisible, setControlsVisible] = useState(true);

  return (
    <div
      data-reel-index={index}
      className="relative h-full w-full snap-start snap-always overflow-hidden bg-transparent"
    >
      {isNear ? (
        <VideoPlayer
          ref={videoRef}
          episode={item.episode}
          isActive={isActive}
          isNear={isNear}
          muted={muted}
          landscape={landscape}
          onControlsVisibleChange={setControlsVisible}
          onToggleMute={onToggleMute}
          theatre={theatre}
          onToggleTheatre={onToggleTheatre}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
        />
      ) : (
        // Lightweight poster placeholder for distant slides.
        <div className="absolute inset-0 bg-black">
          <Image
            src={item.episode.video[landscape ? "desktop" : "mobile"].thumbnail}
            alt={item.episode.title}
            fill
            sizes="(min-width: 768px) 1040px, (max-width: 448px) 100vw, 448px"
            className="object-contain opacity-80"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-black/40" />
          <div className="absolute inset-x-0 bottom-4 flex items-center gap-2 px-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 backdrop-blur-md">
              <Play className="h-3.5 w-3.5 fill-white text-white" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-white">
                {item.series.title}
              </p>
              <p className="truncate text-[11px] text-white/60">
                EP {item.episode.episodeNumber} · {item.episode.title}
              </p>
            </div>
          </div>
        </div>
      )}

      {isActive && (
        <OverlayControls
          item={item}
          controlsVisible={controlsVisible}
          seriesMode={seriesMode}
          onSelectEpisode={onSelectEpisode}
        />
      )}

      {/* Action rail — painted inside the slide on every viewport so the
          heart / comments / save / share icons sit on top of the video
          frame instead of as a sibling column. Positioned bottom-right,
          above the bottom info overlay. */}
      {isActive && showActionRail && (
        <div className="pointer-events-none absolute inset-y-0 right-2 z-20 flex items-end justify-end pb-20 md:right-4 md:pb-6">
          <div className="pointer-events-auto">
            <ActionRail
              item={item}
              liked={liked}
              saved={saved}
              onToggleLike={onToggleLike}
              onToggleSave={onToggleSave}
              onOpenComments={onOpenComments}
              onShare={onShare}
            />
          </div>
        </div>
      )}
    </div>
  );
}
