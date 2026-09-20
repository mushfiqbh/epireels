"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2, Play } from "lucide-react";
import { fetchSeriesList } from "@/lib/api/reels";
import type { Series } from "@/lib/types";

export default function SeriesListPage() {
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSeriesList()
      .then((list) => {
        if (cancelled) return;
        setSeriesList(list);
      })
      .catch((err) => {
        if (cancelled) return;
        setError("Failed to load series");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090a0f]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-white/80" />
          <span className="text-sm font-medium text-white/65">Loading series…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090a0f]">
        <p className="text-white/65">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090a0f] pb-20">
      <div className="container mx-auto px-4 py-8">
        <h1 className="mb-8 text-2xl font-bold text-white">Series</h1>
        
        <div className="space-y-8">
          {seriesList.map((series) => (
            <div key={series.id} className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-white/10">
                  <Image
                    src={series.coverImage}
                    alt={series.title}
                    fill
                    sizes="(max-width: 768px) 128px, 128px"
                    className="object-cover"
                  />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">{series.title}</h2>
                  <p className="text-sm text-white/60">{series.tagline}</p>
                  <p className="text-xs text-white/40">{series.totalEpisodes} episodes</p>
                </div>
              </div>

              {/* Horizontal scrolling episode cards */}
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                {series.episodes.map((episode) => (
                  <Link
                    key={episode.id}
                    href={`/foryou?episode=${episode.id}`}
                    className="group relative shrink-0 w-48"
                  >
                    <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-white/10">
                      <Image
                        src={episode.video.mobile.thumbnail}
                        alt={episode.title}
                        fill
                        sizes="192px"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                          <Play className="h-6 w-6 fill-white text-white" />
                        </div>
                      </div>
                      <div className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white">
                        EP {String(episode.episodeNumber).padStart(2, "0")}
                      </div>
                    </div>
                    <p className="mt-2 truncate text-sm font-medium text-white group-hover:text-white/80">
                      {episode.title}
                    </p>
                    <p className="text-xs text-white/40">{episode.duration}</p>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
