import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { VideoController } from './video.controller';
import { VideoProcessor } from './video.processor';
import { VideoService } from './video.service';

@Module({
  imports: [PrismaModule],
  controllers: [VideoController],
  providers: [VideoProcessor, VideoService],
  exports: [VideoProcessor, VideoService],
})
export class VideoModule {}
