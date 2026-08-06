import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';
import { randomUUID } from 'crypto';
import { LocalDatabase } from './local-database';

@Controller('health')
export class HealthController {
  constructor(private readonly database: LocalDatabase) {}

  @Public()
  @Get()
  health(): { status: string; service: string; serverId: string; instanceId: string | null; timestamp: string } {
    return {
      status: 'ok',
      service: 'agriculture-demo-api',
      serverId: this.database.getOrCreateMetadata('server_id', () => randomUUID()),
      instanceId: process.env.AGRI_INSTANCE_ID ?? null,
      timestamp: new Date().toISOString(),
    };
  }
}
