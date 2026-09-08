import {
  Body,
  Controller,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminService, type MulterFile } from './admin.service';
import type { AdminUploadResponseDto } from './dto/admin-upload.dto';

/**
 * Admin upload controller.
 *
 * `POST /api/v1/admin/uploads`
 *
 * Accepts a `multipart/form-data` body:
 *   - `file`             (required) the video file
 *   - `episodeTitle`     (optional) when present, creates an Episode row
 *   - `seriesId`         (optional) attach to an existing Series cuid
 *   - `seriesTitle`      (optional) create a new Series when no id
 *   - `description`      (optional) episode synopsis
 *   - `seasonNumber`     (optional, defaults to 1)
 *   - `episodeNumber`    (optional, defaults to max + 1)
 *
 * Returns {@link AdminUploadResponseDto}.
 *
 * No authentication — see the README for the env-var kill switch.
 */
@Controller('api/v1/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('uploads')
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      // 500 MB hard cap. Anything bigger is almost certainly a mistake
      // or a server abuse attempt.
      limits: { fileSize: 500 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile() file: MulterFile | undefined,
    @Body() body: AdminUploadBody,
  ): Promise<AdminUploadResponseDto> {
    assertAdminEnabled();
    return this.adminService.uploadVideo({
      file,
      seriesId: nonEmpty(body.seriesId),
      seriesTitle: nonEmpty(body.seriesTitle),
      episodeTitle: nonEmpty(body.episodeTitle),
      description: nonEmpty(body.description),
      seasonNumber: parseOptionalInt(body.seasonNumber),
      episodeNumber: parseOptionalInt(body.episodeNumber),
    });
  }
}

/** Admin-upload metadata fields. All optional except `file`. */
interface AdminUploadBody {
  seriesId?: string;
  seriesTitle?: string;
  episodeTitle?: string;
  description?: string;
  seasonNumber?: string;
  episodeNumber?: string;
}

function nonEmpty(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return undefined;
  return parsed;
}

/**
 * Gate the admin endpoint behind a single env flag.
 *
 * - `ADMIN_UPLOAD_ENABLED=false`  → always 503
 * - `NODE_ENV=production` and `ADMIN_ALLOW_PROD !== 'true'` → 503
 * - otherwise → request proceeds
 */
function assertAdminEnabled(): void {
  if (process.env.ADMIN_UPLOAD_ENABLED === 'false') {
    throw new ServiceUnavailableException(
      'Admin uploads are disabled (ADMIN_UPLOAD_ENABLED=false).',
    );
  }
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ADMIN_ALLOW_PROD !== 'true'
  ) {
    throw new ServiceUnavailableException(
      'Admin uploads are disabled in production. ' +
        'Set ADMIN_ALLOW_PROD=true to enable.',
    );
  }
}