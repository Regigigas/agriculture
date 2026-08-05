import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AgricultureController } from './agriculture.controller';
import { AgricultureService } from './agriculture.service';
import { AppUpdateController } from './app-update.controller';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { HealthController } from './health.controller';
import { SyncController } from './sync.controller';
import { SyncDatabase } from './sync-database';
import { SyncService } from './sync.service';
import { ApplicationDatabase } from './application-database';
import { AuthService } from './auth/auth.service';
import { ChatController } from './chat/chat.controller';
import { ChatService } from './chat/chat.service';

@Module({
  controllers: [HealthController, AppUpdateController, AuthController, ChatController, AgricultureController, SyncController],
  providers: [
    AgricultureService,
    ApplicationDatabase,
    AuthService,
    ChatService,
    SyncDatabase,
    SyncService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
