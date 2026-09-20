import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  AuthService,
  COOKIE_ACCESS,
  COOKIE_CSRF,
  COOKIE_REFRESH,
} from '../src/modules/auth/auth.service';

/**
 * End-to-end tests for the auth + engagement stack.
 *
 * These tests boot the full `AppModule` (so the global `APP_GUARD`s are
 * mounted and `CsrfGuard` is in the wire) and exercise the public surface
 * a real client would hit. The storage driver is whatever `.env` already
 * configures — for member uploads we use a tiny in-memory buffer that the
 * probe helper accepts without needing a real MP4.
 *
 * The tests intentionally namespace every test user under a unique UUID
 * email so multiple runs (and parallel CI) don't collide on the email
 * uniqueness constraint. Each test cleans its own rows on the way out.
 */
describe('Auth & engagement (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Build a fresh email/username pair every test so we never collide. */
  function uniqueUser() {
    const suffix = randomBytes(6).toString('hex');
    return {
      email: `test-${suffix}@example.com`,
      username: `test_${suffix}`,
      password: 'sup3r-secret-pw!',
      displayName: `Tester ${suffix}`,
    };
  }

  /** Pull the signed CSRF cookie value from a response. */
  function csrfCookie(res: request.Response): string {
    const raw = extractCookie(res, COOKIE_CSRF);
    if (!raw) {
      throw new Error('CSRF cookie missing on response');
    }
    // The cookie is `<raw>.<hmac>`; we send the signed value back so the
    // guard's timing-safe compare sees the exact bytes the server set.
    return raw;
  }

  function extractCookie(res: request.Response, name: string): string | undefined {
    // supertest aggregates Set-Cookie strings in `res.headers['set-cookie']`.
    const raw = res.headers['set-cookie'] ?? [];
    const list = Array.isArray(raw) ? raw : [raw];
    for (const entry of list) {
      const [pair] = entry.split(';');
      const [k, v] = pair.split('=');
      if (k === name && v !== undefined) return decodeURIComponent(v);
    }
    return undefined;
  }

  function cookieJar(res: request.Response): string {
    const raw = res.headers['set-cookie'] ?? [];
    const list = Array.isArray(raw) ? raw : [raw];
    return list.map((c) => c.split(';')[0]).join('; ');
  }

  function cookiesForRequests(res: request.Response): {
    jar: string;
    csrf: string;
    access: string;
    refresh: string;
  } {
    return {
      jar: cookieJar(res),
      csrf: csrfCookie(res),
      access: extractCookie(res, COOKIE_ACCESS) ?? '',
      refresh: extractCookie(res, COOKIE_REFRESH) ?? '',
    };
  }

  it('rejects anonymous `GET /me` with 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401);
  });

  it('signs a new member up, returns cookies, and lets them call /me', async () => {
    const user = uniqueUser();
    const signup = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send(user)
      .expect(201);

    const { jar, csrf, access, refresh } = cookiesForRequests(signup);
    expect(access).toBeTruthy();
    expect(refresh).toBeTruthy();
    expect(csrf).toMatch(/\..+/); // "<raw>.<hmac>"

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', jar)
      .expect(200);
    expect(me.body.user.email).toBe(user.email);
    expect(me.body.user.role).toBe('member');
    expect(typeof me.body.csrfToken).toBe('string');

    // Clean up so the test suite is idempotent.
    await prisma.refreshToken.deleteMany({
      where: { user: { email: user.email } },
    });
    await prisma.user.delete({ where: { email: user.email } }).catch(() => undefined);
  });

  it('logs an existing member back in and rejects bad passwords', async () => {
    const user = uniqueUser();
    const create = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send(user)
      .expect(201);
    const createJar = cookieJar(create);

    // Bad password → 401
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'nope-nope-nope' })
      .expect(401);

    // Right password → 200 + fresh cookies
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    const { access, refresh } = cookiesForRequests(login);
    expect(access).toBeTruthy();
    expect(refresh).toBeTruthy();

    await prisma.refreshToken.deleteMany({
      where: { user: { email: user.email } },
    });
    await prisma.user.delete({ where: { email: user.email } }).catch(() => undefined);
  });

  it('rejects POST /likes without an X-CSRF-Token, then succeeds with one', async () => {
    const user = uniqueUser();
    const signup = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send(user)
      .expect(201);
    const { jar, csrf } = cookiesForRequests(signup);

    // First, make an episode to like. We seed one directly through Prisma
    // so the test doesn't depend on the catalog endpoints.
    const season = await prisma.season.create({
      data: { series: { create: { title: 'CSRF test series', slug: `csrf-${randomBytes(4).toString('hex')}` } }, seasonNumber: 1, title: 'S1' },
    });
    const episode = await prisma.episode.create({
      data: { seasonId: season.id, episodeNumber: 1, title: 'CSRF ep' },
    });

    // No CSRF → 403
    await request(app.getHttpServer())
      .post('/api/v1/likes')
      .set('Cookie', jar)
      .send({ episodeId: episode.id })
      .expect(403);

    // With CSRF → 201
    await request(app.getHttpServer())
      .post('/api/v1/likes')
      .set('Cookie', jar)
      .set('X-CSRF-Token', csrf)
      .send({ episodeId: episode.id })
      .expect(201);

    // Cleanup
    await prisma.refreshToken.deleteMany({
      where: { user: { email: user.email } },
    });
    await prisma.like.deleteMany({ where: { user: { email: user.email } } });
    await prisma.user.delete({ where: { email: user.email } }).catch(() => undefined);
    await prisma.episode.delete({ where: { id: episode.id } }).catch(() => undefined);
    await prisma.season.delete({ where: { id: season.id } }).catch(() => undefined);
    await prisma.series.delete({ where: { id: season.seriesId } }).catch(() => undefined);
  });

  it('rotates the refresh token and rejects the old one afterwards', async () => {
    const user = uniqueUser();
    const signup = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send(user)
      .expect(201);
    const initial = cookiesForRequests(signup);

    const refresh = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `aep_rt=${initial.refresh}`)
      .expect(200);
    const rotated = cookiesForRequests(refresh);
    expect(rotated.refresh).toBeTruthy();
    expect(rotated.refresh).not.toBe(initial.refresh);

    // Old refresh token should now be revoked → 401
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `aep_rt=${initial.refresh}`)
      .expect(401);

    await prisma.refreshToken.deleteMany({
      where: { user: { email: user.email } },
    });
    await prisma.user.delete({ where: { email: user.email } }).catch(() => undefined);
  });

  it('denies a non-admin from POST /admin/uploads with 403', async () => {
    const user = uniqueUser();
    const signup = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send(user)
      .expect(201);
    const { jar, csrf } = cookiesForRequests(signup);

    await request(app.getHttpServer())
      .post('/api/v1/admin/uploads')
      .set('Cookie', jar)
      .set('X-CSRF-Token', csrf)
      .attach('file', Buffer.from('not really a video'), 'fake.mp4')
      .field('episodeTitle', 'Forbidden episode')
      .expect(403);

    await prisma.refreshToken.deleteMany({
      where: { user: { email: user.email } },
    });
    await prisma.user.delete({ where: { email: user.email } }).catch(() => undefined);
  });

  it('lets an admin post to /admin/uploads with a multipart file', async () => {
    const user = uniqueUser();
    await prisma.user.create({
      data: {
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        passwordHash:
          // bcrypt hash of `sup3r-secret-pw!` generated at cost 12 — we
          // log them in with that same password below.
          '$2b$12$Cw2zM4Z2u7yJtYwzC8XSXuJ7q2L8xk/8.placeholder',
        role: 'admin',
      },
    });
    // Replace the placeholder hash with a real bcrypt of the password.
    const hash = await AuthService.hashPassword(user.password);
    await prisma.user.update({
      where: { email: user.email },
      data: { passwordHash: hash },
    });

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    const { jar, csrf } = cookiesForRequests(login);

    const tinyMp4 = Buffer.from([
      // A 32-byte stub is enough to make Multer happy; the probe will
      // return no dimensions but the route doesn't reject on that.
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
      0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
      0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31,
    ]);
    const up = await request(app.getHttpServer())
      .post('/api/v1/admin/uploads')
      .set('Cookie', jar)
      .set('X-CSRF-Token', csrf)
      .attach('file', tinyMp4, { filename: 'tiny.mp4', contentType: 'video/mp4' })
      .field('episodeTitle', 'Admin e2e episode')
      .field('seriesTitle', 'Admin e2e series')
      .expect(201);

    expect(up.body.key).toMatch(/^originals\//);
    expect(up.body.processingStatus).toBe('UPLOADED');

    // Cleanup
    const videoId = up.body.videoId as string | undefined;
    if (videoId) {
      const video = await prisma.video.findUnique({ where: { id: videoId } });
      if (video !== null) {
        const episodeId = video.episodeId;
        const uploadId: string = video.uploadId ?? '';
        await prisma.episode
          .delete({ where: { id: episodeId } })
          .catch(() => undefined);
        if (uploadId) {
          await prisma.upload
            .delete({ where: { id: uploadId } })
            .catch(() => undefined);
        }
      }
    }
    // Series may or may not exist depending on slug collision
    await prisma.series
      .delete({ where: { slug: 'admin-e2e-series' } })
      .catch(() => undefined);
    await prisma.refreshToken.deleteMany({
      where: { user: { email: user.email } },
    });
    await prisma.user.delete({ where: { email: user.email } }).catch(() => undefined);
  });
});
