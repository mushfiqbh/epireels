import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  /** Lightweight health snapshot used by uptime monitors and Render. */
  getHealth() {
    return {
      status: 'ok' as const,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV ?? 'development',
      storageDriver: process.env.STORAGE_DRIVER ?? 'local',
    };
  }
}
