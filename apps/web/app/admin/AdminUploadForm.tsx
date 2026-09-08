"use client";

import { useState } from "react";
import { uploadVideo, type AdminUploadResponse } from "@/lib/api/upload";
import { ApiError } from "@/lib/api/client";

interface SeriesOption {
  id: string;
  title: string;
}

interface AdminUploadFormProps {
  series: SeriesOption[];
}

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; fileName: string }
  | { kind: "success"; response: AdminUploadResponse }
  | { kind: "error"; message: string };

/** Human-readable byte size (KB / MB / GB). */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  return `${(bytes / Math.pow(1024, power)).toFixed(power === 0 ? 0 : 1)} ${
    units[power]
  }`;
}

export default function AdminUploadForm({ series }: AdminUploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [description, setDescription] = useState("");
  const [seriesMode, setSeriesMode] = useState<"existing" | "new">(
    series.length > 0 ? "existing" : "new",
  );
  const [seriesId, setSeriesId] = useState<string>(
    series[0]?.id ?? "",
  );
  const [seriesTitle, setSeriesTitle] = useState("");
  const [createEpisode, setCreateEpisode] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const canSubmit =
    file !== null &&
    (createEpisode ? episodeTitle.trim().length > 0 : true) &&
    (seriesMode === "existing"
      ? seriesId.length > 0
      : seriesTitle.trim().length > 0);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || status.kind === "uploading") return;

    setStatus({ kind: "uploading", fileName: file.name });

    try {
      const response = await uploadVideo({
        file,
        episodeTitle: createEpisode ? episodeTitle : undefined,
        description: description.trim() || undefined,
        seriesId:
          createEpisode && seriesMode === "existing"
            ? seriesId
            : undefined,
        seriesTitle:
          createEpisode && seriesMode === "new"
            ? seriesTitle.trim()
            : undefined,
      });
      setStatus({ kind: "success", response });
      // Reset the volatile bits but keep the series selection so the
      // user can rapidly upload a batch of episodes to the same show.
      setFile(null);
      setEpisodeTitle("");
      setDescription("");
    } catch (err) {
      const message =
        err instanceof ApiError
          ? `${err.message}${
              err.status === 0
                ? " — is the API server running on port 4000?"
                : ""
            }`
          : err instanceof Error
          ? err.message
          : "Upload failed.";
      setStatus({ kind: "error", message });
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-ink-card/60 p-6 backdrop-blur"
    >
      {/* File picker */}
      <Field label="Video file" required>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/5 px-6 py-10 text-center transition hover:border-white/30 hover:bg-white/10">
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <>
              <span className="text-sm font-medium text-white">{file.name}</span>
              <span className="text-xs text-white/50">
                {formatBytes(file.size)}
              </span>
            </>
          ) : (
            <>
              <span className="text-sm font-medium text-white/80">
                Click to select a video file
              </span>
              <span className="text-xs text-white/40">
                Up to 500 MB · MP4, WebM, MOV
              </span>
            </>
          )}
        </label>
      </Field>

      <label className="flex items-center gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          checked={createEpisode}
          onChange={(e) => setCreateEpisode(e.target.checked)}
          className="h-4 w-4 accent-yt-red"
        />
        Create an Episode row (uncheck to do a raw storage upload only)
      </label>

      {createEpisode ? (
        <>
          <Field label="Series" required>
            <div className="flex gap-4 text-sm">
              <RadioRow
                name="seriesMode"
                value="existing"
                checked={seriesMode === "existing"}
                onChange={() => setSeriesMode("existing")}
                disabled={series.length === 0}
                label="Existing"
              />
              <RadioRow
                name="seriesMode"
                value="new"
                checked={seriesMode === "new"}
                onChange={() => setSeriesMode("new")}
                label="New"
              />
            </div>

            {seriesMode === "existing" ? (
              series.length > 0 ? (
                <select
                  value={seriesId}
                  onChange={(e) => setSeriesId(e.target.value)}
                  className="mt-3 w-full rounded-md border border-white/10 bg-ink px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
                >
                  {series.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="mt-3 text-xs text-white/50">
                  No series yet — switch to &quot;New&quot; to create one.
                </p>
              )
            ) : (
              <input
                type="text"
                value={seriesTitle}
                onChange={(e) => setSeriesTitle(e.target.value)}
                placeholder="My new show"
                className="mt-3 w-full rounded-md border border-white/10 bg-ink px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
              />
            )}
          </Field>

          <Field label="Episode title" required>
            <input
              type="text"
              value={episodeTitle}
              onChange={(e) => setEpisodeTitle(e.target.value)}
              placeholder="Episode 1 — Pilot"
              className="w-full rounded-md border border-white/10 bg-ink px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Short synopsis / show notes"
              className="w-full rounded-md border border-white/10 bg-ink px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
            />
          </Field>
        </>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <button
          type="submit"
          disabled={!canSubmit || status.kind === "uploading"}
          className="rounded-md bg-yt-red px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-yt-red/90 disabled:cursor-not-allowed disabled:bg-yt-red/40"
        >
          {status.kind === "uploading"
            ? `Uploading ${status.fileName}…`
            : "Upload"}
        </button>

        {status.kind === "success" ? (
          <span className="text-xs text-emerald-400">
            Saved to <code className="bg-white/10 px-1">{status.response.key}</code>
            {status.response.episode
              ? ` · episode ${status.response.episode.id} attached`
              : ""}
          </span>
        ) : null}
      </div>

      {status.kind === "error" ? (
        <div className="rounded-md border border-yt-red/40 bg-yt-red/10 px-4 py-3 text-sm text-yt-red">
          {status.message}
        </div>
      ) : null}

      {status.kind === "success" ? (
        <ResultPreview response={status.response} />
      ) : null}
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
        {label}
        {required ? <span className="text-yt-red"> *</span> : null}
      </span>
      {children}
    </div>
  );
}

function RadioRow({
  name,
  value,
  checked,
  onChange,
  disabled,
  label,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-white/80">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="h-4 w-4 accent-yt-red"
      />
      {label}
    </label>
  );
}

function ResultPreview({ response }: { response: AdminUploadResponse }) {
  // The response.url is server-relative (e.g. `/media/uploads/...`).
  // For a clickable preview we hand the user the path — the running
  // server will serve it on the API origin.
  return (
    <div className="rounded-md border border-white/10 bg-ink/60 px-4 py-3 text-xs text-white/70">
      <div>
        <span className="text-white/40">Public URL:</span>{" "}
        <code className="bg-white/10 px-1">{response.url}</code>
      </div>
      <div>
        <span className="text-white/40">MIME:</span> {response.mimeType}
      </div>
      <div>
        <span className="text-white/40">Size:</span>{" "}
        {formatBytes(response.size)}
      </div>
      {response.episode ? (
        <div>
          <span className="text-white/40">Episode:</span>{" "}
          {response.episode.title} <span className="text-white/30">({response.episode.id})</span>
        </div>
      ) : null}
    </div>
  );
}