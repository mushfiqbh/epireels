"use client";

import { useState } from "react";
import type { UploadVideoInput } from "@/lib/api/upload";

interface SeriesOption {
  id: string;
  title: string;
}

interface UploadFormProps {
  series: SeriesOption[];
  onUpload: (input: UploadVideoInput) => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, power)).toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

export default function UploadForm({ series, onUpload }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [description, setDescription] = useState("");
  const [seriesMode, setSeriesMode] = useState<"existing" | "new">(
    series.length > 0 ? "existing" : "new",
  );
  const [seriesId, setSeriesId] = useState(series[0]?.id ?? "");
  const [seriesTitle, setSeriesTitle] = useState("");

  const canSubmit =
    file !== null &&
    episodeTitle.trim().length > 0 &&
    (seriesMode === "existing" ? seriesId.length > 0 : seriesTitle.trim().length > 0);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !canSubmit) return;
    onUpload({
      file,
      episodeTitle: episodeTitle.trim(),
      description: description.trim() || undefined,
      seriesId: seriesMode === "existing" ? seriesId : undefined,
      seriesTitle: seriesMode === "new" ? seriesTitle.trim() : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Field label="Video file" required>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/5 px-6 py-9 text-center transition hover:border-white/30 hover:bg-white/10">
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          {file ? (
            <>
              <span className="max-w-full truncate text-sm font-medium text-white">{file.name}</span>
              <span className="text-xs text-white/50">{formatBytes(file.size)}</span>
            </>
          ) : (
            <>
              <span className="text-sm font-medium text-white/80">Select a video to upload</span>
              <span className="text-xs text-white/40">Up to 500 MB · MP4, WebM, MOV</span>
            </>
          )}
        </label>
      </Field>

      <Field label="Series" required>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2 text-white/80">
            <input
              type="radio"
              checked={seriesMode === "existing"}
              disabled={series.length === 0}
              onChange={() => setSeriesMode("existing")}
              className="h-4 w-4 accent-yt-red"
            />
            Existing
          </label>
          <label className="flex items-center gap-2 text-white/80">
            <input
              type="radio"
              checked={seriesMode === "new"}
              onChange={() => setSeriesMode("new")}
              className="h-4 w-4 accent-yt-red"
            />
            New
          </label>
        </div>
        {seriesMode === "existing" && series.length > 0 ? (
          <select
            value={seriesId}
            onChange={(event) => setSeriesId(event.target.value)}
            className="mt-3 w-full rounded-md border border-white/10 bg-ink px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
          >
            {series.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        ) : (
          <input
            value={seriesTitle}
            onChange={(event) => setSeriesTitle(event.target.value)}
            placeholder="Series title"
            className="mt-3 w-full rounded-md border border-white/10 bg-ink px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
          />
        )}
      </Field>

      <Field label="Video title" required>
        <input
          value={episodeTitle}
          onChange={(event) => setEpisodeTitle(event.target.value)}
          placeholder="Give your video a title"
          className="w-full rounded-md border border-white/10 bg-ink px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
        />
      </Field>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          placeholder="Tell viewers about your video"
          className="w-full rounded-md border border-white/10 bg-ink px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
        />
      </Field>

      <p className="text-xs text-white/45">Keep this window open while your video uploads. Processing continues in the background.</p>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-full bg-yt-red px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-yt-red/90 disabled:cursor-not-allowed disabled:bg-yt-red/40"
        >
          Upload
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wider text-white/50">
        {label}{required ? <span className="text-yt-red"> *</span> : null}
      </span>
      {children}
    </div>
  );
}
