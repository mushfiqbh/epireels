"use client";

import AppLayout from "@/components/AppLayout";
import { Heart } from "lucide-react";

export default function FavoritesPage() {
  return (
    <AppLayout>
      <div className="flex h-full flex-col items-center justify-center gap-4 px-4">
        <Heart className="h-16 w-16 text-white/30" />
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white">Favorites</h2>
          <p className="mt-2 text-sm text-white/60">
            Your favorite reels will appear here
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
