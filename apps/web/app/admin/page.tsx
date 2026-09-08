import { fetchSeriesList } from "@/lib/api/reels";
import AdminUploadForm from "./AdminUploadForm";

export const metadata = {
  title: "Admin · Upload — EpiReels",
};

/**
 * Admin upload page (no auth).
 *
 * Server component — fetches the current series roster and hands it
 * to the client form so the user can either pick an existing series
 * to attach the new episode to or type a fresh title to spin one up.
 */
export default async function AdminPage() {
  let series: Awaited<ReturnType<typeof fetchSeriesList>> = [];
  let loadError: string | null = null;
  try {
    series = await fetchSeriesList();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load series";
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-12 text-white">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50">
          Admin · No auth
        </p>
        <h1 className="text-3xl font-semibold">Upload a new episode</h1>
        <p className="max-w-2xl text-sm text-white/60">
          Drop in a video file, give it a title, and either attach it to an
          existing series or create a new one on the fly. The file is
          streamed to the local storage backend and wired into the catalog so
          it shows up in the feed immediately.
        </p>
      </header>

      {loadError ? (
        <div className="rounded-md border border-yt-red/40 bg-yt-red/10 px-4 py-3 text-sm text-yt-red">
          Could not load the series list: {loadError}. You can still upload
          with a brand-new series title.
        </div>
      ) : null}

      <AdminUploadForm
        series={series.map((s) => ({ id: s.id, title: s.title }))}
      />

      <footer className="mt-auto pt-8 text-xs text-white/40">
        Disable this route in production by setting{" "}
        <code className="rounded bg-white/10 px-1.5 py-0.5">
          ADMIN_UPLOAD_ENABLED=false
        </code>{" "}
        or{" "}
        <code className="rounded bg-white/10 px-1.5 py-0.5">
          NODE_ENV=production
        </code>{" "}
        without{" "}
        <code className="rounded bg-white/10 px-1.5 py-0.5">
          ADMIN_ALLOW_PROD=true
        </code>
        .
      </footer>
    </main>
  );
}