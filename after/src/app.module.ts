import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AgricultureController } from './agriculture.controller';
import { AgricultureService } from './agriculture.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController, AuthController, AgricultureController],
  providers: [
    AgricultureService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
