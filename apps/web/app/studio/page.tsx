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

  const handleDelete = async (uploadId: string) => {
    try {
      await deleteUpload(uploadId);
      setUploads((prev) => prev.filter((u) => u.id !== uploadId));
    } catch (err) {
      console.error("Failed to delete upload", err);
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
        onDelete={handleDelete}
        onRefresh={fetchUploads}
      />
    </AppLayout>
  );
}
