import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import request from 'supertest';
import { App } from 'supertest/types';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { COOKIE_ACCESS, COOKIE_CSRF, COOKIE_REFRESH } from '../src/modules/auth/auth.service';
import { STORAGE_SERVICE, StorageService } from '../src/modules/storage/storage.interface';

const execFileAsync = promisify(execFile);

/** Full login -> multipart upload -> FFmpeg -> READY playback smoke test. */
describe('Video processing flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let storage: StorageService;
  let fixtureDir: string;
  let fixture: Buffer;

  beforeAll(async () => {
    fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'epireels-e2e-'));
    const fixturePath = path.join(fixtureDir, 'fixture.mp4');
    const ffmpeg = process.env.FFMPEG_PATH || (process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    await execFileAsync(ffmpeg, [
      '-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=1',
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', fixturePath,
    ]);
    fixture = await fs.readFile(fixturePath);

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    storage = moduleFixture.get<StorageService>(STORAGE_SERVICE);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (fixtureDir) await fs.rm(fixtureDir, { recursive: true, force: true });
  });

  it('logs in, uploads a video, and waits for successful processing', async () => {
    const suffix = randomBytes(6).toString('hex');
    const user = {
      email: `video-e2e-${suffix}@example.com`,
      username: `video_e2e_${suffix}`,
      password: 'sup3r-secret-pw!',
      displayName: `Video E2E ${suffix}`,
    };
    const seriesSlug = `video-e2e-${suffix}`;
    let uploadId: string | undefined;
    let videoId: string | undefined;
    let episodeId: string | undefined;

    try {
      await request(app.getHttpServer()).post('/api/v1/auth/signup').send(user).expect(201);
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);
      const setCookieHeader = login.headers['set-cookie'];
      const setCookies = Array.isArray(setCookieHeader)
        ? setCookieHeader
        : setCookieHeader
          ? [setCookieHeader]
          : [];
      const cookieHeader = setCookies.map((cookie) => cookie.split(';')[0]).join('; ');
      const cookieValue = (name: string) => {
        const pair = setCookies.map((cookie) => cookie.split(';')[0]).find((item) => item.startsWith(`${name}=`));
        return pair ? decodeURIComponent(pair.slice(name.length + 1)) : '';
      };
      const csrf = cookieValue(COOKIE_CSRF);
      if (!cookieValue(COOKIE_ACCESS) || !cookieValue(COOKIE_REFRESH) || !csrf) {
        throw new Error('Login response did not include access, refresh, and CSRF cookies.');
      }
      console.info(`[video-e2e] SUCCESS login user=${user.email}`);

      const uploaded = await request(app.getHttpServer())
        .post('/api/v1/uploads')
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrf)
        .attach('file', fixture, { filename: 'fixture.mp4', contentType: 'video/mp4' })
        .field('episodeTitle', 'Processing smoke test')
        .field('seriesTitle', seriesSlug)
        .expect(201);
      videoId = uploaded.body.videoId as string;
      if (!videoId) throw new Error(`Upload response omitted videoId: ${JSON.stringify(uploaded.body)}`);
      console.info(`[video-e2e] SUCCESS upload videoId=${videoId} bytes=${fixture.length}`);

      const deadline = Date.now() + 120_000;
      let video = null as Awaited<ReturnType<typeof prisma.video.findUnique>>;
      while (Date.now() < deadline) {
        video = await prisma.video.findUnique({ where: { id: videoId } });
        if (video?.processingStatus === 'READY' || video?.processingStatus === 'FAILED') break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!video || video.processingStatus !== 'READY') {
        const detail = video?.processingError ?? `Timed out; last status=${video?.processingStatus ?? 'missing'}`;
        console.error(`[video-e2e] ERROR processing videoId=${videoId}: ${detail}`);
        throw new Error(`Video processing did not reach READY: ${detail}`);
      }

      const playback = await request(app.getHttpServer()).get(`/api/v1/videos/${videoId}/playback`).expect(200);
      if (playback.body.status !== 'READY' || !playback.body.manifestUrl) {
        throw new Error(`Playback was not ready: ${JSON.stringify(playback.body)}`);
      }
      console.info(`[video-e2e] SUCCESS processing videoId=${videoId} manifest=${playback.body.manifestUrl}`);
    } catch (error) {
      console.error(`[video-e2e] ERROR flow user=${user.email}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
      throw error;
    } finally {
      if (videoId) {
        const video = await prisma.video.findUnique({ where: { id: videoId } }).catch(() => null);
        episodeId = video?.episodeId;
        uploadId = video?.uploadId ?? undefined;
        await storage.removeDirectory(`streams/${videoId}`).catch(() => undefined);
        await storage.removeDirectory(`thumbnails/${videoId}`).catch(() => undefined);
        if (video?.filePath) await storage.delete(video.filePath).catch(() => undefined);
      }
      if (episodeId) await prisma.episode.delete({ where: { id: episodeId } }).catch(() => undefined);
      if (uploadId) await prisma.upload.delete({ where: { id: uploadId } }).catch(() => undefined);
      await prisma.series.delete({ where: { slug: seriesSlug } }).catch(() => undefined);
      await prisma.refreshToken.deleteMany({ where: { user: { email: user.email } } }).catch(() => undefined);
      await prisma.user.delete({ where: { email: user.email } }).catch(() => undefined);
    }
  }, 180_000);
});
