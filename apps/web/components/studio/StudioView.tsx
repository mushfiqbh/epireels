"use client";

import { useState, useEffect } from "react";
import { Video, Upload, Trash2, MoreVertical, Clock, FileText, Loader2 } from "lucide-react";
import UploadForm from "@/components/UploadForm";
import type { UploadItem } from "@/lib/api/uploads";

interface StudioViewProps {
  uploads: UploadItem[];
  onDelete: (uploadId: string) => void;
  onRefresh: () => void;
}

export default function StudioView({
  uploads,
  onDelete,
  onRefresh,
}: StudioViewProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [activeTab, setActiveTab] = useState<"uploads" | "upload">("uploads");

  // Auto-refresh uploads every 5 seconds if any are processing
  useEffect(() => {
    const hasProcessing = uploads.some(u => u.processingStatus === "PROCESSING" || u.processingStatus === "UPLOADED");
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      onRefresh();
    }, 5000);

    return () => clearInterval(interval);
  }, [uploads, onRefresh]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "UPLOADED":
        return "text-yellow-400";
      case "PROCESSING":
        return "text-blue-400";
      case "READY":
        return "text-green-400";
      case "FAILED":
        return "text-red-400";
      default:
        return "text-white/60";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "UPLOADED":
        return "Preparing";
      case "PROCESSING":
        return "Processing";
      case "FAILED":
        return "Failed";
      default:
        return status;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-ink pb-20">
      {/* Header */}
      <div className="bg-gradient-to-b from-white/5 to-transparent pt-8 pb-6">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Creator Studio</h1>
              <p className="text-sm text-white/60 mt-1">
                Manage your videos and uploads
              </p>
            </div>
            <button
              onClick={() => {
                setActiveTab("upload");
                setShowUpload(true);
              }}
              className="flex items-center gap-2 rounded-full bg-yt-red px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-yt-red/90"
            >
              <Upload className="h-4 w-4" />
              Upload Video
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="container mx-auto px-4 mt-6">
        <div className="flex gap-2 border-b border-white/10">
          <button
            onClick={() => {
              setActiveTab("uploads");
              setShowUpload(false);
            }}
            className={`px-4 py-3 text-sm font-medium transition ${
              activeTab === "uploads"
                ? "text-white border-b-2 border-yt-red"
                : "text-white/60 hover:text-white"
            }`}
          >
            My Uploads
          </button>
          <button
            onClick={() => {
              setActiveTab("upload");
              setShowUpload(true);
            }}
            className={`px-4 py-3 text-sm font-medium transition ${
              activeTab === "upload"
                ? "text-white border-b-2 border-yt-red"
                : "text-white/60 hover:text-white"
            }`}
          >
            Upload New
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 mt-6">
        {activeTab === "uploads" ? (
          <>
            {uploads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Video className="h-16 w-16 text-white/20 mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">
                  No uploads yet
                </h3>
                <p className="text-sm text-white/50 mb-6">
                  Get started by uploading your first video
                </p>
                <button
                  onClick={() => {
                    setActiveTab("upload");
                    setShowUpload(true);
                  }}
                  className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
                >
                  <Upload className="h-4 w-4" />
                  Upload Video
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {uploads.map((upload) => (
                  <div
                    key={upload.id}
                    className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition"
                  >
                    <div className="flex items-start gap-4">
                      {/* Thumbnail placeholder */}
                      <div className="h-20 w-32 rounded-lg bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center shrink-0">
                        <Video className="h-8 w-8 text-white/30" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-white truncate">
                          {upload.title}
                        </h3>
                        {upload.description && (
                          <p className="text-sm text-white/50 mt-1 line-clamp-2">
                            {upload.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{formatDate(upload.createdAt)}</span>
                          </div>
                          <div className={`flex items-center gap-1 ${getStatusColor(upload.processingStatus)}`}>
                            {(upload.processingStatus === "PROCESSING" || upload.processingStatus === "UPLOADED") ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <FileText className="h-3 w-3" />
                            )}
                            <span className="capitalize">{getStatusLabel(upload.processingStatus)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onDelete(upload.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-yt-red/20 hover:text-yt-red"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="py-6">
            <UploadForm series={[]} mode="member" />
          </div>
        )}
      </div>
    </div>
  );
}
