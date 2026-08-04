import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health(): { status: string; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'agriculture-demo-api',
      timestamp: new Date().toISOString(),
    };
  }
}
