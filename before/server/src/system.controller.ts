import { BadRequestException, Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { hostname, networkInterfaces } from 'os';
import { AgricultureService } from './agriculture.service';
import { AuthService } from './auth/auth.service';
import { CurrentUser } from './auth/current-user.decorator';
import { Roles } from './auth/roles.decorator';
import { BackupInfo, LocalDatabase, LocalSyncResult } from './local-database';
import { ProductionService } from './production.service';
import { User } from './types';

interface ConnectionInfo {
  serverId: string;
  hostname: string;
  port: number;
  addresses: string[];
  deviceKey: string;
  features: {
    offlineStorage: boolean;
    localWifi: boolean;
    bluetoothBridge: boolean;
  };
}

@Controller('system')
export class SystemController {
  constructor(
    private readonly database: LocalDatabase,
    private readonly agriculture: AgricultureService,
    private readonly production: ProductionService,
    private readonly auth: AuthService,
  ) {}

  @Get('connection')
  connection(): ConnectionInfo {
    const configuredPort = Number(process.env.PORT ?? 3100);
    const port = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 3100;
    const addresses = Object.values(networkInterfaces())
      .flatMap((entries) => entries ?? [])
      .filter((entry) => entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.'))
      .map((entry) => `http://${entry.address}:${port}/api`);

    return {
      serverId: this.database.getOrCreateMetadata('server_id', () => randomUUID()),
      hostname: hostname(),
      port,
      addresses: [...new Set(addresses)],
      deviceKey: process.env.DEVICE_KEY ?? 'agri-terminal-2026',
      features: {
        offlineStorage: true,
        localWifi: true,
        bluetoothBridge: false,
      },
    };
  }

  @Get('backups')
  @Roles('admin')
  backups(): BackupInfo[] {
    return this.database.listBackups();
  }

  @Post('backups')
  @Roles('admin')
  createBackup(): BackupInfo {
    const backup = this.database.createBackup();
    this.database.appendAudit('system', backup.name, 'backup', backup.path);
    return backup;
  }

  @Roles('admin')
  @Post('local-sync')
  localSync(
    @Body() body: unknown,
    @CurrentUser() user: User,
    @Headers('x-operation-authorization') operationAuthorization = '',
  ): LocalSyncResult {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('请求体必须是 JSON 对象');
    const input = body as Record<string, unknown>;
    if (typeof input.importId !== 'string' || typeof input.sourceName !== 'string') {
      throw new BadRequestException('缺少本地数据文件信息');
    }
    this.auth.consumeOperationAuthorization(user.id, 'local-data-sync', operationAuthorization);
    try {
      const result = this.database.syncFromStagedFile(input.importId, input.sourceName);
      this.agriculture.reloadFromDatabase();
      this.production.reloadFromDatabase();
      return result;
    } catch (cause) {
      throw new BadRequestException(cause instanceof Error ? cause.message : '本地数据同步失败');
    }
  }

  @Roles('admin')
  @Post('authorize-database-restore')
  authorizeDatabaseRestore(
    @CurrentUser() user: User,
    @Headers('x-operation-authorization') operationAuthorization = '',
  ): { authorized: true } {
    this.auth.consumeOperationAuthorization(user.id, 'database-restore', operationAuthorization);
    return { authorized: true };
  }

  @Get('integrity')
  @Roles('admin')
  integrity(): { ok: boolean; messages: string[]; checkedAt: string } {
    return this.database.integrityCheck();
  }
}
