"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, FileText, Loader2, Trash2, Upload, Video, X } from "lucide-react";
import UploadForm from "@/components/UploadForm";
import type { UploadVideoInput } from "@/lib/api/upload";
import type { PendingUploadItem, UploadItem } from "@/lib/api/uploads";

interface StudioViewProps {
  uploads: UploadItem[];
  pendingUploads: PendingUploadItem[];
  deletingId: string | null;
  deleteError: string | null;
  onDelete: (uploadId: string) => void;
  onDismissError: () => void;
  onRefresh: () => void;
  onUpload: (input: UploadVideoInput) => void;
  onDismissUpload: (uploadId: string) => void;
}

export default function StudioView({
  uploads,
  pendingUploads,
  deletingId,
  deleteError,
  onDelete,
  onDismissError,
  onRefresh,
  onUpload,
  onDismissUpload,
}: StudioViewProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<UploadItem | null>(null);

  useEffect(() => {
    const displayUploads = [
      ...pendingUploads,
      ...uploads.filter((upload) => !pendingUploads.some((pending) => pending.id === upload.id)),
    ];
    const hasProcessing = displayUploads.some((item) => {
      if ("uploadState" in item) return item.uploadState === "processing";
      return item.processingStatus !== "FAILED" && item.processingProgress < 100;
    });
    if (!hasProcessing) return;
    const interval = setInterval(onRefresh, 2000);
    return () => clearInterval(interval);
  }, [uploads, pendingUploads, onRefresh]);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  function openUpload() {
    setShowUpload(true);
  }

  const displayUploads = [
    ...pendingUploads,
    ...uploads.filter((upload) => !pendingUploads.some((pending) => pending.id === upload.id)),
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-ink pb-20">
      <div className="bg-linear-to-b from-white/5 to-transparent pt-8 pb-6">
        <div className="container mx-auto flex items-center justify-between px-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Creator Studio</h1>
            <p className="mt-1 text-sm text-white/60">Manage your videos and uploads</p>
          </div>
          <button
            onClick={openUpload}
            className="flex items-center gap-2 rounded-full bg-yt-red px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-yt-red/90"
          >
            <Upload className="h-4 w-4" /> Upload Video
          </button>
        </div>
      </div>

      {deleteError && (
        <div className="container mx-auto mt-4 px-4">
          <div className="flex items-start gap-3 rounded-lg border border-yt-red/40 bg-yt-red/10 px-4 py-3 text-sm text-white">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yt-red" />
            <p className="flex-1">{deleteError}</p>
            <button onClick={onDismissError} className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Dismiss error">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="container mx-auto mt-6 px-4">
        <h2 className="mb-4 text-lg font-semibold text-white">My uploads</h2>
        {displayUploads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Video className="mb-4 h-16 w-16 text-white/20" />
            <h3 className="mb-2 text-lg font-medium text-white">No uploads yet</h3>
            <p className="mb-6 text-sm text-white/50">Get started by uploading your first video</p>
            <button onClick={openUpload} className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20">
              <Upload className="h-4 w-4" /> Upload Video
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {displayUploads.map((upload) => {
              const isPending = "uploadState" in upload;
              const pending = isPending ? upload as PendingUploadItem : null;
              const isUploading = pending?.uploadState === "uploading";
              const isProcessing = pending?.uploadState === "processing" ||
                (!pending && upload.processingStatus !== "FAILED" && upload.processingProgress < 100);
              const progress = isUploading
                ? pending.uploadProgress
                : pending?.uploadState === "processing"
                  ? pending.processingProgress
                  : upload.processingProgress;
              const progressLabel = isUploading ? "Uploading" : "Processing";

              return (
                <div key={upload.id} className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10">
                  <div className="flex items-start gap-4">
                    <div className="flex h-20 w-32 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-white/10 to-white/5">
                      {isUploading || isProcessing ? <Loader2 className="h-8 w-8 animate-spin text-white/40" /> : <Video className="h-8 w-8 text-white/30" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-medium text-white">{upload.title}</h3>
                      {upload.description && <p className="mt-1 line-clamp-2 text-sm text-white/50">{upload.description}</p>}
                      <div className="mt-2 flex items-center gap-4 text-xs text-white/40">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(upload.createdAt)}</span>
                        {!isUploading && !isProcessing && (
                          <span className={`flex items-center gap-1 ${upload.processingStatus === "FAILED" ? "text-red-400" : upload.processingStatus === "READY" ? "text-green-400" : "text-yellow-400"}`}>
                            <FileText className="h-3 w-3" />{upload.processingStatus === "FAILED" ? "Failed" : upload.processingStatus === "READY" ? "Ready" : upload.processingStatus}
                          </span>
                        )}
                      </div>

                      {(isUploading || isProcessing) && (
                        <div className="mt-3 max-w-2xl">
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-medium text-white/80">{progressLabel}</span>
                            <span className="tabular-nums text-white/65">{Math.min(100, progress)}%</span>
                          </div>
                          <div
                            role="progressbar"
                            aria-label={`${progressLabel} ${upload.title}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.min(100, progress)}
                            className="h-1.5 overflow-hidden rounded-full bg-white/10"
                          >
                            <div className="h-full rounded-full bg-yt-red transition-[width] duration-300" style={{ width: `${Math.min(100, progress)}%` }} />
                          </div>
                          <p className="mt-2 text-xs text-white/45">
                            {isUploading
                              ? "Keep this window open until the upload finishes."
                              : "Processing continues in the background. You can leave this page."}
                          </p>
                        </div>
                      )}
                      {pending?.uploadState === "failed" && (
                        <div className="mt-3 flex items-start justify-between gap-3 text-xs text-red-300">
                          <span>{pending.uploadError ?? "Upload failed."}</span>
                          <button onClick={() => onDismissUpload(pending.id)} className="shrink-0 text-white/50 hover:text-white">Dismiss</button>
                        </div>
                      )}
                    </div>
                    {!isPending && (
                      <button
                        onClick={() => setPendingDelete(upload)}
                        disabled={deletingId === upload.id}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-yt-red/20 hover:text-yt-red disabled:cursor-not-allowed disabled:opacity-50"
                        title="Delete"
                        aria-label={`Delete ${upload.title}`}
                      >
                        {deletingId === upload.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowUpload(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="upload-dialog-title" className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-yt-dark shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-yt-dark px-6 py-4">
              <div>
                <h2 id="upload-dialog-title" className="text-lg font-semibold text-white">Upload videos</h2>
                <p className="mt-1 text-xs text-white/45">Add your video details before it goes live.</p>
              </div>
              <button onClick={() => setShowUpload(false)} className="rounded-full p-2 text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Close upload dialog">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              <UploadForm
                series={[]}
                onUpload={(input) => { onUpload(input); setShowUpload(false); }}
              />
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => !deletingId && setPendingDelete(null)} role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-yt-dark p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yt-red/15"><AlertTriangle className="h-5 w-5 text-yt-red" /></div>
              <h2 id="delete-confirm-title" className="text-lg font-semibold text-white">Delete video?</h2>
            </div>
            <p className="text-sm text-white/70"><span className="font-medium text-white">{pendingDelete.title}</span> will be permanently deleted. This action cannot be undone.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setPendingDelete(null)} disabled={!!deletingId} className="rounded-full px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-50">Cancel</button>
              <button onClick={async () => { const target = pendingDelete; setPendingDelete(null); await onDelete(target.id); }} disabled={!!deletingId} className="flex items-center gap-2 rounded-full bg-yt-red px-4 py-2 text-sm font-medium text-white transition hover:bg-yt-red/90 disabled:opacity-70"><Trash2 className="h-4 w-4" /> Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
