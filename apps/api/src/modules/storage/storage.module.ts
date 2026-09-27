import { Global, Logger, Module } from '@nestjs/common';
import { LocalStorageService } from './providers/local-storage.service';
import { B2StorageService } from './providers/b2-storage.service';
import { LocalUploadController } from './providers/local-upload.controller';
import { STORAGE_SERVICE } from './storage.interface';

/**
 * Picks the storage driver at boot based on `STORAGE_DRIVER`. Adding a
 * new provider only requires a new branch here and a matching
 * implementation that satisfies the `StorageService` interface.
 *
 * Drivers:
 *   - `local` : filesystem under `STORAGE_LOCAL_PATH` (default).
 *   - `b2`    : S3-compatible Backblaze B2. Required env:
 *               B2_ENDPOINT, B2_REGION, B2_KEY_ID, B2_APPLICATION_KEY,
 *               B2_BUCKET, optional CDN_URL.
 */
@Global()
@Module({
  providers: [
    LocalStorageService,
    B2StorageService,
    {
      provide: STORAGE_SERVICE,
      useFactory: (
        local: LocalStorageService,
        b2: B2StorageService,
      ) => {
        const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
        const logger = new Logger('StorageModule');

        switch (driver) {
          case 'local':
            logger.log('Storage driver: local');
            return local;
          case 'b2':
          case 's3':
            logger.log(`Storage driver: ${driver} (S3-compatible)`);
            return b2;
          default:
            throw new Error(
              `Unsupported STORAGE_DRIVER: "${driver}". ` +
                `Expected one of: local, b2, s3.`,
            );
        }
      },
      inject: [LocalStorageService, B2StorageService],
    },
  ],
  controllers: [LocalUploadController],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
