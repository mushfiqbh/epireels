import { Readable } from 'stream';

export interface StorageResourceStats {
  size: number;
  mtime: Date;
}

/**
 * Credentials returned alongside a presigned upload URL. The API hands
 * these to the browser, which then PUTs the file bytes directly to
 * object storage. The credentials never grant access to anything other
 * than the requested key.
 */
export interface PresignedUpload {
  /** Storage key the browser should PUT to. */
  key: string;
  /** Pre-signed HTTPS URL valid for {@link expiresInSeconds}. */
  uploadUrl: string;
  /** Seconds until the URL expires. */
  expiresInSeconds: number;
  /** HTTP method the browser must use (always `PUT`). */
  method: 'PUT';
}

export interface PresignOptions {
  /** Storage key the PUT should land at. */
  key: string;
  /** MIME type the browser will declare in `Content-Type`. */
  contentType: string;
  /** Optional override; defaults to the provider-specific expiry. */
  expiresInSeconds?: number;
}

export interface StorageService {
  /**
   * Upload raw bytes to `key`. Returns the key on success so the caller
   * can persist it without re-deriving the path.
   */
  upload(fileBuffer: Buffer, key: string, mimeType: string): Promise<string>;
  /**
   * Stream-upload from a local file path. Used by the FFmpeg pipeline
   * once it has finished encoding HLS segments on disk; the local
   * driver resolves to a copy, the S3 driver streams the file body
   * straight into `PutObject`.
   */
  uploadFile(localPath: string, key: string, mimeType: string): Promise<string>;
  /** Delete a single object. Missing keys must not throw. */
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /**
   * For remote drivers, download `key` to a fresh tempdir entry and
   * return the absolute local path. For the local driver, returns
   * the path verbatim. Used by the FFmpeg pipeline to obtain a
   * seekable input file when the source lives in S3-compatible
   * storage.
   */
  downloadToTemp(key: string): Promise<string>;
  getStream(
    key: string,
    options?: { start?: number; end?: number },
  ): Promise<Readable>;
  getStats(key: string): Promise<StorageResourceStats>;
  /**
   * Generate a presigned URL the browser can `PUT` to. Only the S3
   * driver implements this for real; the local driver returns a
   * marker URL the media controller recognises (so the local dev
   * loop still works without B2 credentials).
   */
  getUploadUrl(options: PresignOptions): Promise<PresignedUpload>;
  /**
   * Public CDN / media-controller URL for `key`. The storage module
   * is the single source of truth for "what URL points at this key"
   * so consumers never reach into provider internals.
   */
  getUrl(key: string): string;
  /**
   * Absolute filesystem path for `key`. Only meaningful for the local
   * driver — the S3 driver throws because nothing in object storage
   * has a filesystem path. The processor calls {@link downloadToTemp}
   * first to obtain one.
   */
  getPath(key: string): string;
  removeDirectory(key: string): Promise<void>;
  /** True when this driver represents remote (S3-compatible) storage. */
  readonly isRemote: boolean;
}

export const STORAGE_SERVICE = 'STORAGE_SERVICE';
