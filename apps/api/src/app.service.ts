import { Injectable } from '@nestjs/common';
import type { HealthSnapshot } from '@epireels/types';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  /** Lightweight health snapshot used by uptime monitors and Render. */
  getHealth(): HealthSnapshot {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString() as HealthSnapshot['timestamp'],
      nodeEnv:
        (process.env.NODE_ENV as HealthSnapshot['nodeEnv'] | undefined) ??
        'development',
      storageDriver: process.env.STORAGE_DRIVER ?? 'local',
    };
  }
}
