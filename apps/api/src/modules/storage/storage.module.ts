import { Global, Logger, Module } from '@nestjs/common';
import { LocalStorageService } from './providers/local-storage.service';
import { STORAGE_SERVICE } from './storage.interface';

/**
 * Picks the storage driver at boot based on `STORAGE_DRIVER`. Adding a new
 * provider (e.g. `s3`) only requires a new branch here and a matching
 * implementation that satisfies the `StorageService` interface.
 */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useFactory: () => {
        const driver = (
          process.env.STORAGE_DRIVER ?? 'local'
        ).toLowerCase();
        const logger = new Logger('StorageModule');

        switch (driver) {
          case 'local':
            logger.log('Storage driver: local');
            return new LocalStorageService();
          case 's3':
          case 'r2':
            throw new Error(
              `Storage driver "${driver}" is not implemented yet. ` +
                `Only "local" is supported in this stage.`,
            );
          default:
            throw new Error(
              `Unsupported STORAGE_DRIVER: "${driver}". ` +
                `Expected one of: local, s3, r2.`,
            );
        }
      },
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}