import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('api/v1')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** `GET /api/v1/health` — liveness/readiness probe for Render and uptime checks. */
  @Get('health')
  health() {
    return this.appService.getHealth();
  }
}
