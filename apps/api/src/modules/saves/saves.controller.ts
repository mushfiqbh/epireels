import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { SavesService } from './saves.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { EngagementToggleInput } from '@epireels/types';

/**
 * Per-user saved / favourited episodes.
 *
 *   GET    /api/v1/saves/me
 *   POST   /api/v1/saves        toggle
 *   DELETE /api/v1/saves/:episodeId  explicit remove
 */
@Controller('api/v1/saves')
export class SavesController {
  constructor(private readonly saves: SavesService) {}

  @Get('me')
  async listMine(@CurrentUser() user: JwtPayload) {
    const items = await this.saves.listForUser(user.sub);
    return { items };
  }

  @Post()
  @HttpCode(201)
  async toggle(
    @CurrentUser() user: JwtPayload,
    @Body() body: EngagementToggleInput,
  ) {
    return this.saves.toggle(user.sub, body.episodeId);
  }

  @Delete(':episodeId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('episodeId') episodeId: string,
  ) {
    await this.saves.remove(user.sub, episodeId);
  }
}
