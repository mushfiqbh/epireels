"use client";

import { useEffect, useRef, type RefObject } from "react";
import ReelCard from "@/components/ReelCard";
import type { ReelItem, Series } from "@/lib/types";

interface ReelFeedProps {
  /** The scroll container — owned by the app shell so it can jump slides. */
  containerRef: RefObject<HTMLDivElement | null>;
  items: ReelItem[];
  activeIndex: number;
  muted: boolean;
  likedIds: Set<string>;
  savedIds: Set<string>;
  /** Desktop cinematic reel renders 16:9 landscape cuts. */
  landscape?: boolean;
  /** When true, hide the playlist button (series-mode feed). */
  seriesMode: boolean;
  onActiveIndexChange: (index: number) => void;
  onGoPrev: () => void;
  onGoNext: () => void;
  onToggleLike: (episodeId: string) => void;
  onToggleSave: (episodeId: string) => void;
  onToggleMute: () => void;
  onOpenComments: (episodeId: string) => void;
  onShare: (item: ReelItem) => void;
  onSelectEpisode: (series: Series, episodeIndex: number) => void;
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
 * Virtual snap-scroll feed.
 *
 * - `snap-y snap-mandatory` gives buttery full-slide snapping.
 * - An IntersectionObserver (rooted at the scroll container) tracks which
 *   slide is on screen and promotes it to `activeIndex` — the single
 *   source of truth for autoplay/pause across all reels.
 */
export default function ReelFeed({
  containerRef,
  items,
  activeIndex,
  muted,
  likedIds,
  savedIds,
  landscape = false,
  seriesMode,
  onActiveIndexChange,
  onGoPrev,
  onGoNext,
  onToggleLike,
  onToggleSave,
  onToggleMute,
  onOpenComments,
  onShare,
  onSelectEpisode,
  theatre = false,
  onToggleTheatre,
  isFullscreen = false,
  onToggleFullscreen,
}: ReelFeedProps) {
  // Keep the latest callback available to the observer without
  // re-creating the observer on every render.
  const activeIndexChangeRef = useRef(onActiveIndexChange);
  useEffect(() => {
    activeIndexChangeRef.current = onActiveIndexChange;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const slides = Array.from(
      container.querySelectorAll<HTMLElement>("[data-reel-index]")
    );

    const observer = new IntersectionObserver(
      (entries) => {
        let best: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (
            entry.isIntersecting &&
            (!best || entry.intersectionRatio > best.intersectionRatio)
          ) {
            best = entry;
          }
        }
        console.warn(
          "[EpiReels:obs] scrollTop=", container.scrollTop,
          "entries=", entries.map((e) => ({ i: (e.target as HTMLElement).dataset.reelIndex, r: Math.round(e.intersectionRatio * 100) / 100, vis: e.isIntersecting })),
          "best=", best ? (best.target as HTMLElement).dataset.reelIndex : null
        );
        if (best) {
          const index = Number(
            (best.target as HTMLElement).dataset.reelIndex
          );
          activeIndexChangeRef.current(index);
        }
      },
      { root: container, threshold: 0.5 }
    );

    slides.forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, [items, containerRef]);

  return (
    <div
      ref={containerRef}
      className="no-scrollbar relative min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain bg-black"
    >
      {items.map((item, index) => (
        <ReelCard
          key={item.episode.id}
          item={item}
          index={index}
          isActive={index === activeIndex}
          isNear={Math.abs(index - activeIndex) <= 1}
          muted={muted}
          liked={likedIds.has(item.episode.id)}
          saved={savedIds.has(item.episode.id)}
          canGoPrev={index > 0}
          canGoNext={index < items.length - 1}
          landscape={landscape}
          seriesMode={seriesMode}
          onGoPrev={onGoPrev}
          onGoNext={onGoNext}
          onToggleMute={onToggleMute}
          onToggleLike={() => onToggleLike(item.episode.id)}
          onToggleSave={() => onToggleSave(item.episode.id)}
          onOpenComments={() => onOpenComments(item.episode.id)}
          onShare={() => onShare(item)}
          onSelectEpisode={onSelectEpisode}
          theatre={theatre}
          onToggleTheatre={onToggleTheatre}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
        />
      ))}
    </div>
  );
}
