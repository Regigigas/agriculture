import { HttpException, HttpStatus, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AgricultureService } from './agriculture.service';
import { LocalDatabase } from './local-database';
import { ProductionService } from './production.service';
import { SyncConflict, SyncExchangeResponse, SyncStatus } from './sync.types';

@Injectable()
export class SyncService implements OnModuleInit, OnModuleDestroy {
  private cloudUrl = this.normalizeUrl(process.env.CLOUD_SYNC_URL ?? '');
  private cloudToken = process.env.CLOUD_SYNC_TOKEN?.trim() ?? '';
  private running = false;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly database: LocalDatabase,
    private readonly agriculture: AgricultureService,
    private readonly production: ProductionService,
  ) {}

  onModuleInit(): void {
    if (process.env.CLOUD_SYNC_AUTO === 'false') return;
    this.timer = setInterval(() => void this.runAutomatically(), 60_000);
    this.timer.unref();
    if (this.configured()) setTimeout(() => void this.runAutomatically(), 3_000).unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  updateCredentials(cloudUrl: string, cloudToken: string): void {
    this.cloudUrl = this.normalizeUrl(cloudUrl);
    this.cloudToken = cloudToken.trim();
    if (this.configured()) void this.runAutomatically();
  }

  status(): SyncStatus {
    return {
      configured: this.configured(),
      cloudUrl: this.cloudUrl,
      running: this.running,
      pendingCount: this.database.pendingSyncCount(),
      conflictCount: this.database.listSyncConflicts().length,
      cursor: this.database.syncCursor(),
      lastSuccessAt: this.database.getMetadata('cloud_sync_last_success_at'),
      lastAttemptAt: this.database.getMetadata('cloud_sync_last_attempt_at'),
      lastError: this.database.getMetadata('cloud_sync_last_error'),
    };
  }

  conflicts(): SyncConflict[] {
    return this.database.listSyncConflicts();
  }

  resolveConflict(id: string, body: unknown): SyncStatus {
    const input = this.object(body);
    if (input.strategy !== 'local' && input.strategy !== 'remote') {
      throw new HttpException('strategy 必须是 local 或 remote', HttpStatus.BAD_REQUEST);
    }
    const conflict = this.database.listSyncConflicts().find((item) => item.id === id);
    if (!conflict) throw new HttpException(`同步冲突 ${id} 不存在`, HttpStatus.NOT_FOUND);
    this.database.resolveSyncConflict(id, input.strategy);
    this.reloadServices();
    return this.status();
  }

  async run(): Promise<SyncStatus> {
    if (!this.configured()) {
      throw new HttpException('请先配置云端 API 地址和同步令牌', HttpStatus.BAD_REQUEST);
    }
    if (this.running) return this.status();
    this.running = true;
    this.database.markSyncAttempt();
    try {
      const cloudUrl = this.cloudUrl;
      const cloudToken = this.cloudToken;
      const identity = await this.identity(cloudUrl, cloudToken);
      this.database.configureSyncServer(identity.serverId, identity.latestCursor);
      this.database.ensureInitialSyncQueue();
      let page = 0;
      let changed = false;
      let completed = false;
      while (page < 50) {
        const events = this.database.listSyncEvents(100);
        const cursor = this.database.syncCursor();
        const response = await this.exchange(cloudUrl, cloudToken, cursor, events);
        if (response.serverId !== identity.serverId) throw new Error('云端服务身份在同步期间发生变化');
        const eventById = new Map(events.map((event) => [event.eventId, event]));
        for (const result of response.results) {
          const event = eventById.get(result.eventId);
          if (!event) continue;
          if (result.status === 'conflict') this.database.recordSyncConflict(event, result);
          else this.database.acceptSyncResult(event, result);
        }
        for (const change of response.changes) {
          changed = this.database.applyRemoteChange(change) || changed;
        }
        this.database.setSyncCursor(response.nextCursor);
        page += 1;
        if (!response.hasMore && this.database.listSyncEvents(1).length === 0) {
          completed = true;
          break;
        }
      }
      if (!completed) throw new Error('单次同步数据量过大，请稍后继续同步');
      if (changed) this.reloadServices();
      this.database.markSyncSuccess();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '云端同步失败';
      this.database.markSyncError(message);
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    } finally {
      this.running = false;
    }
    return this.status();
  }

  private async identity(cloudUrl: string, cloudToken: string): Promise<{ serverId: string; schemaVersion: 1; latestCursor: number }> {
    let response: Response;
    try {
      response = await fetch(`${cloudUrl}/sync/identity`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${cloudToken}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error('无法连接云端同步服务');
    }
    const payload = await response.json().catch(() => ({})) as { serverId?: string; schemaVersion?: number; latestCursor?: number; message?: string };
    if (!response.ok) throw new Error(payload.message || `云端身份检查失败 (${response.status})`);
    if (
      payload.schemaVersion !== 1 ||
      typeof payload.serverId !== 'string' ||
      !payload.serverId ||
      !Number.isSafeInteger(payload.latestCursor) ||
      (payload.latestCursor ?? -1) < 0
    ) {
      throw new Error('云端返回了不兼容的服务身份');
    }
    return payload as { serverId: string; schemaVersion: 1; latestCursor: number };
  }

  private async exchange(
    cloudUrl: string,
    cloudToken: string,
    cursor: number,
    events: ReturnType<LocalDatabase['listSyncEvents']>,
  ): Promise<SyncExchangeResponse> {
    let response: Response;
    try {
      response = await fetch(`${cloudUrl}/sync/exchange`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${cloudToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId: this.database.getOrCreateMetadata('server_id', () => randomUUID()),
          cursor,
          schemaVersion: 1,
          events,
          limit: 200,
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error('无法连接云端同步服务');
    }
    const payload = await response.json().catch(() => ({})) as Partial<SyncExchangeResponse> & { message?: string };
    if (!response.ok) throw new Error(payload.message || `云端同步请求失败 (${response.status})`);
    if (payload.schemaVersion !== 1 || !Array.isArray(payload.results) || !Array.isArray(payload.changes)) {
      throw new Error('云端返回了不兼容的同步响应');
    }
    return payload as SyncExchangeResponse;
  }

  private async runAutomatically(): Promise<void> {
    if (!this.configured() || this.running) return;
    try {
      await this.run();
    } catch {
      // Status captures the error for the connection center and the next retry.
    }
  }

  private reloadServices(): void {
    this.agriculture.reloadFromDatabase();
    this.production.reloadFromDatabase();
  }

  private configured(): boolean {
    return Boolean(this.cloudUrl && this.cloudToken);
  }

  private normalizeUrl(value: string): string {
    const normalized = value.trim().replace(/\/$/, '');
    if (!normalized) return '';
    try {
      const url = new URL(normalized);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
        return '';
      }
      if (url.username || url.password || url.search || url.hash) return '';
      return normalized;
    } catch {
      return '';
    }
  }

  private object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new HttpException('请求体必须是 JSON 对象', HttpStatus.BAD_REQUEST);
    }
    return value as Record<string, unknown>;
  }
}
