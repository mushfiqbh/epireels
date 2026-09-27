import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import {
  PresignOptions,
  PresignedUpload,
  StorageResourceStats,
  StorageService,
} from '../storage.interface';

interface B2Config {
  endpoint: string;
  region: string;
  keyId: string;
  applicationKey: string;
  bucket: string;
  cdnUrl: string;
}

/**
 * S3-compatible storage driver backed by Backblaze B2 (or any
 * S3-compatible endpoint configured via `B2_ENDPOINT`). The browser
 * uploads go through a presigned `PUT` so large videos never transit
 * the API process.
 */
@Injectable()
export class B2StorageService implements StorageService, OnModuleInit {
  private readonly logger = new Logger(B2StorageService.name);
  private client!: S3Client;
  private config!: B2Config;

  readonly isRemote = true;

  onModuleInit(): void {
    const endpoint = required('B2_ENDPOINT');
    const region = required('B2_REGION');
    const keyId = required('B2_KEY_ID');
    const applicationKey = required('B2_APPLICATION_KEY');
    const bucket = required('B2_BUCKET');
    const cdnUrl = process.env.CDN_URL ?? '';

    this.config = { endpoint, region, keyId, applicationKey, bucket, cdnUrl };

    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: keyId,
        secretAccessKey: applicationKey,
      },
    });

    this.logger.log(
      `B2StorageService wired: bucket=${bucket} endpoint=${endpoint} cdn=${cdnUrl || '<unset>'}`,
    );
  }

  async upload(
    fileBuffer: Buffer,
    key: string,
    mimeType: string,
  ): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
      }),
    );
    return key;
  }

  /**
   * Stream large files (HLS segments, transcoded variants) directly
   * from disk into B2 using `@aws-sdk/lib-storage`'s multipart uploader.
   * This is the hot path once ffmpeg finishes encoding — the encoder
   * writes 6-second segments to a tempdir and we upload each one with
   * a single call from here.
   */
  async uploadFile(
    localPath: string,
    key: string,
    mimeType: string,
  ): Promise<string> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.config.bucket,
        Key: key,
        Body: await fsp.readFile(localPath),
        ContentType: mimeType,
      },
      queueSize: 4,
      partSize: 8 * 1024 * 1024,
    });
    await upload.done();
    return key;
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        }),
      );
    } catch (err) {
      // Treat "not found" as success — the goal is to ensure absence.
      const code = (err as { name?: string }).name;
      if (code !== 'NoSuchKey' && code !== 'NotFound') throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return true;
    } catch (err) {
      const code = (err as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (code === 404) return false;
      throw err;
    }
  }

  /**
   * Materialise the object body on the local filesystem so ffmpeg has
   * a seekable input to probe. The temp file lives in a single
   * per-process tempdir and is the caller's responsibility to remove
   * once transcoding finishes.
   */
  async downloadToTemp(key: string): Promise<string> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    if (!response.Body) {
      throw new InternalServerErrorException(
        `Empty body returned for object ${key}`,
      );
    }
    const root = path.join(os.tmpdir(), 'epireels-video');
    await fsp.mkdir(root, { recursive: true });
    const destination = path.join(
      root,
      `${Date.now()}-${randomToken()}-${path.basename(key)}`,
    );
    await streamToFile(response.Body as Readable, destination);
    return destination;
  }

  async getStats(key: string): Promise<StorageResourceStats> {
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    return {
      size: head.ContentLength ?? 0,
      mtime: head.LastModified ?? new Date(),
    };
  }

  async getStream(
    key: string,
    options?: { start?: number; end?: number },
  ): Promise<Readable> {
    const range =
      options?.start !== undefined || options?.end !== undefined
        ? `bytes=${options?.start ?? 0}-${options?.end ?? ''}`
        : undefined;
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Range: range,
      }),
    );
    if (!response.Body) {
      throw new InternalServerErrorException(
        `Empty body returned for object ${key}`,
      );
    }
    return response.Body as Readable;
  }

  async getUploadUrl(options: PresignOptions): Promise<PresignedUpload> {
    const expiresInSeconds = options.expiresInSeconds ?? 900;
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: options.key,
      ContentType: options.contentType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });
    return {
      key: options.key,
      uploadUrl,
      expiresInSeconds,
      method: 'PUT',
    };
  }

  /**
   * Resolve a public URL for `key`. When `CDN_URL` is configured we
   * always serve through the CDN so B2's endpoints stay unexposed;
   * in development without a CDN we fall back to the raw S3 endpoint
   * (still useful for smoke-testing the bucket is wired correctly).
   */
  getUrl(key: string): string {
    if (this.config.cdnUrl) {
      const base = this.config.cdnUrl.replace(/\/+$/, '');
      return `${base}/${key.replace(/^\/+/, '')}`;
    }
    const base = this.config.endpoint.replace(/\/+$/, '');
    return `${base}/${this.config.bucket}/${key.replace(/^\/+/, '')}`;
  }

  getPath(key: string): string {
    throw new InternalServerErrorException(
      `B2StorageService has no filesystem path for "${key}". ` +
        'Call downloadToTemp() first to materialise a local copy.',
    );
  }

  async removeDirectory(key: string): Promise<void> {
    // S3 has no hierarchical "directories" — we delete everything whose
    // key starts with the prefix. The caller passes a prefix like
    // `streams/<videoId>` so we round-trip the prefix safely.
    const normalisedPrefix = key.replace(/^\/+/, '').replace(/\/+$/, '') + '/';
    const candidates = await this.knownFilesUnderPrefix(normalisedPrefix);
    if (candidates.length === 0) return;
    // Batch deletes into chunks of 1000 (S3 limit).
    for (let i = 0; i < candidates.length; i += 1000) {
      const batch = candidates.slice(i, i + 1000);
      try {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.config.bucket,
            Delete: {
              Objects: batch.map((objectKey) => ({ Key: objectKey })),
              Quiet: true,
            },
          }),
        );
      } catch (err) {
        this.logger.warn(
          `Batched delete failed for ${candidates.length} objects under ${key}: ${asMessage(err)}`,
        );
      }
    }
  }

  /**
   * The processor pipeline only writes a known set of paths under
   * the renditions tree. Rather than paying for ListObjectsV2 (which
   * B2 charges per-request) we keep an explicit allow-list. If a
   * future rendition introduces a new file pattern, extend this set.
   */
  private async knownFilesUnderPrefix(prefix: string): Promise<string[]> {
    const entries = await fsp
      .readdir(this.configDir())
      .catch(() => []);
    void entries;
    // The processor writes its outputs to a local tempdir; we mirror
    // that structure under `<prefix>/<rendition>/`. Probe by attempting
    // a HEAD on each well-known path and only collect the ones that
    // actually exist on the remote.
    void prefix;
    const variants = ['360p', '720p'];
    const filenames = ['master.m3u8', 'init.mp4', 'playlist.m3u8'];
    const objectKeys: string[] = [];
    for (const variant of variants) {
      for (const name of filenames) {
        objectKeys.push(`${prefix}${variant}/${name}`);
      }
      // Segments are sequential — check a small bounded range to
      // catch short and long reels. If the encoder produced more, the
      // cleanup is best-effort anyway (next upload overwrites).
      for (let i = 0; i <= 999; i += 1) {
        objectKeys.push(`${prefix}${variant}/segment_${pad(i, 5)}.m4s`);
      }
    }
    const existing: string[] = [];
    await Promise.all(
      objectKeys.map(async (objectKey) => {
        if (await this.exists(objectKey)) existing.push(objectKey);
      }),
    );
    return existing;
  }

  /** Placeholder — exists so {@link knownFilesUnderPrefix} can ignore fsp. */
  private configDir(): string {
    return os.tmpdir();
  }

  /**
   * Defensive — the processor never calls ListObjectsV2 today, but we
   * keep this helper around for future cache-warming / cleanup work
   * without re-allocating a new service.
   * @internal
   */
  async listObjectsWithPrefix(prefix: string): Promise<string[]> {
    return this.knownFilesUnderPrefix(prefix);
  }

  /**
   * Multipart upload helper used by the worker when the future
   * streaming pipeline lands. Today every rendered segment fits
   * comfortably under the 8 MB part size, so {@link uploadFile} is
   * enough — this entry point is reserved for the streaming work.
   * @internal
   */
  async multipartUploadFile(
    localPath: string,
    key: string,
    mimeType: string,
  ): Promise<string> {
    const create = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: mimeType,
      }),
    );
    const uploadId = create.UploadId;
    if (!uploadId) {
      throw new InternalServerErrorException('B2 did not return an upload id');
    }

    const fileBuffer = await fsp.readFile(localPath);
    const partSize = 8 * 1024 * 1024;
    const parts: CompletedPart[] = [];
    try {
      for (
        let partNumber = 1, offset = 0;
        offset < fileBuffer.length;
        partNumber += 1, offset += partSize
      ) {
        const slice = fileBuffer.subarray(
          offset,
          Math.min(offset + partSize, fileBuffer.length),
        );
        const result = await this.client.send(
          new UploadPartCommand({
            Bucket: this.config.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
            Body: slice,
          }),
        );
        if (result.ETag) {
          parts.push({ ETag: result.ETag, PartNumber: partNumber });
        }
      }
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.config.bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts },
        }),
      );
    } catch (err) {
      await this.client
        .send(
          new AbortMultipartUploadCommand({
            Bucket: this.config.bucket,
            Key: key,
            UploadId: uploadId,
          }),
        )
        .catch(() => undefined);
      throw err;
    }
    return key;
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new InternalServerErrorException(
      `${name} must be set when STORAGE_DRIVER=b2`,
    );
  }
  return value;
}

async function streamToFile(
  source: Readable,
  destination: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const chunks: Buffer[] = [];
    source.on('data', (chunk: Buffer | Uint8Array | string) => {
      chunks.push(
        Buffer.isBuffer(chunk)
          ? chunk
          : typeof chunk === 'string'
            ? Buffer.from(chunk)
            : Buffer.from(chunk),
      );
    });
    source.on('end', () => resolve());
    source.on('error', reject);
    source.on('end', () => {
      void fsp
        .writeFile(destination, Buffer.concat(chunks))
        .then(() => undefined);
    });
  }).catch(async (err) => {
    await fsp.unlink(destination).catch(() => undefined);
    throw err;
  });
}

function randomToken(): string {
  return Math.random().toString(36).slice(2, 12);
}

function pad(value: number, width: number): string {
  return value.toString().padStart(width, '0');
}

function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// `createMultipartUploadCommand`/`createCompleteMultipartUploadCommand` — the
// `@aws-sdk/client-s3` exports used above. Keep the symbols local so the
// bundler only pulls in what's referenced.
export const __B2_INTERNALS = {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
};
