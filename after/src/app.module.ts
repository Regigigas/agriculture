import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AgricultureController } from './agriculture.controller';
import { AgricultureService } from './agriculture.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { HealthController } from './health.controller';
import { SyncController } from './sync.controller';
import { SyncDatabase } from './sync-database';
import { SyncService } from './sync.service';

@Module({
  controllers: [HealthController, AuthController, AgricultureController, SyncController],
  providers: [
    AgricultureService,
    SyncDatabase,
    SyncService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
