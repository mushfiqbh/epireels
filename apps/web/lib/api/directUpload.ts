/**
 * Direct-to-storage upload helpers.
 *
 * Two-step flow that keeps large video bytes off the API process:
 *
 *   1. `requestUploadUrl({ filename, contentType })` calls
 *      `POST /api/v1/videos/upload-url` to mint a presigned PUT URL
 *      scoped to the requested file. The response also carries a
 *      server-minted `videoId` we'll need at completion time.
 *
 *   2. The caller `PUT`s the file body to `uploadUrl` with the matching
 *      `Content-Type`. This goes directly to Backblaze B2 in production
 *      and to `/api/v1/local-uploads/<key>` during local development —
 *      the browser never proxies the bytes through Next.js or Nest.
 *
 *   3. `completeUpload({ videoId })` calls
 *      `POST /api/v1/videos/:id/upload-complete` which verifies the
 *      object landed in storage and fires off the FFmpeg processor.
 *
 * If any step fails the caller is expected to surface the error and
 * (optionally) ask the API to abort by deleting the row, but we don't
 * ship that today — re-running completeUpload is safe as long as the
 * same key is reused.
 */
import type {
  UploadUrlRequestDto,
  UploadUrlResponseDto,
} from "@epireels/types";
import { apiFetch, ApiError } from "./client";

export interface DirectUploadInput {
  file: File;
  onProgress?: (bytesSent: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

/**
 * Ask the API for a presigned PUT URL scoped to `file`. The server
 * mints a `videoId` we carry into the completion call.
 */
export async function requestUploadUrl(
  input: UploadUrlRequestDto,
): Promise<UploadUrlResponseDto> {
  try {
    return await apiFetch<UploadUrlResponseDto>(
      "/api/v1/videos/upload-url",
      {
        method: "POST",
        body: JSON.stringify(input),
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      `Failed to obtain upload URL: ${err instanceof Error ? err.message : "unknown error"}`,
      0,
      "/api/v1/videos/upload-url",
      err,
    );
  }
}

/**
 * Stream `file` to the presigned URL using `XMLHttpRequest` so we can
 * surface a progress callback. `fetch()` doesn't expose upload progress
 * yet across every browser we target, so XHR is the conservative pick.
 */
export async function putFileToSignedUrl(
  url: string,
  file: File,
  onProgress?: (bytesSent: number, totalBytes: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(event.loaded, event.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new ApiError(
            `PUT ${url} failed with status ${xhr.status}`,
            xhr.status,
            url,
          ),
        );
      }
    };
    xhr.onerror = () =>
      reject(new ApiError("Network error uploading file", 0, url));
    xhr.onabort = () =>
      reject(new ApiError("Upload aborted", 0, url));

    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}

/**
 * Tell the API the upload finished so it can flip the row to
 * PROCESSING and kick off the FFmpeg worker.
 */
export async function completeUpload(
  videoId: string,
): Promise<{ videoId: string; status: string }> {
  try {
    return await apiFetch<{ videoId: string; status: string }>(
      `/api/v1/videos/${encodeURIComponent(videoId)}/upload-complete`,
      { method: "POST" },
    );
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      `Upload completion call failed: ${err instanceof Error ? err.message : "unknown error"}`,
      0,
      `/api/v1/videos/${videoId}/upload-complete`,
      err,
    );
  }
}

/**
 * Convenience that runs the three-step flow end-to-end. Throws on any
 * failure so the caller can render an error state.
 */
export async function directUploadVideo(
  input: DirectUploadInput,
): Promise<{ videoId: string; key: string }> {
  const presigned = await requestUploadUrl({
    filename: input.file.name,
    contentType: input.file.type || "application/octet-stream",
  });
  await putFileToSignedUrl(
    presigned.uploadUrl,
    input.file,
    input.onProgress,
    input.signal,
  );
  await completeUpload(presigned.videoId);
  return { videoId: presigned.videoId, key: presigned.key };
}
