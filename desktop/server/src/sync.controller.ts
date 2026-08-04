import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncConflict, SyncStatus } from './sync.types';

@Controller('system/sync')
export class SyncController {
  constructor(private readonly service: SyncService) {}

  @Get('status')
  status(): SyncStatus {
    return this.service.status();
  }

  @Post('run')
  run(): Promise<SyncStatus> {
    return this.service.run();
  }

  @Get('conflicts')
  conflicts(): SyncConflict[] {
    return this.service.conflicts();
  }

  @Post('conflicts/:id/resolve')
  resolve(@Param('id') id: string, @Body() body: unknown): SyncStatus {
    return this.service.resolveConflict(id, body);
  }
}
