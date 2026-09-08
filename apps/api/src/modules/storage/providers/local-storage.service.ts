import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { Readable } from 'stream';
import {
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
 */
@Injectable()
export class LocalStorageService
  implements StorageService, OnModuleInit
{
  private readonly logger = new Logger(LocalStorageService.name);
  private baseDir!: string;
  private readonly baseUrlPath = '/media';

  onModuleInit(): void {
    const rawBase = process.env.STORAGE_LOCAL_PATH ?? './storage/development';
    const resolved = path.resolve(process.cwd(), rawBase);
    this.baseDir = path.normalize(resolved);
    this.logger.log(`LocalStorageService base directory: ${this.baseDir}`);
  }

  private resolveSafePath(key: string): string {
    const normalisedKey = path
      .normalize(key)
      .replace(/^([./\\]+)/, '');

    const candidate = path.normalize(path.join(this.baseDir, normalisedKey));

    const baseWithSep = this.baseDir.endsWith(path.sep)
      ? this.baseDir
      : `${this.baseDir}${path.sep}`;

    if (
      candidate !== this.baseDir &&
      !candidate.startsWith(baseWithSep)
    ) {
      throw new InternalServerErrorException(
        'Invalid storage key: path traversal detected.',
      );
    }

    return candidate;
  }

  async upload(
    fileBuffer: Buffer,
    key: string,
    _mimeType: string,
  ): Promise<string> {
    const targetPath = this.resolveSafePath(key);
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await fsp.writeFile(targetPath, fileBuffer);
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

  getUrl(key: string): string {
    const normalisedKey = key.replace(/^\/+/, '');
    const relative = `${this.baseUrlPath}/${normalisedKey}`;
    // Resolve against APP_BASE_URL so consumers always receive an
    // absolute URL they can hand to <video src>, <img src>, etc. The
    // web client is served from a different origin (localhost:3000) than
    // the API (localhost:4000), so a relative URL gets resolved against
    // the wrong host and the request 404s. Defaults to
    // http://localhost:4000 to match the dev .env example.
    const rawBase =
      process.env.APP_BASE_URL ?? 'http://localhost:4000';
    const base = rawBase.replace(/\/+$/, '');
    return `${base}${relative}`;
  }
}