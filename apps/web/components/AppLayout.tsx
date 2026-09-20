"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { usePathname } from "next/navigation";
import TopNav, { type FeedMode } from "@/components/TopNav";
import BottomNav, { type BottomTab } from "@/components/BottomNav";

interface NavigationContextType {
  activeTab: BottomTab;
  mode: FeedMode;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  selectedSeriesId: string | null;
  setSelectedSeriesId: (id: string | null) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useNavigation must be used within AppLayout");
  }
  return context;
}

interface AppLayoutProps {
  children: ReactNode;
}

/**
 * AppLayout - Shared layout component with TopNav and BottomNav
 * 
 * Provides navigation state management across all pages.
 * On desktop, TopNav shows pill tabs and BottomNav is hidden.
 * On mobile, BottomNav shows tabs and TopNav shows brand + actions only.
 * Uses Next.js pathname to determine active tab.
 */
export default function AppLayout({
  children,
}: AppLayoutProps) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);

  // Determine active tab and mode from pathname
  const getActiveTabFromPath = (): BottomTab => {
    if (pathname === "/foryou") return "foryou";
    if (pathname === "/series") return "series";
    if (pathname === "/favorites") return "favourites";
    if (pathname === "/account") return "account";
    return "foryou";
  };

  const activeTab = getActiveTabFromPath();
  const mode: FeedMode = (pathname === "/series") ? "series" : "foryou";

  const contextValue: NavigationContextType = {
    activeTab,
    mode,
    searchOpen,
    setSearchOpen,
    selectedSeriesId,
    setSelectedSeriesId,
  };

  // Desktop breakpoint detection
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const update = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <NavigationContext.Provider value={contextValue}>
      <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#090a0f] text-white">
        {/* TopNav - fixed at top */}
        <div className="fixed inset-x-0 top-0 z-40">
          <TopNav
            mode={mode}
            onModeChange={() => {}}
            searchOpen={searchOpen}
            onSearchOpenChange={setSearchOpen}
            active={activeTab}
            onTabChange={undefined}
          />
        </div>

        {/* Main content area - padded for TopNav */}
        <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col overflow-hidden pt-14">
          {children}
        </div>

        {/* BottomNav - fixed at bottom on mobile */}
        {!isDesktop && (
          <div className="md:hidden">
            <BottomNav active={activeTab} onChange={() => {}} />
          </div>
        )}
      </div>
    </NavigationContext.Provider>
  );
}
