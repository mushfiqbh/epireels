/**
 * DTOs returned by the admin upload endpoint.
 *
 * Intentionally tiny — the wire payload only needs the public URL of
 * the freshly persisted video, the storage key (so the caller can
 * display it for debugging), and the episode that was created or
 * attached when one was requested.
 */
export interface AdminUploadResponseDto {
  /** Storage key the file was written to (relative to STORAGE_LOCAL_PATH). */
  key: string;
  /** Public URL the media controller will serve, e.g. `/media/uploads/...`. */
  url: string;
  /** Mime type derived from the upload's file extension. */
  mimeType: string;
  /** Bytes written. Useful for the admin UI to confirm the upload size. */
  size: number;
  /**
   * Duration in seconds probed from the MP4 `mvhd` box. Zero for
   * containers the server-side probe doesn't understand (`.webm`,
   * `.mkv`) — the client will still recover the real value from
   * `<video>.loadedmetadata`.
   */
  durationSeconds: number;
  /** Intrinsic width in pixels (`tkhd` 16.16 fixed point, lower 16 bits). */
  width: number;
  /** Intrinsic height in pixels. */
  height: number;
  /** Episode the uploaded video was attached to, if any. */
  episode?: {
    id: string;
    title: string;
    seriesId: string;
  };
}
