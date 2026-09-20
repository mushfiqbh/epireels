import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ToggleLikeResult {
  liked: boolean;
  episodeId: string;
}

/**
 * Likes — thin wrapper over the `likes` table.
 *
 * Likes are unique per (user, episode); the toggle helper returns the
 * resulting state so the front-end does not have to track it locally.
 */
@Injectable()
export class LikesService {
  constructor(private readonly prisma: PrismaService) {}

  async toggle(userId: string, episodeId: string): Promise<ToggleLikeResult> {
    const existing = await this.prisma.like.findUnique({
      where: { userId_episodeId: { userId, episodeId } },
    });
    if (existing) {
      await this.prisma.like.delete({ where: { id: existing.id } });
      return { liked: false, episodeId };
    }
    await this.prisma.like.create({ data: { userId, episodeId } });
    return { liked: true, episodeId };
  }

  async remove(userId: string, episodeId: string): Promise<void> {
    await this.prisma.like
      .delete({
        where: { userId_episodeId: { userId, episodeId } },
      })
      .catch(() => undefined);
  }

  async listForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.like.findMany({
      where: { userId },
      select: { episodeId: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => row.episodeId);
  }
}
