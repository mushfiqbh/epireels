"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { listMyUploads, deleteUpload, type UploadItem } from "@/lib/api/uploads";
import { ApiError } from "@/lib/api/client";
import StudioView from "@/components/studio/StudioView";
import AppLayout from "@/components/AppLayout";

export default function StudioPage() {
  const { status, requireSignIn } = useAuth();
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUploads = async () => {
    try {
      const response = await listMyUploads();
      setUploads(response.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        requireSignIn();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "anonymous") {
      requireSignIn();
      return;
    }

    if (status === "authenticated") {
      fetchUploads();
    }
  }, [status, requireSignIn]);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async (uploadId: string) => {
    setDeletingId(uploadId);
    setDeleteError(null);
    try {
      await deleteUpload(uploadId);
      setUploads((prev) => prev.filter((u) => u.id !== uploadId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        requireSignIn();
        return;
      }
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete upload. Please try again."
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-white/50">Loading...</div>
      </div>
    );
  }

  return (
    <AppLayout>
      <StudioView
        uploads={uploads}
        deletingId={deletingId}
        deleteError={deleteError}
        onDelete={handleDelete}
        onDismissError={() => setDeleteError(null)}
        onRefresh={fetchUploads}
      />
    </AppLayout>
  );
}
