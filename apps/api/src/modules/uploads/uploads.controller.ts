import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import type { MulterFile, AdminUploadResponseDto } from './dto/upload.dto';

/**
 * Member-upload endpoints.
 *
 *   POST   /api/v1/uploads                 Upload a reel to the caller's account.
 *   GET    /api/v1/uploads/me              List the caller's uploads.
 *   DELETE /api/v1/uploads/:uploadId       Delete an upload the caller owns.
 *
 * These are guarded by `JwtAuthGuard` (set globally) — no `@Public()`
 * decorator, so anonymous callers get 401. The admin-only
 * `POST /api/v1/admin/uploads` remains in `AdminController` and is
 * further restricted with `@Roles('admin')`.
 */
@Controller('api/v1/uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 500 * 1024 * 1024 },
    }),
  )
  async upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: MulterFile | undefined,
    @Body() body: AdminUploadBody,
  ): Promise<AdminUploadResponseDto> {
    return this.uploads.uploadVideo({
      ownerId: user.sub,
      file,
      seriesId: nonEmpty(body.seriesId),
      seriesTitle: nonEmpty(body.seriesTitle),
      episodeTitle: nonEmpty(body.episodeTitle),
      description: nonEmpty(body.description),
      seasonNumber: parseOptionalInt(body.seasonNumber),
      episodeNumber: parseOptionalInt(body.episodeNumber),
    });
  }

  @Get('me')
  async list(@CurrentUser() user: JwtPayload) {
    const items = await this.uploads.listForOwner(user.sub);
    // Include the first video's processingStatus in the response
    return {
      items: items.map((upload) => {
        const { videos, ...rest } = upload;
        const video = videos[0];
        return {
          ...rest,
          processingStatus: video?.processingStatus ?? upload.status,
        };
      }),
    };
  }

  @Delete(':uploadId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('uploadId') uploadId: string,
  ) {
    await this.uploads.removeOwned(uploadId, user.sub, user.role);
  }
}

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
