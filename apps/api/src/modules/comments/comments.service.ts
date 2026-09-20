import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Comment } from '@prisma/client';

export interface CommentView {
  id: string;
  episodeId: string;
  author: { id: string; displayName: string | null; avatarUrl: string | null };
  body: string;
  createdAt: Date;
  likes: number;
  likedByCurrentUser?: boolean;
}

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, episodeId: string, body: string): Promise<CommentView> {
    const episode = await this.prisma.episode.findUnique({ where: { id: episodeId } });
    if (!episode) {
      throw new NotFoundException('Episode not found');
    }
    const row = await this.prisma.comment.create({
      data: { userId, episodeId, body },
    });
    return this.toView(row);
  }

  async listForEpisode(episodeId: string, userId?: string, limit = 50): Promise<CommentView[]> {
    const rows = await this.prisma.comment.findMany({
      where: { episodeId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { 
        user: true,
      },
    });
    
    // Get like counts and user like status in a separate query
    const commentIds = rows.map(r => r.id);
    const likeCounts = await this.prisma.commentLike.groupBy({
      by: ['commentId'],
      where: { commentId: { in: commentIds } },
      _count: { commentId: true },
    });
    
    const likeCountMap = new Map(likeCounts.map(l => [l.commentId, l._count.commentId as number]));
    
    let userLikedCommentIds: string[] = [];
    if (userId) {
      const userLikes = await this.prisma.commentLike.findMany({
        where: { 
          commentId: { in: commentIds },
          userId,
        },
        select: { commentId: true },
      });
      userLikedCommentIds = userLikes.map(l => l.commentId);
    }
    
    return rows.map((row) => this.toView(
      row, 
      row.user, 
      likeCountMap.get(row.id) || 0,
      userLikedCommentIds.includes(row.id)
    ));
  }

  /**
   * Delete a comment. Only the author or an admin may delete; otherwise
   * throw `ForbiddenException` so the caller learns they cannot do this
   * (vs. a 404 leak that would let enumerators probe ids).
   */
  async remove(id: string, actor: { id: string; role?: string }): Promise<void> {
    const row = await this.prisma.comment.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Comment not found');
    }
    if (row.userId !== actor.id && actor.role !== 'admin') {
      throw new ForbiddenException('You cannot delete this comment');
    }
    await this.prisma.comment.delete({ where: { id } });
  }

  async toggleLike(commentId: string, userId: string): Promise<{ liked: boolean }> {
    // Check if like exists using a findMany approach since the unique constraint might not be generated yet
    const existing = await this.prisma.commentLike.findFirst({
      where: {
        userId,
        commentId,
      },
    });

    if (existing) {
      await this.prisma.commentLike.delete({
        where: { id: existing.id },
      });
      return { liked: false };
    } else {
      await this.prisma.commentLike.create({
        data: { userId, commentId },
      });
      return { liked: true };
    }
  }

  private toView(row: Comment, user?: { id: string; displayName: string | null; avatarUrl: string | null }, likesCount = 0, likedByCurrentUser = false): CommentView {
    return {
      id: row.id,
      episodeId: row.episodeId,
      author: user
        ? { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl }
        : { id: row.userId, displayName: null, avatarUrl: null },
      body: row.body,
      createdAt: row.createdAt,
      likes: likesCount,
      likedByCurrentUser,
    };
  }
}
