"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent,
  type Ref,
} from "react";
import { Maximize2, Minimize2, Pause, Play, RectangleHorizontal, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";
import type { Episode } from "@/lib/types";
import { clamp, formatTime } from "@/lib/utils";

export interface VideoHandle {
  /** Seek to a fraction of the video's duration (0 → 1). */
  seek: (fraction: number) => void;
  /** Skip forward (+) or backward (−) by a number of seconds. */
  skip: (seconds: number) => void;
}

interface VideoPlayerProps {
  ref?: Ref<VideoHandle>;
  episode: Episode;
  isActive: boolean;
  isNear: boolean;
  muted: boolean;
  /** Render the 16:9 landscape cut (desktop cinematic reel). */
  landscape?: boolean;
  /** Fires whenever the bottom control bar becomes visible/hidden. */
  onControlsVisibleChange?: (visible: boolean) => void;
  /** Toggles audio for the active reel. */
  onToggleMute?: () => void;
  /** Desktop only — true while theatre mode is active (stage spans the tab). */
  theatre?: boolean;
  /** Desktop only — toggle the cinema / theatre layout (ignored on mobile). */
  onToggleTheatre?: () => void;
  /** Whether the surrounding app is currently displayed in fullscreen. */
  isFullscreen?: boolean;
  /** Toggle the browser's fullscreen view. */
  onToggleFullscreen?: () => void;
}

/** Seconds to jump for the forward/backward skip buttons. */
const SKIP_SECONDS = 10;
/** Desktop-only: auto-hide the control bar after this idle time. */
const IDLE_HIDE_MS = 2600;

/**
 * The <video> wrapper for a single reel slide.
 *
 * - Autoplays when the slide becomes active (muted by default so the
 *   browser's autoplay policy is satisfied).
 * - Pauses whenever the slide leaves the active index — off-screen reels
 *   never keep decoding.
 * - Single tap toggles play/pause.
 * - Top-left: mute/unmute toggle. Bottom control bar: play/pause, ±10s
 *   forward/backward skip, a clickable/draggable progress bar and a time
 *   readout. Always visible on mobile; on desktop they auto-hide while
 *   playing and reappear on hover / while paused.
 * - Keyboard (active slide only): ← / → skip ±10s, Space toggles play.
 */
export default function VideoPlayer({
  ref,
  episode,
  isActive,
  isNear,
  muted,
  landscape = false,
  onControlsVisibleChange,
  onToggleMute,
  theatre = false,
  onToggleTheatre,
  isFullscreen = false,
  onToggleFullscreen,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDesktop = useRef(false);

  const [userPaused, setUserPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [dragging, setDragging] = useState(false);
  /**
   * Intrinsic aspect ratio of the loaded video (width / height), tagged with
   * the source it came from so an old cut is never used for a new one.
   */
  const [measuredAspect, setMeasuredAspect] = useState<{
    src: string;
    ratio: number;
  } | null>(null);

  // Every episode carries both cuts in one object — pick the cut that
  // matches the current view: 16:9 on desktop, 9:16 on mobile.
  const { url: src, thumbnail: poster } =
    episode.video[landscape ? "desktop" : "mobile"];

  // Fallback readout before <video> metadata arrives (episode.duration).
  const fallbackDuration = episode.duration
    .split(":")
    .reduce((acc, part) => acc * 60 + Number(part), 0);

  // Reset progress state whenever the playing source changes so a new
  // slide never inherits the previous reel's currentTime / duration
  // (and gets stuck at "0:00 / 0:00" if the new src fails to load).
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setBufferedEnd(0);
  }, [src, episode.id, landscape]);

  // Controls stay pinned open on mobile; auto-hide only applies ≥768px.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => (isDesktop.current = mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Keep play/pause + mute in sync with the surrounding state.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    if (isActive && !userPaused) {
      // Unmute happens inside a user gesture, so this play() is allowed.
      console.warn("[EpiReels:play] trying", episode.id, "muted=", muted);
      video.play().then(() => {
        console.warn("[EpiReels:play] playing", episode.id);
      }).catch((err) => {
        console.warn("[EpiReels:play] REJECTED", episode.id, err.name, err.message);
      });
    } else {
      console.warn("[EpiReels:play] pausing", episode.id);
      video.pause();
    }
  }, [isActive, userPaused, muted, episode.id]);

  // ── Seeking ───────────────────────────────────────────────────
  const seekToFraction = useCallback((fraction: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = clamp(fraction, 0, 1) * video.duration;
    setCurrentTime(video.currentTime);
  }, []);

  const skip = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = clamp(video.currentTime + seconds, 0, video.duration);
    setCurrentTime(video.currentTime);
  }, []);

  useImperativeHandle(ref, () => ({ seek: seekToFraction, skip }));

  // ── Control-bar visibility ────────────────────────────────────
  // Auto-hide on every viewport once playback is active and the user
  // has gone idle for IDLE_HIDE_MS. `userPaused` keeps the bar pinned
  // open via `controlsVisible` below, so paused reels still show the
  // transport controls without us having to special-case the timer.
  const showControls = useCallback(() => {
    setControlsHidden(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    // Don't arm the hide timer while paused — the bar should stay
    // visible until the user explicitly taps play again.
    if (userPausedRef.current) return;
    idleTimer.current = setTimeout(() => setControlsHidden(true), IDLE_HIDE_MS);
  }, []);

  useEffect(() => {
    if (!isActive) return;
    // Wake the bar up whenever the slide becomes active. Deferred via
    // requestAnimationFrame so the state reset doesn't run synchronously
    // inside the effect (avoids cascading renders on mount).
    const raf = requestAnimationFrame(() => showControls());
    return () => {
      cancelAnimationFrame(raf);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [isActive, showControls]);

  const togglePlay = useCallback(() => {
    setUserPaused((paused) => !paused);
    showControls();
  }, [showControls]);

  // Paused slides keep the controls + center play button visible.
  const controlsVisible = userPaused || !controlsHidden;

  // Let the sibling info overlay know when the bar auto-hides on
  // desktop so it can slide down into the freed space. Defer via
  // requestAnimationFrame to avoid synchronous setState during effect execution.
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      onControlsVisibleChange?.(controlsVisible);
    });
    return () => cancelAnimationFrame(handle);
  }, [controlsVisible, onControlsVisibleChange]);

  // Keyboard seeking — only the active slide listens.
  const togglePlayRef = useRef(togglePlay);
  useEffect(() => {
    togglePlayRef.current = togglePlay;
  });
  // Mirror `userPaused` so the auto-hide timer can read the latest
  // value without having to be re-created on every pause/resume
  // (which would otherwise cancel and re-arm the timer constantly).
  const userPausedRef = useRef(userPaused);
  useEffect(() => {
    userPausedRef.current = userPaused;
  });
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        skip(e.key === "ArrowLeft" ? -SKIP_SECONDS : SKIP_SECONDS);
        showControls();
      } else if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        togglePlayRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive, skip, showControls]);

  // ── Mobile orientation lock ──────────────────────────────────
  // Tapping the fullscreen button on mobile rotates the device to
  // landscape via `screen.orientation.lock()`. The lock MUST be
  // requested inside a user gesture, so it fires from the click
  // handler below; the matching unlock runs from a `useEffect` so it
  // also covers exits triggered by Esc / system UI (not just our
  // button).
  type LockableOrientation = ScreenOrientation & {
    lock?: (orientation: "landscape" | "portrait") => Promise<void>;
    unlock?: () => void;
  };
  const orientationApi =
    typeof screen !== "undefined"
      ? (screen.orientation as LockableOrientation | undefined)
      : undefined;

  const handleFullscreenClick = useCallback(() => {
    if (isDesktop.current || isFullscreen) {
      onToggleFullscreen?.();
      return;
    }
    try {
      const promise = orientationApi?.lock?.("landscape");
      promise?.catch((err: Error) =>
        console.warn("[EpiReels:orientation] lock failed", err)
      );
    } catch (err) {
      console.warn("[EpiReels:orientation] lock failed", err);
    }
    onToggleFullscreen?.();
  }, [isFullscreen, onToggleFullscreen, orientationApi]);

  useEffect(() => {
    if (isFullscreen || isDesktop.current) return;
    if (!orientationApi?.unlock) return;
    try {
      orientationApi.unlock();
    } catch (err) {
      console.warn("[EpiReels:orientation] unlock failed", err);
    }
  }, [isFullscreen, orientationApi]);

  // ── Progress bar pointer handling (click + drag) ──────────────
  const updateFromPointer = useCallback(
    (clientX: number) => {
      const el = progressRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      seekToFraction((clientX - rect.left) / rect.width);
    },
    [seekToFraction]
  );

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      updateFromPointer(e.clientX);
    },
    [updateFromPointer]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      updateFromPointer(e.clientX);
    },
    [dragging, updateFromPointer]
  );

  const endDrag = useCallback(() => setDragging(false), []);

  const handleBuffered = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.buffered.length === 0) return;
    setBufferedEnd(video.buffered.end(video.buffered.length - 1));
  }, []);

  /**
   * Read the playing video's intrinsic dimensions and update the player's
   * aspect ratio. Falls back silently if the metadata hasn't been parsed yet.
   */
  const syncAspect = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    const next = w / h;
    setMeasuredAspect((prev) =>
      prev?.src === src && prev.ratio === next ? prev : { src, ratio: next }
    );
  }, [src]);

  // Keep syncAspect in sync if a resize event re-fires loadedmetadata
  // (browser quirks + HLS-style adaptive streams).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => syncAspect());
    ro.observe(video);
    return () => ro.disconnect();
  }, [syncAspect, src]);

  const aspectRatio = measuredAspect?.src === src ? measuredAspect.ratio : null;
  const fraction = duration > 0 ? clamp(currentTime / duration, 0, 1) : 0;
  const bufferedFraction =
    duration > 0 ? clamp(bufferedEnd / duration, 0, 1) : 0;

  return (
    <div
      className={`group absolute inset-0 cursor-pointer overflow-hidden bg-[#090a0f] ${
+        isFullscreen ? "p-0" : "md:p-32" }`}
      onClick={togglePlay}
      role="button"
      aria-label={userPaused ? "Play video" : "Pause video"}
      tabIndex={-1}
      onPointerMove={showControls}
    >
      {/* Sizing container — the video + overlays live inside this box,
          which sizes itself to the loaded video's intrinsic aspect ratio
          while staying fully contained in the parent slide. */}
      <div
        className="relative flex h-full w-full items-center justify-center"
        data-aspect={aspectRatio ?? "16:9"}
      >
        <div
          className="relative max-h-full max-w-full"
          style={{
            aspectRatio: aspectRatio ?? 16 / 9,
            width: aspectRatio
              ? aspectRatio >= 1
                ? "auto"
                : "100%"
              : "100%",
            height: aspectRatio
              ? aspectRatio >= 1
                ? "100%"
                : "auto"
              : "100%",
          }}
        >
          <video
            ref={videoRef}
            src={src}
            poster={poster}
            muted={muted}
            playsInline
            // `loop` is intentionally omitted: with autoplay it makes
            // `currentTime` snap back to 0 at the end of every cycle,
            // which fights the `onTimeUpdate` driven seek bar and makes
            // the UI read "0:00 / 0:00" each loop. We want the user to
            // see the progress they actually reached.
            preload={isActive ? "auto" : isNear ? "metadata" : "none"}
            crossOrigin="anonymous"
            className="absolute inset-0 h-full w-full object-contain"
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              // Some browsers emit `Infinity` for live streams before
              // the first chunk arrives; ignore that and let
              // `onDurationChange` deliver the real value.
              if (Number.isFinite(d) && d > 0) {
                setDuration(d);
              }
              syncAspect();
            }}
            onDurationChange={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) {
                setDuration(d);
              }
            }}
            onProgress={handleBuffered}
            onWaiting={showControls}
            onError={(e) =>
              console.warn(
                "[EpiReels:video] error",
                episode.id,
                src,
                e.currentTarget.error,
              )
            }
          />

      {/* Top-left mute toggle — pinned to the video frame and gated by the
          same auto-hide as the rest of the controls so it disappears while
          the reel is playing on desktop. */}
      <div
        className={`absolute left-3 top-12 md:top-3 z-30 transition-opacity duration-200 ${
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <ControlButton
          label={muted ? "Unmute" : "Mute"}
          onClick={() => onToggleMute?.()}
        >
          {muted ? (
            <VolumeX className="h-5 w-5" />
          ) : (
            <Volume2 className="h-5 w-5" />
          )}
        </ControlButton>
      </div>

      {/* Center transport controls — vertically centered over the video.
          Always rendered (pointer events gated) so the pause affordance is
          available mid-playback without hunting for the small bottom button. */}
      <div
        className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-7 transition-opacity duration-200 ${
          controlsVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <ControlButton
          label={`Backward ${SKIP_SECONDS} seconds`}
          onClick={() => skip(-SKIP_SECONDS)}
        >
          <span className="relative inline-flex h-7 w-7 items-center justify-center">
            <RotateCcw className="h-7 w-7" strokeWidth={2.4} />
            <span className="absolute text-[8px] font-extrabold leading-none">
              {SKIP_SECONDS}
            </span>
          </span>
        </ControlButton>

        <ControlButton
          label={userPaused ? "Play" : "Pause"}
          onClick={togglePlay}
          size="lg"
        >
          {userPaused ? (
            <Play className="h-7 w-7 fill-current" />
          ) : (
            <Pause className="h-7 w-7 fill-current" />
          )}
        </ControlButton>

        <ControlButton
          label={`Forward ${SKIP_SECONDS} seconds`}
          onClick={() => skip(SKIP_SECONDS)}
        >
          <span className="relative inline-flex h-7 w-7 items-center justify-center">
            <RotateCw className="h-7 w-7" strokeWidth={2.4} />
            <span className="absolute text-[8px] font-extrabold leading-none">
              {SKIP_SECONDS}
            </span>
          </span>
        </ControlButton>
      </div>

      {/* ── Bottom control bar ─────────────────────────────────── */}
      <div
        className={`absolute inset-x-0 bottom-0 z-30 bg-linear-to-t from-black/85 via-black/50 to-transparent px-3 pb-2.5 pt-10 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onPointerMove={showControls}
      >
        {/* Progress / seek bar */}
        <div
          ref={progressRef}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={formatTime(currentTime)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") skip(-SKIP_SECONDS);
            if (e.key === "ArrowRight") skip(SKIP_SECONDS);
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="group/progress relative h-4 cursor-pointer touch-none select-none"
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/25">
            {/* Buffered */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/40"
              style={{ width: `${bufferedFraction * 100}%` }}
            />
            {/* Played */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-yt-red"
              style={{ width: `${fraction * 100}%` }}
            />
            {/* Thumb */}
            <div
              className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md transition-opacity ${
                dragging
                  ? "opacity-100"
                  : "opacity-0 group-hover/progress:opacity-100"
              }`}
              style={{ left: `${fraction * 100}%` }}
            />
          </div>
        </div>

        {/* Time readout + right-side controls (transport lives centered) */}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[11px] font-semibold tabular-nums text-white/85">
            {formatTime(currentTime)} / {formatTime(duration || fallbackDuration)}
          </span>

          <div className="ml-auto flex items-center gap-1">
            {/* {landscape && (
              <ControlButton
                label={theatre ? "Exit theatre mode" : "Theatre mode"}
                onClick={() => onToggleTheatre?.()}
              >
                <RectangleHorizontal className="h-5 w-5" />
              </ControlButton>
            )} */}
            <ControlButton
              label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={handleFullscreenClick}
            >
              {isFullscreen ? (
                <Minimize2 className="h-5 w-5" />
              ) : (
                <Maximize2 className="h-5 w-5" />
              )}
            </ControlButton>
          </div>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}

interface ControlButtonProps {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  size?: "sm" | "lg";
}

function ControlButton({ label, onClick, children, size = "sm" }: ControlButtonProps) {
  const sizing =
    size === "lg"
      ? "h-12 w-12 bg-black/50 hover:bg-black/80 backdrop-blur-sm"
      : "h-10 w-10 bg-black/50 hover:bg-black/70 backdrop-blur-sm";
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`pointer-events-auto flex items-center justify-center rounded-full text-white transition-colors active:scale-90 ${sizing}`}
    >
      {children}
    </button>
  );
}
