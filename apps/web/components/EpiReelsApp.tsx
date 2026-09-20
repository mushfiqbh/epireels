"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import ReelFeed from "@/components/ReelFeed";
import CommentDrawer from "@/components/CommentDrawer";
import SearchPage from "@/components/SearchPage";
import { clamp } from "@/lib/utils";
import { fetchForYouFeed } from "@/lib/api/reels";
import { toggleLike as apiToggleLike, toggleSave as apiToggleSave } from "@/lib/api/engagement";
import type { ReelItem, Episode } from "@/lib/types";
import type { ID } from "@epireels/types";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useNavigation } from "@/components/AppLayout";

/**
 * EpiReels — full-screen vertical reel player shell.
 *
 * Owns all cross-component state:
 * - active slide index (driven by the feed's IntersectionObserver)
 * - muted / like / save state, drawer visibility, toasts
 */
export default function EpiReelsApp() {
  const auth = useAuth();
  const { searchOpen, setSearchOpen } = useNavigation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [commentEpisode, setCommentEpisode] = useState<Episode | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [theatre, setTheatre] = useState(false);

  // ── Data (loaded from the API) ───────────────────────────────
  const [forYouReels, setForYouReels] = useState<ReelItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [seriesAutoplayEnabled, setSeriesAutoplayEnabled] = useState(false);

  // Load the For You feed
  useEffect(() => {
    let cancelled = false;
    setLoadingFeed(true);
    fetchForYouFeed()
      .then((items) => {
        if (!cancelled) setForYouReels(items);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg =
          err instanceof ApiError
            ? `Could not load feed (${err.status})`
            : "Could not load feed";
        setDataError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoadingFeed(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Desktop (≥768px) renders the always-landscape cinematic stage;
  // mobile keeps the portrait phone-frame reel.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => {
      const desktop = mq.matches;
      setIsDesktop(desktop);
      if (!desktop) setTheatre(false);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Track the browser's fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const update = () => setIsFullscreen(document.fullscreenElement !== null);
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const toggleTheatre = useCallback(() => {
    setTheatre((on) => !on);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const feedRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived feed ──────────────────────────────────────────────
  const visibleFeed = loadingFeed ? [] : forYouReels;
  const [hasReceivedFirstFeed, setHasReceivedFirstFeed] = useState(false);
  useEffect(() => {
    if (!loadingFeed && forYouReels.length > 0) {
      setHasReceivedFirstFeed(true);
    }
  }, [loadingFeed, forYouReels.length]);
  const showInitialLoader = loadingFeed && !hasReceivedFirstFeed;

  const safeIndex = Math.min(activeIndex, Math.max(0, visibleFeed.length - 1));

  // ── Scrolling helpers ─────────────────────────────────────────
  const jumpToIndex = useCallback((index: number, smooth: boolean) => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTo({
      top: index * el.clientHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  // ── Slide navigation (previous / next reel) ──────────────────
  const goToSlide = useCallback(
    (index: number) => {
      const next = clamp(index, 0, visibleFeed.length - 1);
      if (next === safeIndex) return;
      setActiveIndex(next);
      jumpToIndex(next, true);
    },
    [visibleFeed.length, safeIndex, jumpToIndex]
  );

  const goNext = useCallback(
    () => {
      if (seriesAutoplayEnabled && visibleFeed.length > 0) {
        const currentItem = visibleFeed[safeIndex];
        const currentSeries = currentItem.series;
        const currentEpisode = currentItem.episode;
        
        // Find next episode in the same series
        const currentEpisodeIndex = currentSeries.episodes.findIndex(
          (ep) => ep.id === currentEpisode.id
        );
        const nextEpisode = currentSeries.episodes[currentEpisodeIndex + 1];
        
        if (nextEpisode) {
          // Look for the next episode in the current feed
          const nextIndex = visibleFeed.findIndex(
            (item) => item.episode.id === nextEpisode.id
          );
          if (nextIndex !== -1) {
            goToSlide(nextIndex);
            return;
          }
        }
      }
      // Default behavior: go to next in feed
      goToSlide(safeIndex + 1);
    },
    [goToSlide, safeIndex, seriesAutoplayEnabled, visibleFeed]
  );

  const goPrev = useCallback(
    () => goToSlide(safeIndex - 1),
    [goToSlide, safeIndex]
  );

  // Keyboard navigation
  const goNextRef = useRef(goNext);
  const goPrevRef = useRef(goPrev);
  useEffect(() => {
    goNextRef.current = goNext;
    goPrevRef.current = goPrev;
  });

  const uiOverlayOpen = useRef(false);
  useEffect(() => {
    uiOverlayOpen.current = commentEpisode !== null || searchOpen;
  }, [commentEpisode, searchOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (uiOverlayOpen.current) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        goPrevRef.current();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        goNextRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Interactions ──────────────────────────────────────────────
  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const toggleLike = useCallback(
    (episodeId: string) => {
      auth.setLikedIds((prev) => {
        const next = new Set(prev);
        if (next.has(episodeId)) {
          next.delete(episodeId);
        } else {
          next.add(episodeId);
        }
        return next;
      });
      const id = episodeId as ID;
      if (auth.status !== "authenticated") {
        auth.requireSignIn({ kind: "toggleLike", episodeId: id });
        return;
      }
      void apiToggleLike({ episodeId: id }).catch(() => {
        auth.setLikedIds((prev) => {
          const next = new Set(prev);
          if (next.has(episodeId)) {
            next.delete(episodeId);
          } else {
            next.add(episodeId);
          }
          return next;
        });
        showToast("Couldn't update like — try again");
      });
    },
    [auth, showToast],
  );

  const toggleSave = useCallback(
    (episodeId: string) => {
      auth.setSavedIds((prev) => {
        const next = new Set(prev);
        if (next.has(episodeId)) {
          next.delete(episodeId);
        } else {
          next.add(episodeId);
        }
        return next;
      });
      const id = episodeId as ID;
      if (auth.status !== "authenticated") {
        auth.requireSignIn({ kind: "toggleSave", episodeId: id });
        return;
      }
      void apiToggleSave({ episodeId: id }).catch(() => {
        auth.setSavedIds((prev) => {
          const next = new Set(prev);
          if (next.has(episodeId)) {
            next.delete(episodeId);
          } else {
            next.add(episodeId);
          }
          return next;
        });
        showToast("Couldn't update save — try again");
      });
    },
    [auth, showToast],
  );

  const handleShare = useCallback(
    async (item: ReelItem) => {
      const url = `https://epireels.app/reel/${item.episode.id}`;
      const title = `${item.episode.title} — ${item.series.title}`;
      try {
        if (typeof navigator !== "undefined" && navigator.share) {
          await navigator.share({ title, url });
        } else {
          await navigator.clipboard.writeText(url);
          showToast("Link copied to clipboard");
        }
      } catch {
        // User dismissed the native share sheet — no-op.
      }
    },
    [showToast]
  );

  const handleOpenComments = useCallback(
    (episodeId: string) => {
      const id = episodeId as ID;
      for (const item of forYouReels) {
        if (item.episode.id === episodeId) {
          setCommentEpisode(item.episode);
          if (auth.status !== "authenticated") {
            auth.requireSignIn({
              kind: "openComments",
              episodeId: id,
            });
          }
          return;
        }
      }
    },
    [forYouReels, auth]
  );

  const closeComments = useCallback(() => {
    setCommentEpisode(null);
  }, []);

  const handleSelectEpisode = useCallback(() => {
    // No-op - episodic logic removed
  }, []);
const handleToggleSeriesAutoplay = useCallback((enabled: boolean) => {
    setSeriesAutoplayEnabled(enabled);
  }, []);

  
  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="relative flex min-h-0 flex-1 flex-col">
        {showInitialLoader && (
          <div
            className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#090a0f]"
            role="status"
            aria-live="polite"
            aria-label="Loading reels"
          >
            <Loader2 className="h-10 w-10 animate-spin text-white/80" />
            <span className="text-sm font-medium tracking-wide text-white/65">
              Loading reels…
            </span>
          </div>
        )}
        <ReelFeed
          containerRef={feedRef}
          items={visibleFeed}
          activeIndex={safeIndex}
          muted={muted}
          likedIds={auth.likedIds}
          savedIds={auth.savedIds}
          landscape={isDesktop}
          seriesAutoplayEnabled={seriesAutoplayEnabled}
          onToggleSeriesAutoplay={handleToggleSeriesAutoplay}
          onActiveIndexChange={setActiveIndex}
          onGoPrev={goPrev}
          onGoNext={goNext}
          onToggleLike={toggleLike}
          onToggleSave={toggleSave}
          onToggleMute={() => setMuted((m) => !m)}
          onOpenComments={handleOpenComments}
          onShare={handleShare}
          theatre={isDesktop && theatre}
          onToggleTheatre={toggleTheatre}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      </div>

      {commentEpisode ? (
        <div className="absolute inset-x-0 bottom-0 z-40 h-[70%] w-full md:inset-x-auto md:inset-y-0 md:right-0 md:h-full md:w-[min(42%,440px)] md:shadow-[-20px_0_60px_-20px_rgba(0,0,0,0.9)]">
          <CommentDrawer
            key={commentEpisode.id}
            episode={commentEpisode}
            onClose={closeComments}
          />
        </div>
      ) : null}

      <div
        className={`pointer-events-none absolute inset-x-0 bottom-7 z-50 flex justify-center transition-all duration-300 md:hidden ${
          toast
            ? "translate-y-0 opacity-100"
            : "translate-y-3 opacity-0"
        }`}
      >
        <div className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black shadow-xl">
          {toast}
        </div>
      </div>

      {searchOpen && (
        <SearchPage
          onSelectSeries={() => {}}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  );
}

