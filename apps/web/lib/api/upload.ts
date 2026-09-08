/**
 * Front-end upload helper for the admin route.
 *
 * Posts a multipart form to `POST /api/v1/admin/uploads` and returns
 * the parsed JSON payload. Errors are normalised into the project's
 * shared `ApiError` so callers can render consistent error UI.
 */
import { apiUrl, ApiError } from "./client";

export interface AdminUploadEpisode {
  id: string;
  title: string;
  seriesId: string;
}

export interface AdminUploadResponse {
  key: string;
  url: string;
  mimeType: string;
  size: number;
  episode?: AdminUploadEpisode;
}

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
 * Upload `file` to the admin endpoint. Throws `ApiError` on non-2xx.
 */
export async function uploadVideo(
  input: UploadVideoInput,
): Promise<AdminUploadResponse> {
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

  const url = apiUrl("/api/v1/admin/uploads");
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      body: form,
      // Important: do NOT set Content-Type. The browser will add the
      // multipart boundary itself.
    });
  } catch (cause) {
    throw new ApiError(
      `Network error uploading to ${url}`,
      0,
      url,
      cause,
    );
  }

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => undefined);
    }
    throw new ApiError(
      `Upload failed: ${res.status} ${res.statusText}`,
      res.status,
      url,
      body,
    );
  }

  return (await res.json()) as AdminUploadResponse;
}