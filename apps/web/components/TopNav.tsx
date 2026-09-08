"use client";

import { Heart, Home, ListVideo, Menu, Plus, Search, User } from "lucide-react";
import type { Series } from "@/lib/types";
import type { BottomTab } from "@/components/BottomNav";

export type FeedMode = "foryou" | "series";

interface TopNavProps {
  mode: FeedMode;
  onModeChange: (mode: FeedMode) => void;
  /** Reserved for future deep-links from the brand button. */
  onSelectSeries?: (series: Series) => void;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  /** Active bottom-nav tab — rendered as pill tabs in the header on
   *  desktop. Mobile keeps the docked BottomNav at the bottom of the
   *  phone frame, so the parent only forwards these props when the
   *  tabs should appear in the header (i.e. on desktop). */
  active?: BottomTab;
  onTabChange?: (tab: BottomTab) => void;
}

/**
 * Header chrome: brand mark + primary nav tabs + global actions.
 *
 * Layout (desktop, md+):
 *   [brand]  [For You | Series | Favourites | Account]  [search | create | menu]
 *
 * The four primary destinations that used to live in `BottomNav` are
 * promoted into the header on desktop so the player can keep the full
 * viewport height. On mobile the docked `BottomNav` stays at the
 * bottom of the phone frame and these pills are not rendered (the
 * parent passes `active` / `onTabChange` only when `isDesktop`).
 */
export default function TopNav({
  mode,
  onModeChange,
  searchOpen,
  onSearchOpenChange,
  active,
  onTabChange,
}: TopNavProps) {
  const tabClass = (isActive: boolean) =>
    `hidden md:inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold tracking-normal transition-colors ${
      isActive
        ? "bg-white text-black shadow-[0_8px_24px_-12px_rgba(241,48,58,0.45)]"
        : "bg-white/5 text-white/75 hover:bg-white/15 hover:text-white"
    }`;

  const iconClass = (isActive: boolean) =>
    `h-[18px] w-[18px] transition-transform ${
      isActive ? "scale-110" : ""
    }`;

  return (
    <header className="relative bg-transparent z-30 flex h-14 shrink-0 items-center justify-between gap-2 px-4">
      {/* Brand — square mark + wordmark, visible at every breakpoint. */}
      <button
        onClick={() => onModeChange("foryou")}
        className="flex shrink-0 items-center gap-1.5"
        aria-label="EpiReels home"
      >
        <span className="text-[14px] font-extrabold tracking-tight text-white sm:text-[15px]">
          EpiReels
        </span>
      </button>

      {/* Primary nav — promoted from BottomNav. Hidden on mobile (md:inline-flex)
          because the docked BottomNav remains in use there. */}
      {onTabChange && active && (
        <nav
          aria-label="Primary"
          className="hidden shrink-0 items-center gap-2 md:flex"
        >
          <button
            type="button"
            onClick={() => onTabChange("foryou")}
            className={tabClass(active === "foryou")}
            aria-label="For You"
            aria-current={active === "foryou" ? "page" : undefined}
          >
            <Home
              className={iconClass(active === "foryou")}
              strokeWidth={active === "foryou" ? 2.6 : 2}
            />
            <span>For You</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange("series")}
            className={tabClass(active === "series")}
            aria-label="Series"
            aria-current={active === "series" ? "page" : undefined}
          >
            <ListVideo
              className={iconClass(active === "series")}
              strokeWidth={active === "series" ? 2.6 : 2}
            />
            <span>Series</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange("favourites")}
            className={tabClass(active === "favourites")}
            aria-label="Favourites"
            aria-current={active === "favourites" ? "page" : undefined}
          >
            <Heart
              className={iconClass(active === "favourites")}
              strokeWidth={active === "favourites" ? 2.6 : 2}
            />
            <span>Favourites</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange("account")}
            className={tabClass(active === "account")}
            aria-label="Account"
            aria-current={active === "account" ? "page" : undefined}
          >
            <User
              className={iconClass(active === "account")}
              strokeWidth={active === "account" ? 2.6 : 2}
            />
            <span>Account</span>
          </button>
        </nav>
      )}

      {/* Spacer pushes the right-side actions to the end when the nav
          is not rendered (mobile) — keeps brand-left / actions-right. */}
      <div className="flex-1" />

      {/* Actions: search → create → menu */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => onSearchOpenChange(true)}
          aria-label="Open search"
          aria-expanded={searchOpen}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 active:scale-95"
        >
          <Search className="h-5 w-5" />
        </button>
        <button
          aria-label="Create"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm transition-transform hover:brightness-110 active:scale-95"
        >
          <Plus className="h-5 w-5" strokeWidth={2.75} />
        </button>
        <button
          aria-label="Menu"
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 active:scale-95"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
