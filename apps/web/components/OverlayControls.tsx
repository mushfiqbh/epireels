"use client";

import { useState } from "react";
import Image from "next/image";
import type { ReelItem } from "@/lib/types";

interface OverlayControlsProps {
  item: ReelItem;
  /** False while the video control bar is auto-hidden on desktop. */
  controlsVisible: boolean;
  /** When true, auto-play will load the next episode from the current series. */
  seriesAutoplayEnabled: boolean;
  onToggleSeriesAutoplay: (enabled: boolean) => void;
}

/**
 * In-video UI overlay for the active reel:
 * - bottom gradient with series + episode info and series autoplay toggle
 *
 * The right-side action rail (like / comments / bookmark / share / creator)
 * is rendered as an absolute overlay inside <ReelCard /> so it sits on
 * top of the video frame on both desktop and mobile.
 */
export default function OverlayControls({
  item,
  controlsVisible,
  seriesAutoplayEnabled,
  onToggleSeriesAutoplay,
}: OverlayControlsProps) {
  const { series, episode } = item;
  const [synopsisOpen, setSynopsisOpen] = useState(false);

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* ── Info overlay: bottom sheet — same layout on every viewport ── */}
      {/* Slides down when the video control bar auto-hides on desktop. */}
      <div
        className={`absolute inset-x-0 bottom-0 z-10 px-4 pt-24 transition-[padding] duration-300 ${
          controlsVisible ? "pb-20 md:pb-3" : "pb-3"
        }`}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-bold tracking-tight text-white">
            {series.title}
          </h2>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSeriesAutoplay(!seriesAutoplayEnabled);
            }}
            aria-pressed={seriesAutoplayEnabled}
            aria-label={
              seriesAutoplayEnabled
                ? "Disable series autoplay"
                : "Enable series autoplay"
            }
            className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] backdrop-blur-sm transition-all active:scale-[0.97] ${
              seriesAutoplayEnabled
                ? "border-yt-red/60 bg-yt-red/15 text-yt-red hover:border-yt-red/80 hover:bg-yt-red/25"
                : "border-white/25 bg-black/40 text-white/90 hover:border-white/45 hover:bg-black/55"
            }`}
          >
            EP {String(episode.episodeNumber).padStart(2, "0")} /{" "}
            {String(series.totalEpisodes).padStart(2, "0")}
            <div
              className={`h-3.5 w-6 rounded-full p-0.5 transition-colors ${
                seriesAutoplayEnabled ? "bg-yt-red/30" : "bg-white/20"
              }`}
            >
              <div
                className={`h-full w-2.5 rounded-full transition-transform ${
                  seriesAutoplayEnabled ? "translate-x-2.5 bg-yt-red" : "translate-x-0 bg-white"
                }`}
              />
            </div>
          </button>
        </div>

        <h3 className="mt-1 text-xl font-bold leading-tight text-white">
          {episode.title}
        </h3>

        <div className="mt-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSynopsisOpen((open) => !open);
            }}
            aria-expanded={synopsisOpen}
            aria-label={synopsisOpen ? "Show less" : "Show more"}
            className="pointer-events-auto block w-full cursor-pointer bg-transparent p-0 text-left"
          >
            <p
              className={`text-[13px] leading-relaxed text-white/85 transition-colors hover:text-white ${
                synopsisOpen ? "" : "line-clamp-2"
              }`}
            >
              {episode.synopsis}
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
