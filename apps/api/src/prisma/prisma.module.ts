import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global Prisma module — exposes a single `PrismaService` instance to the
 * whole app. The schema lives in `apps/api/prisma/schema.prisma`; the
 * client is generated into `node_modules/.prisma/client` by
 * `pnpm --filter @epireels/api prisma:generate` (or `prisma generate`).
 *
 * `DATABASE_URL` (and optionally `DIRECT_URL` for PgBouncer) must be set
 * in the environment — see `apps/api/.env.example`.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
