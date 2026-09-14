import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { VideoModule } from '../video/video.module';

@Module({
  imports: [PrismaModule, VideoModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
