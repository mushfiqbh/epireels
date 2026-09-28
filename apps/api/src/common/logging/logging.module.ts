import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { buildWinstonConfig } from './winston.config';

/**
 * Global Winston logging module.
 *
 * Re-exporting `WinstonModule.forRoot(buildWinstonConfig())` means
 * anywhere we already inject `Logger` from `@nestjs/common` continues
 * to work unchanged — `nest-winston` patches the `Logger` class to
 * delegate to the Winston instance when it's present in the
 * application context.
 *
 * Importing once at the root (`AppModule`) keeps the transport list
 * and configuration consistent across the whole API.
 */
@Module({
  imports: [
    WinstonModule.forRoot(buildWinstonConfig()),
  ],
  exports: [WinstonModule],
})
export class LoggingModule {}
