import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { CommentsModule } from './modules/comments/comments.module';
import { EpisodesModule } from './modules/episodes/episodes.module';
import { LikesModule } from './modules/likes/likes.module';
import { MediaModule } from './modules/media/media.module';
import { SavesModule } from './modules/saves/saves.module';
import { SeriesModule } from './modules/series/series.module';
import { StorageModule } from './modules/storage/storage.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { UsersModule } from './modules/users/users.module';
import { VideoModule } from './modules/video/video.module';
import { CsrfGuard } from './common/guards/csrf.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    MediaModule,
    EpisodesModule,
    SeriesModule,
    VideoModule,
    AuthModule,
    LikesModule,
    SavesModule,
    CommentsModule,
    UploadsModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Order matters: passport needs the JWT verified before we check roles
    // or CSRF, so JwtAuthGuard runs first, then CsrfGuard, then RolesGuard.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
