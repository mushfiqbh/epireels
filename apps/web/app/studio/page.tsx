"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { listMyUploads, deleteUpload, type PendingUploadItem, type UploadItem } from "@/lib/api/uploads";
import { uploadVideo, type UploadVideoInput } from "@/lib/api/upload";
import { ApiError } from "@/lib/api/client";
import StudioView from "@/components/studio/StudioView";
import AppLayout from "@/components/AppLayout";

export default function StudioPage() {
  const { status, requireSignIn } = useAuth();
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingUploadItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUploads = useCallback(async () => {
    try {
      const response = await listMyUploads();
      setUploads(response.items);
      setPendingUploads((current) => current.filter((pending) =>
        pending.uploadState === "uploading" ||
        pending.uploadState === "failed" ||
        !response.items.some((upload) => upload.id === pending.id),
      ));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) requireSignIn();
    } finally {
      setLoading(false);
    }
  }, [requireSignIn]);

  useEffect(() => {
    if (status === "anonymous") {
      requireSignIn();
      return;
    }
    if (status === "authenticated") void fetchUploads();
  }, [status, requireSignIn, fetchUploads]);

  const hasActiveUpload = pendingUploads.some((upload) => upload.uploadState === "uploading");

  useEffect(() => {
    if (!hasActiveUpload) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [hasActiveUpload]);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async (uploadId: string) => {
    setDeletingId(uploadId);
    setDeleteError(null);
    try {
      await deleteUpload(uploadId);
      setUploads((previous) => previous.filter((upload) => upload.id !== uploadId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        requireSignIn();
        return;
      }
      setDeleteError(err instanceof Error ? err.message : "Failed to delete upload. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleUpload = (input: UploadVideoInput) => {
    const temporaryId = `pending-${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    const pending: PendingUploadItem = {
      id: temporaryId,
      ownerId: "",
      title: input.episodeTitle || input.file.name,
      description: input.description ?? null,
      status: "UPLOADING",
      processingStatus: "UPLOADING",
      processingProgress: 0,
      createdAt,
      updatedAt: createdAt,
      uploadState: "uploading",
      uploadProgress: 0,
      fileName: input.file.name,
    };
    setPendingUploads((previous) => [pending, ...previous]);

    let uploadId = temporaryId;
    void (async () => {
      try {
        const response = await uploadVideo(input, (sent, total) => {
          const percent = total > 0 ? Math.min(100, Math.floor((sent / total) * 100)) : 0;
          setPendingUploads((previous) => previous.map((item) =>
            item.id === uploadId ? { ...item, uploadProgress: percent } : item,
          ));
        });
        uploadId = response.uploadId;
        setPendingUploads((previous) => previous.map((item) => item.id === temporaryId
          ? {
              ...item,
              id: response.uploadId,
              title: response.episode?.title ?? item.title,
              uploadState: "processing",
              uploadProgress: 100,
              processingStatus: response.processingStatus,
              processingProgress: response.processingProgress,
            }
          : item,
        ));
        await fetchUploads();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) requireSignIn();
        const message = err instanceof Error ? err.message : "Upload failed. Please try again.";
        setPendingUploads((previous) => previous.map((item) => item.id === uploadId
          ? { ...item, uploadState: "failed", processingStatus: "FAILED", uploadError: message }
          : item,
        ));
      }
    })();
  };

  const dismissPendingUpload = (uploadId: string) => {
    setPendingUploads((previous) => previous.filter((item) => item.id !== uploadId));
  };

  if (status === "loading" || loading) {
    return <div className="flex min-h-screen items-center justify-center"><div className="text-white/50">Loading...</div></div>;
  }

  return (
    <AppLayout>
      <StudioView
        uploads={uploads}
        pendingUploads={pendingUploads}
        deletingId={deletingId}
        deleteError={deleteError}
        onDelete={handleDelete}
        onDismissError={() => setDeleteError(null)}
        onRefresh={fetchUploads}
        onUpload={handleUpload}
        onDismissUpload={dismissPendingUpload}
      />
    </AppLayout>
  );
}
