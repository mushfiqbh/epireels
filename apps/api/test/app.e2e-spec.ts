import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  // The legacy `Hello World!` route was replaced by `GET /api/v1/health`
  // (the global prefix moves everything under `/api/v1`). The boot probe is
  // marked `@Public()` so it does not require an access token.
  it('/api/v1/health (GET) is reachable without a cookie', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        if (!res.body || res.body.status !== 'ok') {
          throw new Error(
            `expected health.status === "ok", got ${JSON.stringify(res.body)}`,
          );
        }
      });
  });

  // Surface route not found as 404 (no JwtAuthGuard bypass for an unknown path).
  it('returns 404 for an unknown public path', () => {
    return request(app.getHttpServer())
      .get('/this-path-does-not-exist')
      .expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});
