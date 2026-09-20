import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';

/**
 * Per-user comments.
 *
 *   GET    /api/v1/comments?episodeId=…       List comments for an episode
 *   POST   /api/v1/comments                   Create a comment
 *   DELETE /api/v1/comments/:id               Author can delete their own
 */
@Controller('api/v1/comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  async list(@Query('episodeId') episodeId: string) {
    return this.comments.listForEpisode(episodeId);
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateCommentDto,
  ) {
    return this.comments.create(user.sub, body.episodeId, body.body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    await this.comments.remove(id, { id: user.sub, role: user.role });
  }

  @Post(':id/like')
  @HttpCode(200)
  async toggleLike(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.comments.toggleLike(id, user.sub);
  }
}
