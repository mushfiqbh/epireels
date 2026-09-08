import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Options,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { StorageService } from '../storage/storage.interface';
import { STORAGE_SERVICE } from '../storage/storage.interface';

/**
 * Build the value for the `Access-Control-Allow-Origin` response header.
 *
 * Nest's `enableCors()` middleware is bypassed whenever a controller
 * takes ownership of the response via `@Res()` and pipes a stream
 * directly into it. That means every `/media/*` request was leaving the
 * API without CORS headers, so the browser refused to read the bytes
 * for cross-origin `<video>` requests (web :3000 → API :4000) — symptom:
 * the seek bar is stuck at `0:00 / 0:00` because `loadedmetadata`
 * never fires.
 *
 * We mirror Nest's allow-list logic here so this controller's responses
 * match what `app.enableCors({ origin: ... })` would have written.
 */
function resolveAllowedOrigin(req: Request): string {
  const raw =
    process.env.WEB_ORIGIN ??
    'http://localhost:3000,http://localhost:8081,http://localhost:19006';
  const allowed = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const requestOrigin = req.headers.origin;
  if (!requestOrigin) return '*';
  if (allowed.length === 0) return '*';
  return allowed.includes(requestOrigin) ? requestOrigin : allowed[0];
}

function applyMediaCorsHeaders(req: Request, res: Response): void {
  res.setHeader('Access-Control-Allow-Origin', resolveAllowedOrigin(req));
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Accept-Ranges, Content-Range, Content-Length, Content-Type',
  );
  // Lets the browser embed media that arrived from another origin
  // (required for `<video>` playback on Chromium-based browsers when
  // the file is fetched cross-origin).
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  // Disable caching at intermediaries so range requests stay consistent.
  res.setHeader('Cache-Control', 'public, max-age=3600');
}

interface ParsedRange {
  start: number;
  end: number;
}

function parseRange(
  header: string,
  totalSize: number,
): ParsedRange {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) {
    throw new BadRequestException(
      'Invalid Range header. Expected format: bytes=start-end',
    );
  }

  const [, rawStart, rawEnd] = match;
  let start: number;
  let end: number;

  if (rawStart === '' && rawEnd === '') {
    throw new BadRequestException('Invalid Range header: empty range.');
  }

  if (rawStart === '') {
    // Suffix range: last N bytes
    const suffix = Number(rawEnd);
    if (Number.isNaN(suffix) || suffix <= 0) {
      throw new BadRequestException('Invalid Range header.');
    }
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? totalSize - 1 : Number(rawEnd);
  }

  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    start < 0 ||
    end < start ||
    start >= totalSize
  ) {
    throw new BadRequestException('Range out of bounds.');
  }

  end = Math.min(end, totalSize - 1);
  return { start, end };
}

function inferMimeType(key: string): string {
  const ext = key.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    case 'mkv':
      return 'video/x-matroska';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

function safeKeyFromPath(rawPath: string | string[]): string {
  const segments = Array.isArray(rawPath)
    ? rawPath
    : [rawPath];

  if (segments.length === 0) {
    throw new BadRequestException('Empty media path.');
  }

  const joined = segments
    .flatMap((segment) => segment.split(','))
    .join('/');

  if (
    joined.includes('..') ||
    joined.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(joined)
  ) {
    throw new BadRequestException(
      'Path traversal is not allowed.',
    );
  }

  return joined.replace(/^\/+/, '');
}

@Controller('media')
export class MediaController {
  constructor(
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  /**
   * Preflight for cross-origin `<video>` / `<source>` probes.
   *
   * The global `enableCors()` middleware in `main.ts` already handles
   * OPTIONS for JSON routes, but route-level `@Res()` handlers skip
   * Nest's auto-pipeline, so we still need this for `/media/*`.
   */
  @Options('*path')
  preflight(
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    applyMediaCorsHeaders(req, res);
    res.status(204).end();
  }

  @Get('*path')
  async serve(
    @Param('path') rawPath: string | string[],
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const key = safeKeyFromPath(rawPath);

    const exists = await this.storage.exists(key);
    if (!exists) {
      throw new NotFoundException(`Media not found: ${key}`);
    }

    const { size } = await this.storage.getStats(key);
    const mimeType = inferMimeType(key);
    const rangeHeader = req.headers.range;

    applyMediaCorsHeaders(req, res);

    if (!rangeHeader) {
      const stream = await this.storage.getStream(key);
      res.status(200);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', size.toString());
      res.setHeader('Accept-Ranges', 'bytes');
      // Pipe with explicit error handling so a half-written stream
      // doesn't leave the connection hanging and the response headers
      // get flushed in the right order.
      stream.on('error', (err) => {
        console.error('[media] stream error', key, err);
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.destroy(err);
        }
      });
      stream.pipe(res);
      return;
    }

    const { start, end } = parseRange(rangeHeader, size);
    const chunkSize = end - start + 1;
    const stream = await this.storage.getStream(key, { start, end });

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', chunkSize.toString());
    res.setHeader('Content-Type', mimeType);
    stream.on('error', (err) => {
      console.error('[media] stream error', key, err);
      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.destroy(err);
      }
    });
    stream.pipe(res);
  }
}