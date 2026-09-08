"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import TopNav, { type FeedMode } from "@/components/TopNav";
import ReelFeed from "@/components/ReelFeed";
import CommentDrawer from "@/components/CommentDrawer";
import BottomNav, { type BottomTab } from "@/components/BottomNav";
import SearchPage from "@/components/SearchPage";
import { clamp } from "@/lib/utils";
import {
  fetchSeriesList,
  fetchSeriesWithEpisodes,
  fetchForYouFeed,
  fetchSeriesFeed,
} from "@/lib/api/reels";
import type { ReelItem, Series, Episode } from "@/lib/types";
import { ApiError } from "@/lib/api/client";

/**
 * EpiReels — full-screen vertical reel player shell.
 *
 * Owns all cross-component state:
 * - feed mode (For You discovery / Series episodic lock)
 * - active slide index (driven by the feed's IntersectionObserver)
 * - muted / like / save state, drawer visibility, toasts
 */
export default function EpiReelsApp() {
  const [mode, setMode] = useState<FeedMode>("foryou");
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<BottomTab>("foryou");
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [commentEpisode, setCommentEpisode] = useState<Episode | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Desktop-only: theatre mode widens the cinematic stage to fill the
  // viewport; auto-disabled whenever the layout drops back to mobile.
  const [theatre, setTheatre] = useState(false);

  // ── Data (loaded from the API) ───────────────────────────────
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [forYouReels, setForYouReels] = useState<ReelItem[]>([]);
  const [seriesReels, setSeriesReels] = useState<ReelItem[]>([]);
  const [loadingSeriesList, setLoadingSeriesList] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // Always keep the full series roster in sync so TopNav/SearchPage can
  // render even when the For-You feed is the visible one.
  useEffect(() => {
    let cancelled = false;
    setLoadingSeriesList(true);
    fetchSeriesList()
      .then((list) => {
        if (cancelled) return;
        setSeriesList(list);
        // Initialise the locked series once we have any candidates.
        setSelectedSeriesId((current) => current ?? list[0]?.id ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg =
          err instanceof ApiError
            ? `Could not load series (${err.status})`
            : "Could not load series";
        setDataError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoadingSeriesList(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh whichever feed is active. For-You is a single request;
  // Series mode re-fetches the full episode list for the chosen show.
  useEffect(() => {
    let cancelled = false;
    setLoadingFeed(true);
    const run = async () => {
      try {
        if (mode === "foryou") {
          const items = await fetchForYouFeed();
          if (!cancelled) setForYouReels(items);
          return;
        }
        if (!selectedSeriesId) {
          setSeriesReels([]);
          return;
        }
        const items = await fetchSeriesFeed(selectedSeriesId);
        if (!cancelled) setSeriesReels(items);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof ApiError
            ? `Could not load feed (${err.status})`
            : "Could not load feed";
        setDataError(msg);
      } finally {
        if (!cancelled) setLoadingFeed(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [mode, selectedSeriesId]);

  // Pick a fallback series once the list lands and we're in Series mode
  // without an explicit selection.
  useEffect(() => {
    if (mode === "series" && !selectedSeriesId && seriesList.length > 0) {
      setSelectedSeriesId(seriesList[0].id);
    }
  }, [mode, selectedSeriesId, seriesList]);

  // Desktop (≥768px) renders the always-landscape cinematic stage;
  // mobile keeps the portrait phone-frame reel.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => {
      const desktop = mq.matches;
      setIsDesktop(desktop);
      // Theatre is a desktop-only concept — drop it whenever the user
      // shrinks the window below the breakpoint.
      if (!desktop) setTheatre(false);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Track the browser's fullscreen state so the icon flips between
  // enter/exit and we keep it in sync if the user presses Esc.
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
      document.exitFullscreen?.().catch(() => {
        /* user agent denied — ignore */
      });
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {
        /* user agent denied — ignore */
      });
    }
  }, []);

  const feedRef = useRef<HTMLDivElement | null>(null);
  const jumpOnFeedChange = useRef<number | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived feed ──────────────────────────────────────────────
  const feed = useMemo<ReelItem[]>(
    () => (mode === "foryou" ? forYouReels : seriesReels),
    [mode, forYouReels, seriesReels]
  );

  // While the first feed fetch is in flight, show an empty list so the
  // scroller doesn't render against stale rows. Consumers (ReelFeed,
  // player) handle the empty array gracefully.
  const visibleFeed = loadingFeed ? [] : feed;
  // First-load guard: the spinner overlay only shows before the very
  // first feed payload arrives. Once we've seen any reels on this mount
  // (`hasReceivedFirstFeed`), subsequent refetches show the in-player
  // loading affordance instead of a full-stage blank screen.
  const [hasReceivedFirstFeed, setHasReceivedFirstFeed] = useState(false);
  useEffect(() => {
    if (!loadingFeed && feed.length > 0) {
      setHasReceivedFirstFeed(true);
    }
  }, [loadingFeed, feed.length]);
  const showInitialLoader = loadingFeed && !hasReceivedFirstFeed;

  const safeIndex = Math.min(activeIndex, Math.max(0, visibleFeed.length - 1));
  const commentsOpen = commentEpisode !== null;

  // ── Scrolling helpers ─────────────────────────────────────────
  const jumpToIndex = useCallback((index: number, smooth: boolean) => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTo({
      top: index * el.clientHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  // After the feed identity changes (mode / series switch), land on the
  // requested slide without an animated sweep across unrelated content.
  useEffect(() => {
    if (jumpOnFeedChange.current === null) return;
    const index = jumpOnFeedChange.current;
    jumpOnFeedChange.current = null;
    requestAnimationFrame(() => jumpToIndex(index, false));
  }, [visibleFeed, jumpToIndex]);

  // ── Navigation ────────────────────────────────────────────────
  const openSeries = useCallback(
    (series: Series, episodeIndex: number) => {
      if (mode === "series" && selectedSeriesId === series.id) {
        // Same feed — glide to the episode.
        setActiveIndex(episodeIndex);
        jumpToIndex(episodeIndex, true);
        return;
      }
      setSelectedSeriesId(series.id);
      setMode("series");
      setActiveTab("series");
      setActiveIndex(episodeIndex);
      jumpOnFeedChange.current = episodeIndex;
    },
    [mode, selectedSeriesId, jumpToIndex]
  );

  const handleModeChange = useCallback(
    (next: FeedMode) => {
      if (next === mode) return;
      setActiveTab(next);
      if (next === "foryou") {
        setMode("foryou");
        setActiveIndex(0);
        jumpOnFeedChange.current = 0;
      } else {
        // Lock into the active show's sequence, starting at the
        // episode currently on screen (or EP 1).
        const item = visibleFeed[safeIndex];
        if (item) {
          openSeries(item.series, item.episode.episodeNumber - 1);
        }
      }
    },
    [mode, visibleFeed, safeIndex, openSeries]
  );

  const handleSelectEpisode = useCallback(
    (series: Series, episodeIndex: number) => {
      openSeries(series, episodeIndex);
    },
    [openSeries]
  );

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
    () => goToSlide(safeIndex + 1),
    [goToSlide, safeIndex]
  );

  const goPrev = useCallback(
    () => goToSlide(safeIndex - 1),
    [goToSlide, safeIndex]
  );

  // Keyboard navigation: ↑ / ↓ move between reels (skipped while a
  // drawer, comment panel or search overlay is open).
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
  const toggleLike = useCallback((episodeId: string) => {
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(episodeId)) {
        next.delete(episodeId);
      } else {
        next.add(episodeId);
      }
      return next;
    });
  }, []);

  const toggleSave = useCallback((episodeId: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(episodeId)) {
        next.delete(episodeId);
      } else {
        next.add(episodeId);
      }
      return next;
    });
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

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
      // The comment drawer needs the full Episode payload (title, series
      // metadata). Walk through the cached roster — list + feeds —
      // which already carry the episode shape; we deliberately don't
      // round-trip to the API because we already have every Episode on
      // screen by id.
      for (const item of forYouReels) {
        if (item.episode.id === episodeId) {
          setCommentEpisode(item.episode);
          return;
        }
      }
      for (const item of seriesReels) {
        if (item.episode.id === episodeId) {
          setCommentEpisode(item.episode);
          return;
        }
      }
      for (const series of seriesList) {
        for (const ep of series.episodes) {
          if (ep.id === episodeId) {
            setCommentEpisode(ep);
            return;
          }
        }
      }
    },
    [forYouReels, seriesReels, seriesList]
  );

  const closeComments = useCallback(() => {
    setCommentEpisode(null);
  }, []);

  const handleSelectSeries = useCallback(
    (series: Series) => {
      openSeries(series, 0);
    },
    [openSeries]
  );

  // Bottom-nav dispatcher: the two feed tabs reuse the existing mode
  // switcher; Favourites/Account are placeholder surfaces for now.
  const handleTabChange = useCallback(
    (tab: BottomTab) => {
      setActiveTab(tab);
      if (tab === "foryou" || tab === "series") {
        handleModeChange(tab);
        return;
      }
      if (tab === "favourites") {
        showToast("Favourites coming soon");
        return;
      }
      if (tab === "account") {
        showToast("Account coming soon");
      }
    },
    [handleModeChange, showToast]
  );

  // ── Render ────────────────────────────────────────────────────
  return (
    // Single full-width / full-dvh wrapper. Every background gradient
    // (mesh glow + vignette) and click target lives on this root so taps
    // pass straight through to the player's own onClick={togglePlay}.
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#090a0f] text-white">
      {/* Desktop-only top nav — sits above the cinematic stage, full width.
          The four primary nav tabs are promoted into the header on desktop
          (the docked BottomNav lives at the bottom of the phone frame on
          mobile, so we only forward the tab props when `isDesktop`). */}
      { (
        <div className="fixed inset-x-0 top-0 z-40">
          <TopNav
            mode={mode}
            onModeChange={handleModeChange}
            onSelectSeries={handleSelectSeries}
            searchOpen={searchOpen}
            onSearchOpenChange={setSearchOpen}
            active={activeTab}
            onTabChange={handleTabChange}
          />
        </div>
      )}

      {/* Full-width, full-dvh cinematic stage. Mobile and desktop lets the video span the tab
          beneath the fixed TopNav (pt-14 = 56px header height). Comments
          open as an overlay on top of the video (bottom sheet on mobile,
          right-docked panel on desktop). */}
        <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col overflow-hidden">

        {/* Video stage. The action rail now lives inside the slide as an
            absolute overlay (handled by ReelCard) so the layout is a
            single column on every viewport. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* First-load spinner. Covers the entire stage (below the
              TopNav) until the first feed payload lands. After that,
              switching feeds reuses the in-player spinner instead of
              blanking the screen. Sits behind modal overlays (z-50) so
              the comment drawer / search still appear on top. */}
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
            likedIds={likedIds}
            savedIds={savedIds}
            landscape={isDesktop}
            seriesMode={mode === "series"}
            onActiveIndexChange={setActiveIndex}
            onGoPrev={goPrev}
            onGoNext={goNext}
            onToggleLike={toggleLike}
            onToggleSave={toggleSave}
            onToggleMute={() => setMuted((m) => !m)}
            onOpenComments={handleOpenComments}
            onShare={handleShare}
            onSelectEpisode={handleSelectEpisode}
            theatre={isDesktop && theatre}
            onToggleTheatre={toggleTheatre}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
          />
        </div>
      </div>

      {/* Mobile-only bottom navigation docked at the base of the phone
          frame. Hidden while a modal sheet (comments / search) is open
          so the player keeps full height. */}
      {!commentsOpen && !searchOpen && (
        <div className="md:hidden">
          <BottomNav active={activeTab} onChange={handleTabChange} />
        </div>
      )}

      {/* Comments — overlay on top of the player (video keeps its size):
          bottom sheet on mobile, right-docked panel on desktop. */}
      {commentsOpen && commentEpisode && (
        <div className="absolute inset-x-0 bottom-0 z-40 h-[70%] w-full md:inset-x-auto md:inset-y-0 md:right-0 md:h-full md:w-[min(42%,440px)] md:shadow-[-20px_0_60px_-20px_rgba(0,0,0,0.9)]">
          <CommentDrawer
            key={commentEpisode.id}
            episode={commentEpisode}
            onClose={closeComments}
          />
        </div>
      )}

      {/* Toast */}
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

      {/* Full-screen search surface — replaces the player while open and
          intercepts clicks until the user dismisses it (back arrow or Esc). */}
      {searchOpen && (
        <SearchPage
          onSelectSeries={handleSelectSeries}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  );
}
