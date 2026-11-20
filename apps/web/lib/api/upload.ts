/**
 * Front-end upload helper.
 *
 * Uploads to the member endpoint `POST /api/v1/uploads` which requires
 * authentication and assigns ownership to the caller.
 */
import type { AdminUploadResponseDto } from "@epireels/types";
import { apiUrl, ApiError, ensureCsrfToken } from "./client";

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
  onProgress?: (bytesSent: number, totalBytes: number) => void,
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
    const csrfToken = await ensureCsrfToken();
    return await new Promise<AdminUploadResponseDto>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", apiUrl("/api/v1/uploads"));
      xhr.withCredentials = true;
      if (csrfToken) xhr.setRequestHeader("x-csrf-token", csrfToken);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded, event.total);
      };
      xhr.onload = () => {
        let body: unknown;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          body = undefined;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(body as AdminUploadResponseDto);
          return;
        }
        const message =
          typeof body === "object" && body !== null && "message" in body
            ? String((body as { message: unknown }).message)
            : `Request failed: ${xhr.status} ${xhr.statusText}`;
        reject(new ApiError(message, xhr.status, apiUrl("/api/v1/uploads"), body));
      };
      xhr.onerror = () =>
        reject(new ApiError("Network error uploading video", 0, apiUrl("/api/v1/uploads")));
      xhr.onabort = () =>
        reject(new ApiError("Upload aborted", 0, apiUrl("/api/v1/uploads")));
      // Leave Content-Type unset so XHR supplies the multipart boundary.
      xhr.send(form);
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
