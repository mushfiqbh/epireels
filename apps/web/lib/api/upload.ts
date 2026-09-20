/**
 * Front-end upload helper.
 *
 * Uploads to the member endpoint `POST /api/v1/uploads` which requires
 * authentication and assigns ownership to the caller.
 */
import type { AdminUploadResponseDto } from "@epireels/types";
import { apiFetch, ApiError } from "./client";

/** Re-export of the shared upload response. */
export type AdminUploadResponse = AdminUploadResponseDto;

export interface UploadVideoInput {
  file: File;
  episodeTitle?: string;
  seriesId?: string;
  seriesTitle?: string;
  description?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

/**
 * Upload `file` to the member endpoint. Throws `ApiError` on non-2xx.
 */
export async function uploadVideo(
  input: UploadVideoInput,
): Promise<AdminUploadResponseDto> {
  const form = new FormData();
  form.append("file", input.file);
  if (input.episodeTitle) form.append("episodeTitle", input.episodeTitle);
  if (input.seriesId) form.append("seriesId", input.seriesId);
  if (input.seriesTitle) form.append("seriesTitle", input.seriesTitle);
  if (input.description) form.append("description", input.description);
  if (input.seasonNumber !== undefined) {
    form.append("seasonNumber", String(input.seasonNumber));
  }
  if (input.episodeNumber !== undefined) {
    form.append("episodeNumber", String(input.episodeNumber));
  }

  try {
    return await apiFetch<AdminUploadResponseDto>("/api/v1/uploads", {
      method: "POST",
      body: form,
      // Important: do NOT set Content-Type. The browser will add the
      // multipart boundary itself.
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      `Upload failed: ${err instanceof Error ? err.message : "unknown error"}`,
      0,
      "/api/v1/uploads",
      err,
    );
  }
}