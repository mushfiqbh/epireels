"use client";

import { Heart, Home, ListVideo, User } from "lucide-react";

export type BottomTab = "foryou" | "series" | "favourites" | "account";

interface BottomNavProps {
  active: BottomTab;
  onChange: (tab: BottomTab) => void;
}

/**
 * Bottom navigation shared across mobile and desktop.
 *
 * Four destinations, every tab uses a stacked icon-over-label layout:
 * - For You     → discovery feed of Episode 1 pilots
 * - Series      → sequential episode playback of the active show
 * - Favourites  → liked/saved reel rails (placeholder surface; the
 *                 parent can wire it to a sheet/drawer later)
 * - Account     → profile / settings sheet
 *
 * Mobile keeps the safe-area inset; desktop centres the row beneath
 * the cinematic stage.
 */
export default function BottomNav({ active, onChange }: BottomNavProps) {
  const tabClass = (isActive: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[10px] font-semibold tracking-wide transition-colors md:flex-none md:gap-1.5 md:rounded-2xl md:px-5 md:py-2.5 md:text-[11px] ${
      isActive
        ? "text-white md:bg-white md:text-black md:shadow-[0_8px_24px_-12px_rgba(241,48,58,0.45)]"
        : "text-white/55 hover:text-white md:bg-white/5 md:text-white/75 md:hover:bg-white/15 md:hover:text-white"
    }`;

  const iconClass = (isActive: boolean) =>
    `h-5 w-5 transition-transform md:h-[18px] md:w-[18px] ${
      isActive ? "scale-110" : ""
    }`;

  return (
    <nav
      aria-label="Primary"
      className="flex shrink-0 items-stretch justify-around gap-1 border-t border-white/10 bg-black/85 px-2 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur-xl md:justify-center md:gap-3 md:border-t-0 md:bg-transparent md:px-6 md:py-3 md:backdrop-blur-0"
    >
      <button
        type="button"
        onClick={() => onChange("foryou")}
        className={tabClass(active === "foryou")}
        aria-label="For You"
        aria-current={active === "foryou" ? "page" : undefined}
      >
        <Home className={iconClass(active === "foryou")} strokeWidth={active === "foryou" ? 2.6 : 2} />
        <span>For You</span>
      </button>

      <button
        type="button"
        onClick={() => onChange("series")}
        className={tabClass(active === "series")}
        aria-label="Series"
        aria-current={active === "series" ? "page" : undefined}
      >
        <ListVideo className={iconClass(active === "series")} strokeWidth={active === "series" ? 2.6 : 2} />
        <span>Series</span>
      </button>

      <button
        type="button"
        onClick={() => onChange("favourites")}
        className={tabClass(active === "favourites")}
        aria-label="Favourites"
        aria-current={active === "favourites" ? "page" : undefined}
      >
        <Heart className={iconClass(active === "favourites")} strokeWidth={active === "favourites" ? 2.6 : 2} />
        <span>Favourites</span>
      </button>

      <button
        type="button"
        onClick={() => onChange("account")}
        className={tabClass(active === "account")}
        aria-label="Account"
        aria-current={active === "account" ? "page" : undefined}
      >
        <User className={iconClass(active === "account")} strokeWidth={active === "account" ? 2.6 : 2} />
        <span>Account</span>
      </button>
    </nav>
  );
}
