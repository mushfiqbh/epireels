import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import * as fs from 'fs';
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

/**
 * Local-filesystem implementation of {@link StorageService}.
 *
 * Files are resolved relative to {@link STORAGE_LOCAL_PATH} (defaults to
 * `./storage/development`). All public methods normalise the requested key
 * and verify that the resolved absolute path stays within the configured
 * base directory, preventing directory-traversal attacks.
 *
 * {@link getUploadUrl} returns a marker URL the media controller
 * recognises (`/api/v1/local-uploads/<key>`) so the dev-time
 * direct-upload flow can be exercised end-to-end without standing up
 * B2. The browser PUTs the bytes there and the controller writes them
 * to the same local directory.
 */
@Injectable()
export class LocalStorageService implements StorageService, OnModuleInit {
  private readonly logger = new Logger(LocalStorageService.name);
  private baseDir!: string;
  private readonly baseUrlPath = '/media';

  readonly isRemote = false;

  onModuleInit(): void {
    const rawBase = process.env.STORAGE_LOCAL_PATH ?? './storage/development';
    const configured = path.resolve(process.cwd(), rawBase);
    const repositoryStorage = path.resolve(
      __dirname,
      '../../../../../../storage/development',
    );
    const resolved = path.isAbsolute(rawBase)
      ? configured
      : this.directoryExists(configured)
        ? configured
        : repositoryStorage;
    this.baseDir = path.normalize(resolved);
    this.logger.log(`LocalStorageService base directory: ${this.baseDir}`);
  }

  private directoryExists(directory: string): boolean {
    try {
      return fs.statSync(directory).isDirectory();
    } catch {
      return false;
    }
  }

  private resolveSafePath(key: string): string {
    const normalisedKey = path.normalize(key).replace(/^([./\\]+)/, '');

    const candidate = path.normalize(path.join(this.baseDir, normalisedKey));

    const baseWithSep = this.baseDir.endsWith(path.sep)
      ? this.baseDir
      : `${this.baseDir}${path.sep}`;

    if (candidate !== this.baseDir && !candidate.startsWith(baseWithSep)) {
      throw new InternalServerErrorException(
        'Invalid storage key: path traversal detected.',
      );
    }

    return candidate;
  }

  async upload(
    fileBuffer: Buffer,
    key: string,
    mimeType: string,
  ): Promise<string> {
    void mimeType;
    const targetPath = this.resolveSafePath(key);
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await fsp.writeFile(targetPath, fileBuffer);
    return key;
  }

  async uploadFile(
    localPath: string,
    key: string,
    mimeType: string,
  ): Promise<string> {
    void mimeType;
    const targetPath = this.resolveSafePath(key);
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await fsp.copyFile(localPath, targetPath);
    return key;
  }

  async delete(key: string): Promise<void> {
    const targetPath = this.resolveSafePath(key);
    try {
      await fsp.unlink(targetPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    const targetPath = this.resolveSafePath(key);
    try {
      await fsp.access(targetPath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  async downloadToTemp(key: string): Promise<string> {
    // The source already lives on disk — just return the safe path.
    return this.resolveSafePath(key);
  }

  async getStats(key: string): Promise<StorageResourceStats> {
    const targetPath = this.resolveSafePath(key);
    const stat = await fsp.stat(targetPath);
    return {
      size: stat.size,
      mtime: stat.mtime,
    };
  }

  getStream(
    key: string,
    options?: { start?: number; end?: number },
  ): Promise<Readable> {
    const targetPath = this.resolveSafePath(key);

    if (options?.start !== undefined || options?.end !== undefined) {
      const stream = fs.createReadStream(targetPath, {
        start: options.start,
        end: options.end,
      });
      return Promise.resolve(stream);
    }

    const stream = fs.createReadStream(targetPath);
    return Promise.resolve(stream);
  }

  /**
   * Local-driver stand-in for presigned uploads. We mint a URL under
   * `/api/v1/local-uploads/<key>` that the {@link LocalUploadController}
   * accepts as a `PUT`. This keeps the dev-time upload flow identical
   * to production: the browser asks for an upload URL, PUTs bytes, then
   * hits `/upload-complete` — only the transport changes.
   */
  async getUploadUrl(options: PresignOptions): Promise<PresignedUpload> {
    const expiresInSeconds = options.expiresInSeconds ?? 900;
    const rawBase = process.env.APP_BASE_URL ?? 'http://localhost:4000';
    const base = rawBase.replace(/\/+$/, '');
    const uploadUrl = `${base}/api/v1/local-uploads/${encodeURIComponent(
      options.key,
    )}?expires=${expiresInSeconds}`;
    return {
      key: options.key,
      uploadUrl,
      expiresInSeconds,
      method: 'PUT',
    };
  }

  getUrl(key: string): string {
    const normalisedKey = key.replace(/^\/+/, '');
    const relative = `${this.baseUrlPath}/${normalisedKey}`;
    // Resolve against APP_BASE_URL so consumers always receive an
    // absolute URL they can hand to <video src>, <img src>, etc. The
    // web client is served from a different origin (localhost:3000) than
    // the API (localhost:4000), so a relative URL gets resolved against
    // the wrong host and the request 404s. Defaults to
    // http://localhost:4000 to match the dev .env example.
    const rawBase = process.env.APP_BASE_URL ?? 'http://localhost:4000';
    const base = rawBase.replace(/\/+$/, '');
    return `${base}${relative}`;
  }

  getPath(key: string): string {
    return this.resolveSafePath(key);
  }

  async removeDirectory(key: string): Promise<void> {
    await fsp.rm(this.resolveSafePath(key), { recursive: true, force: true });
  }

  /**
   * Convenience used by the local upload controller when materialising
   * a browser PUT. Returns the absolute path the bytes should land at.
   */
  resolveUploadTarget(key: string): string {
    return this.resolveSafePath(key);
  }

  /**
   * Locate an existing tempdir, creating one if missing. Mirrors the
   * S3 driver's download helper so the FFmpeg pipeline can call it
   * uniformly regardless of driver.
   */
  static async ensureTempRoot(): Promise<string> {
    const root = path.join(os.tmpdir(), 'epireels-video');
    await fsp.mkdir(root, { recursive: true });
    return root;
  }
}
