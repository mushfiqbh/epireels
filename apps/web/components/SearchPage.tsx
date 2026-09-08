"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  ChevronRight,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import { fetchSeriesList } from "@/lib/api/reels";
import type { Series } from "@/lib/types";

interface SearchPageProps {
  /** Opens the selected show's series feed. */
  onSelectSeries: (series: Series) => void;
  /** Closes the search page and returns to the player. */
  onClose: () => void;
}

/**
 * Full-screen search surface — replaces the player while open.
 *
 * - Header row: back arrow + input + clear button.
 * - Empty state: trending genre chips (derived from the dataset).
 * - Live results: filter by title, tagline, or genre as the user types.
 *   Picking a result closes the page and switches the feed to that show.
 */
export default function SearchPage({ onSelectSeries, onClose }: SearchPageProps) {
  const [query, setQuery] = useState("");
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus the field on mount so keyboard users can start typing immediately.
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  // Esc dismisses the search page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Pull the full series roster on mount. Episodes aren't needed here —
  // the result rows only show title, cover, genre and episode count.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSeriesList()
      .then((list) => {
        if (cancelled) return;
        setSeries(list);
      })
      .catch(() => {
        if (cancelled) return;
        setSeries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Trending chips — top 6 genres by show count.
  const trendingGenres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of series) {
      for (const g of s.genre) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([genre]) => genre);
  }, [series]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return series.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.tagline.toLowerCase().includes(q) ||
        s.genre.some((g) => g.toLowerCase().includes(q))
    );
  }, [query, series]);

  const pickSeries = (series: Series) => {
    onSelectSeries(series);
    onClose();
  };

  const applyChip = (genre: string) => {
    setQuery(genre);
    inputRef.current?.focus();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink text-white">
      {/* ── Top bar ───────────────────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-ink px-3">
        <button
          onClick={onClose}
          aria-label="Back to feed"
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="flex h-10 flex-1 items-center gap-2 rounded-full border border-line bg-white/5 px-4 transition-colors focus-within:border-white/40">
          <Search className="h-4 w-4 shrink-0 text-white/50" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shows, genres, taglines…"
            className="h-full w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 text-white/80 hover:bg-white/25"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 pb-8 pt-4 md:px-6">
        {query.trim() === "" ? (
          <div className="mx-auto w-full max-w-2xl space-y-6">
            <section>
              <div className="mb-2 flex items-center gap-2 px-1">
                <TrendingUp className="h-4 w-4 text-white/60" />
                <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                  Trending genres
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {trendingGenres.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => applyChip(genre)}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/85 transition-colors hover:border-white/30 hover:bg-white/10"
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                {loading ? "Loading shows…" : "All shows"}
              </h2>
              <ul className="space-y-1">
                {series.map((s) => (
                  <ResultRow
                    key={s.id}
                    series={s}
                    onPick={pickSeries}
                  />
                ))}
              </ul>
            </section>
          </div>
        ) : results.length === 0 ? (
          <p className="px-2 pt-12 text-center text-sm text-white/50">
            No shows match “{query.trim()}”.
          </p>
        ) : (
          <ul className="mx-auto w-full max-w-2xl space-y-1">
            {results.map((series) => (
              <ResultRow
                key={series.id}
                series={series}
                onPick={pickSeries}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface ResultRowProps {
  series: Series;
  onPick: (series: Series) => void;
}

function ResultRow({ series, onPick }: ResultRowProps) {
  return (
    <li>
      <button
        onClick={() => onPick(series)}
        className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-white/5 active:scale-[0.99]"
      >
        <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-white/5">
          <Image
            src={series.coverImage}
            alt={series.title}
            fill
            sizes="96px"
            className="object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {series.title}
          </p>
          <p className="truncate text-xs text-white/55">
            {series.genre.join(" · ")} · {series.totalEpisodes} eps
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
      </button>
    </li>
  );
}
