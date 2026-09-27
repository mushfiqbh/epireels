import {
  BadRequestException,
  Controller,
  HttpCode,
  Inject,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { createWriteStream } from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import type { Request, Response } from 'express';
import { LocalStorageService } from './local-storage.service';
import { STORAGE_SERVICE, type StorageService } from '../storage.interface';

/**
 * Dev-only endpoint that accepts the browser `PUT` redirected by the
 * local driver's {@link LocalStorageService.getUploadUrl}. Production
 * uploads go directly to B2 via presigned URL — this controller
 * exists so the local development loop matches the same shape:
 *
 *   1. Browser asks the API for an upload URL.
 *   2. Browser PUTs the bytes to the URL we returned.
 *   3. Browser tells the API the upload completed.
 */
@Controller('api/v1/local-uploads')
export class LocalUploadController {
  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  @Put('*')
  @HttpCode(200)
  async upload(@Req() req: Request, @Res() res: Response): Promise<void> {
    if (!(this.storage instanceof LocalStorageService)) {
      throw new BadRequestException(
        'Local upload endpoint is only enabled when STORAGE_DRIVER=local.',
      );
    }
    const prefix = '/api/v1/local-uploads/';
    const rawKey = req.path.startsWith(prefix)
      ? req.path.slice(prefix.length)
      : req.path.replace(/^\/+/, '');
    const key = decodeURIComponent(rawKey);
    if (key.length === 0) {
      throw new BadRequestException('Missing storage key.');
    }
    const contentType =
      (req.headers['content-type'] as string | undefined) ??
      'application/octet-stream';
    const targetPath = this.storage.resolveUploadTarget(key);
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    try {
      await pipeline(req, createWriteStream(targetPath));
    } catch (err) {
      await fsp.unlink(targetPath).catch(() => undefined);
      throw err;
    }
    res.status(200).json({ ok: true, key, contentType });
  }
}
