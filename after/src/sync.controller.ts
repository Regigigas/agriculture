import { Body, Controller, Get, Post } from '@nestjs/common';
import { SyncDatabase } from './sync-database';
import { SyncService } from './sync.service';
import { SyncExchangeResponse } from './sync.types';

@Controller('sync')
export class SyncController {
  constructor(
    private readonly service: SyncService,
    private readonly database: SyncDatabase,
  ) {}

  @Get('identity')
  identity(): { serverId: string; schemaVersion: 1; latestCursor: number } {
    return { serverId: this.database.serverId(), schemaVersion: 1, latestCursor: this.database.latestCursor() };
  }

  @Post('exchange')
  exchange(@Body() body: unknown): SyncExchangeResponse {
    return this.service.exchange(body);
  }
}
