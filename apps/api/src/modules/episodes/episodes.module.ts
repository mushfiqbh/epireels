import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { EpisodesController } from './episodes.controller';
import { EpisodesService } from './episodes.service';

@Module({
  imports: [PrismaModule],
  controllers: [EpisodesController],
  providers: [EpisodesService],
})
export class EpisodesModule {}