import { NestFactory } from '@nestjs/core';
import * as express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers — CSP stays permissive since the web app is served
  // from a different origin than the API in production.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Permit the Next.js dev server to hit the API during local dev.
  // In production the web origin should be set explicitly via env.
  const allowedOrigins = (
    process.env.WEB_ORIGIN ??
    'http://localhost:3000,http://localhost:8081,http://localhost:19006,https://epireels.vercel.app'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
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
