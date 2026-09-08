import { Readable } from 'stream';

export interface StorageResourceStats {
  size: number;
  mtime: Date;
}

export interface StorageService {
  upload(fileBuffer: Buffer, key: string, mimeType: string): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getStream(
    key: string,
    options?: { start?: number; end?: number },
  ): Promise<Readable>;
  getStats(key: string): Promise<StorageResourceStats>;
  getUrl(key: string): string;
}

export const STORAGE_SERVICE = 'STORAGE_SERVICE';