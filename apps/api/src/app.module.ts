import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './modules/admin/admin.module';
import { EpisodesModule } from './modules/episodes/episodes.module';
import { MediaModule } from './modules/media/media.module';
import { SeriesModule } from './modules/series/series.module';
import { StorageModule } from './modules/storage/storage.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    MediaModule,
    EpisodesModule,
    SeriesModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
