/**
 * Member uploads REST adapter — thin wrappers around the `/api/v1/uploads/*` endpoints.
 */

import { apiFetch } from "./client";

export interface UploadItem {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  status: string;
  processingStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadsResponse {
  items: UploadItem[];
}

/** List uploads owned by the current user. */
export function listMyUploads(): Promise<UploadsResponse> {
  return apiFetch<UploadsResponse>("/api/v1/uploads/me");
}

/** Delete an upload owned by the current user. */
export async function deleteUpload(uploadId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/uploads/${uploadId}`, {
    method: "DELETE",
  });
}
