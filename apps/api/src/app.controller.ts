import { Controller, Get } from '@nestjs/common';
import type { HealthSnapshot } from '@epireels/types';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller('api/v1')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** `GET /api/v1/health` — liveness/readiness probe for Render and uptime checks. */
  @Public()
  @Get('health')
  health(): HealthSnapshot {
    return this.appService.getHealth();
  }
}
