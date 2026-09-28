import { NestFactory } from '@nestjs/core';
import * as express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

import { WinstonModule } from 'nest-winston';
import { buildWinstonConfig } from './common/logging/winston.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Replace the default console-only Nest logger with Winston so the
    // framework's bootstrap banner, route table, and every Nest-managed
    // `Logger` flow through the same transports defined in
    // `common/logging/winston.config.ts` (console + rotated file logs).
    logger: WinstonModule.createLogger(buildWinstonConfig()),
    bufferLogs: true,
  });

  // Security headers — CSP stays permissive since the web app is served
  // from a different origin than the API in production.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Permit the Next.js dev server to hit the API during local dev.
  // In production the web origin MUST be set explicitly via WEB_ORIGIN —
  // an empty allow-list silently opens CORS to every origin, which would
  // also work with `credentials: true` but means any malicious site the
  // user visits can issue authenticated cross-origin requests against
  // this API. Set `WEB_ORIGIN=https://epireels.netlify.app` (comma-
  // separated for multiple frontends) in the aaPanel env.
  const allowedOrigins = (
    process.env.WEB_ORIGIN ??
    'http://localhost:3000,http://localhost:8081,http://localhost:19006,https://epireels.netlify.app'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Cookies must be parsed before the auth guards run.
  app.use(cookieParser());

  // Allow multipart bodies up to 500 MB to match the upload controller's
  // hard cap. JSON payloads stay small.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
