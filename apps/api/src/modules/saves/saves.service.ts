import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ToggleSaveResult {
  saved: boolean;
  episodeId: string;
}

@Injectable()
export class SavesService {
  constructor(private readonly prisma: PrismaService) {}

  async toggle(userId: string, episodeId: string): Promise<ToggleSaveResult> {
    const existing = await this.prisma.save.findUnique({
      where: { userId_episodeId: { userId, episodeId } },
    });
    if (existing) {
      await this.prisma.save.delete({ where: { id: existing.id } });
      return { saved: false, episodeId };
    }
    await this.prisma.save.create({ data: { userId, episodeId } });
    return { saved: true, episodeId };
  }

  async remove(userId: string, episodeId: string): Promise<void> {
    await this.prisma.save
      .delete({ where: { userId_episodeId: { userId, episodeId } } })
      .catch(() => undefined);
  }

  async listForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.save.findMany({
      where: { userId },
      select: { episodeId: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => row.episodeId);
  }
}
