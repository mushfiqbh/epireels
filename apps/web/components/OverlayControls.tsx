"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import Image from "next/image";
import type { ReelItem, Series } from "@/lib/types";

interface OverlayControlsProps {
  item: ReelItem;
  /** False while the video control bar is auto-hidden on desktop. */
  controlsVisible: boolean;
  /** When true, the series-mode feed hides the playlist button. */
  seriesMode: boolean;
  onSelectEpisode: (series: Series, episodeIndex: number) => void;
}

/**
 * In-video UI overlay for the active reel:
 * - bottom gradient with series + episode info and the playlist button
 *
 * The right-side action rail (like / comments / bookmark / share / creator)
 * is rendered as an absolute overlay inside <ReelCard /> so it sits on
 * top of the video frame on both desktop and mobile.
 */
export default function OverlayControls({
  item,
  controlsVisible,
  seriesMode,
  onSelectEpisode,
}: OverlayControlsProps) {
  const { series, episode } = item;
  const [synopsisOpen, setSynopsisOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);

  // Up to the next 3 episodes of this series (falls back to the first
  // three when the active episode is already the last one).
  const activeEpisodeIndex = series.episodes.findIndex(
    (ep) => ep.id === episode.id
  );
  const nextEpisodes = series.episodes.slice(
    activeEpisodeIndex + 1,
    activeEpisodeIndex + 4
  );
  const upNext =
    nextEpisodes.length > 0 ? nextEpisodes : series.episodes.slice(0, 3);

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* ── Info overlay: bottom sheet — same layout on every viewport ── */}
      {/* Slides down when the video control bar auto-hides on desktop. */}
      <div
        className={`absolute inset-x-0 bottom-0 z-10 px-4 pt-24 transition-[padding] duration-300 ${
+          controlsVisible ? "pb-20 md:pb-3" : "pb-3"
        }`}
      >
        {/* Up-next episodes — inline row of small image-title cards. */}
        {!seriesMode && playlistOpen && (
          <div className="pointer-events-auto -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 pr-16 scrollbar-none md:pr-6">
            {upNext.map((ep) => {
              const isCurrent = ep.id === episode.id;
              return (
                <button
                  key={ep.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEpisode(series, series.episodes.indexOf(ep));
                    setPlaylistOpen(false);
                  }}
                  className="group w-28 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-black/50 text-left backdrop-blur-sm transition-transform hover:scale-[1.03] active:scale-[0.97]"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-white/5">
                    <Image
                      src={ep.video.mobile.thumbnail}
                      alt={ep.title}
                      fill
                      sizes="112px"
                      className="object-cover"
                    />
                    {isCurrent && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                        <span className="rounded-full bg-yt-red px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                          Playing
                        </span>
                      </div>
                    )}
                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold tracking-wider text-white/90">
                      EP {String(ep.episodeNumber).padStart(2, "0")}
                    </span>
                  </div>
                  <p className="truncate px-1.5 py-1.5 text-[11px] font-semibold text-white/90">
                    {ep.title}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-bold tracking-tight text-white">
            {series.title}
          </h2>
          {!seriesMode ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPlaylistOpen((open) => !open);
              }}
              aria-expanded={playlistOpen}
              aria-label={
                playlistOpen ? "Hide up next episodes" : "Show up next episodes"
              }
              className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-white/25 bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/90 backdrop-blur-sm transition-colors hover:border-white/45 hover:bg-black/55 active:scale-[0.97]"
            >
              EP {String(episode.episodeNumber).padStart(2, "0")} /{" "}
              {String(series.totalEpisodes).padStart(2, "0")}
              {playlistOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronUp className="h-3 w-3" />
              )}
            </button>
          ) : (
            <span className="rounded-full border border-white/25 bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/90 backdrop-blur-sm">
              EP {String(episode.episodeNumber).padStart(2, "0")} /{" "}
              {String(series.totalEpisodes).padStart(2, "0")}
            </span>
          )}
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
