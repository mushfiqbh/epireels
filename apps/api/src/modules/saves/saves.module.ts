import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SavesController } from './saves.controller';
import { SavesService } from './saves.service';

@Module({
  imports: [PrismaModule],
  controllers: [SavesController],
  providers: [SavesService],
  exports: [SavesService],
})
export class SavesModule {}
