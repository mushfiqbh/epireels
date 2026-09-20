import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { LikesService } from './likes.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { EngagementToggleInput } from '@epireels/types';

/**
 * Per-user likes.
 *
 *   GET  /api/v1/likes/me     ids of episodes the caller has liked
 *   POST /api/v1/likes        toggle like for an episode
 *   DELETE /api/v1/likes/:episodeId  explicit unlike
 */
@Controller('api/v1/likes')
export class LikesController {
  constructor(private readonly likes: LikesService) {}

  @Get('me')
  async listMine(@CurrentUser() user: JwtPayload) {
    const items = await this.likes.listForUser(user.sub);
    return { items };
  }

  @Post()
  @HttpCode(201)
  async toggle(
    @CurrentUser() user: JwtPayload,
    @Body() body: EngagementToggleInput,
  ) {
    const result = await this.likes.toggle(user.sub, body.episodeId);
    return result;
  }

  @Delete(':episodeId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('episodeId') episodeId: string,
  ) {
    await this.likes.remove(user.sub, episodeId);
  }
}
