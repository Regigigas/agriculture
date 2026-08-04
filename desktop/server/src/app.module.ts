import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AgricultureController } from './agriculture.controller';
import { AgricultureService } from './agriculture.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { HealthController } from './health.controller';
import { LocalDatabase } from './local-database';
import { OperationsCenterController } from './operations-center.controller';
import { OperationsCenterService } from './operations-center.service';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';
import { SystemController } from './system.controller';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  controllers: [HealthController, AuthController, AgricultureController, ProductionController, OperationsCenterController, SystemController, SyncController],
  providers: [
    LocalDatabase,
    AgricultureService,
    ProductionService,
    OperationsCenterService,
    SyncService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
