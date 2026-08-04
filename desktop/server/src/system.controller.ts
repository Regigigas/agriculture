import { Controller, Get, Post } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { hostname, networkInterfaces } from 'os';
import { BackupInfo, LocalDatabase } from './local-database';

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
  constructor(private readonly database: LocalDatabase) {}

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
  backups(): BackupInfo[] {
    return this.database.listBackups();
  }

  @Post('backups')
  createBackup(): BackupInfo {
    const backup = this.database.createBackup();
    this.database.appendAudit('system', backup.name, 'backup', backup.path);
    return backup;
  }

  @Get('integrity')
  integrity(): { ok: boolean; messages: string[]; checkedAt: string } {
    return this.database.integrityCheck();
  }
}
