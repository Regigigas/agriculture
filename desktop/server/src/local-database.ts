import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdirSync, readdirSync, statSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'path';
import {
  SYNC_COLLECTIONS,
  SyncChange,
  SyncCollection,
  SyncConflict,
  SyncEvent,
  SyncResult,
  SyncWriteOrigin,
} from './sync.types';

type StoredEntity = { id: string };

interface EntityRow {
  payload: string;
}

interface SyncEventRow {
  eventId: string;
  collection: SyncCollection;
  entityId: string;
  payload: string;
  baseRevision: number;
  occurredAt: string;
}

interface SyncConflictRow {
  id: string;
  collection: SyncCollection;
  entityId: string;
  localPayload: string;
  remotePayload: string;
  remoteRevision: number;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  domain: string;
  recordId: string;
  action: string;
  detail: string;
  actor: string;
  createdAt: string;
}

export interface BackupInfo {
  name: string;
  path: string;
  size: number;
  createdAt: string;
}

@Injectable()
export class LocalDatabase implements OnModuleDestroy {
  private readonly database: DatabaseSync;
  private readonly dataDirectory: string;
  private readonly backupDirectory: string;
  readonly filePath: string;

  constructor() {
    this.dataDirectory = resolve(process.env.AGRI_DATA_DIR ?? resolve(process.cwd(), 'data'));
    this.backupDirectory = resolve(this.dataDirectory, 'backups');
    mkdirSync(this.dataDirectory, { recursive: true });
    mkdirSync(this.backupDirectory, { recursive: true });
    this.filePath = resolve(this.dataDirectory, 'agriculture.db');
    this.database = new DatabaseSync(this.filePath);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS entities (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      );

      CREATE TABLE IF NOT EXISTS telemetry_samples (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_telemetry_device_time
      ON telemetry_samples (device_id, recorded_at DESC);

      CREATE TABLE IF NOT EXISTS operation_receipts (
        id TEXT PRIMARY KEY,
        response TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    this.runMigrations();
  }

  private runMigrations(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    const migrations = [
      {
        version: 1,
        description: '新增不可变操作审计日志',
        up: () => this.database.exec(`
          CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            domain TEXT NOT NULL,
            record_id TEXT NOT NULL,
            action TEXT NOT NULL,
            detail TEXT NOT NULL,
            actor TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_audit_domain_record
          ON audit_logs (domain, record_id, created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_audit_created
          ON audit_logs (created_at DESC);
        `),
      },
      {
        version: 2,
        description: '新增云端增量同步队列、游标和冲突记录',
        up: () => this.database.exec(`
          CREATE TABLE IF NOT EXISTS sync_outbox (
            event_id TEXT PRIMARY KEY,
            collection TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            base_revision INTEGER NOT NULL,
            occurred_at TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT NOT NULL DEFAULT '',
            UNIQUE (collection, entity_id)
          );
          CREATE INDEX IF NOT EXISTS idx_sync_outbox_time ON sync_outbox (occurred_at);

          CREATE TABLE IF NOT EXISTS sync_entity_state (
            collection TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            cloud_revision INTEGER NOT NULL,
            PRIMARY KEY (collection, entity_id)
          );

          CREATE TABLE IF NOT EXISTS sync_conflicts (
            id TEXT PRIMARY KEY,
            collection TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            local_payload TEXT NOT NULL,
            remote_payload TEXT NOT NULL,
            remote_revision INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE (collection, entity_id)
          );
        `),
      },
    ];
    const applied = new Set(
      (this.database.prepare('SELECT version FROM schema_migrations').all() as unknown as Array<{ version: number }>)
        .map((row) => row.version),
    );
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      this.transaction(() => {
        migration.up();
        this.database.prepare(`
          INSERT INTO schema_migrations (version, description, applied_at)
          VALUES (?, ?, ?)
        `).run(migration.version, migration.description, new Date().toISOString());
      });
    }
  }

  loadCollection<T extends StoredEntity>(collection: string, seed: readonly T[]): T[] {
    const rows = this.database
      .prepare('SELECT payload FROM entities WHERE collection = ? ORDER BY rowid ASC')
      .all(collection) as unknown as EntityRow[];

    if (rows.length > 0) {
      return rows.map((row) => JSON.parse(row.payload) as T);
    }

    this.transaction(() => {
      for (const entity of seed) this.put(collection, entity, 'seed');
    });
    return seed.map((entity) => ({ ...entity }));
  }

  put<T extends StoredEntity>(collection: string, entity: T, origin: SyncWriteOrigin = 'local'): void {
    const write = () => {
      this.database.prepare(`
        INSERT INTO entities (collection, id, payload, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(collection, id) DO UPDATE SET
          payload = excluded.payload,
          updated_at = excluded.updated_at
      `).run(collection, entity.id, JSON.stringify(entity), new Date().toISOString());
      if (origin === 'local' && this.isSyncCollection(collection)) this.enqueueSyncEntity(collection, entity);
    };
    if (this.database.isTransaction) write();
    else this.transaction(write);
  }

  hasEntity(collection: string, id: string): boolean {
    return this.database
      .prepare('SELECT 1 AS found FROM entities WHERE collection = ? AND id = ?')
      .get(collection, id) !== undefined;
  }

  appendTelemetry(deviceId: string, payload: unknown, recordedAt: string): void {
    this.database.prepare(`
      INSERT INTO telemetry_samples (id, device_id, recorded_at, payload)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), deviceId, recordedAt, JSON.stringify(payload));
  }

  getOrCreateMetadata(key: string, createValue: () => string): string {
    const existing = this.database
      .prepare('SELECT value FROM metadata WHERE key = ?')
      .get(key) as { value: string } | undefined;
    if (existing) return existing.value;

    const value = createValue();
    this.database.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)').run(key, value);
    return value;
  }

  setMetadata(key: string, value: string): void {
    this.database.prepare(`
      INSERT INTO metadata (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }

  getMetadata(key: string, fallback = ''): string {
    const row = this.database.prepare('SELECT value FROM metadata WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? fallback;
  }

  ensureInitialSyncQueue(): void {
    if (this.getMetadata('cloud_sync_bootstrapped') === '1') return;
    this.transaction(() => {
      for (const collection of SYNC_COLLECTIONS) {
        const rows = this.database.prepare('SELECT payload FROM entities WHERE collection = ?').all(collection) as unknown as EntityRow[];
        for (const row of rows) this.enqueueSyncEntity(collection, JSON.parse(row.payload) as StoredEntity);
      }
      this.setMetadata('cloud_sync_bootstrapped', '1');
    });
  }

  listSyncEvents(limit = 100): SyncEvent[] {
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    const rows = this.database.prepare(`
      SELECT event_id AS eventId, collection, entity_id AS entityId, payload,
             base_revision AS baseRevision, occurred_at AS occurredAt
      FROM sync_outbox ORDER BY occurred_at ASC LIMIT ?
    `).all(safeLimit) as unknown as SyncEventRow[];
    return rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) as Record<string, unknown> }));
  }

  acceptSyncResult(event: SyncEvent, result: SyncResult): void {
    this.transaction(() => {
      this.database.prepare('DELETE FROM sync_outbox WHERE event_id = ?').run(event.eventId);
      this.setCloudRevision(event.collection, event.entityId, result.revision);
      this.database.prepare(`
        UPDATE sync_outbox SET base_revision = ?
        WHERE collection = ? AND entity_id = ? AND base_revision < ?
      `).run(result.revision, event.collection, event.entityId, result.revision);
    });
  }

  recordSyncConflict(event: SyncEvent, result: SyncResult): void {
    this.transaction(() => {
      this.database.prepare('DELETE FROM sync_outbox WHERE collection = ? AND entity_id = ?').run(event.collection, event.entityId);
      this.upsertSyncConflict(
        event.collection,
        event.entityId,
        this.localEntityPayload(event.collection, event.entityId, event.payload),
        result.payload,
        result.revision,
      );
    });
  }

  applyRemoteChange(change: SyncChange): boolean {
    const currentRevision = this.cloudRevision(change.collection, change.entityId);
    if (currentRevision >= change.revision) return false;
    const pending = this.syncEventForEntity(change.collection, change.entityId);
    const conflict = this.syncConflictForEntity(change.collection, change.entityId);
    if (pending || conflict) {
      this.transaction(() => {
        if (pending) this.database.prepare('DELETE FROM sync_outbox WHERE event_id = ?').run(pending.eventId);
        this.upsertSyncConflict(
          change.collection,
          change.entityId,
          this.localEntityPayload(change.collection, change.entityId, pending?.payload ?? conflict?.localPayload),
          change.payload,
          change.revision,
        );
      });
      return false;
    }
    const payload = this.restoreLocalOnlyFields(change.collection, change.entityId, change.payload);
    this.transaction(() => {
      this.put(change.collection, payload as StoredEntity, 'remote');
      this.setCloudRevision(change.collection, change.entityId, change.revision);
    });
    return true;
  }

  syncCursor(): number {
    const value = Number(this.getMetadata('cloud_sync_cursor', '0'));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  setSyncCursor(cursor: number): void {
    this.setMetadata('cloud_sync_cursor', String(cursor));
  }

  configureSyncServer(serverId: string, latestCursor: number): boolean {
    const current = this.getMetadata('cloud_sync_server_id');
    const localCursor = this.syncCursor();
    const hasState = localCursor > 0 || this.getMetadata('cloud_sync_bootstrapped') === '1' || this.hasCloudEntityState();
    const resetRequired = Boolean(current && current !== serverId) || latestCursor < localCursor || (!current && hasState);
    if (!resetRequired) {
      if (!current) this.setMetadata('cloud_sync_server_id', serverId);
      return false;
    }
    this.transaction(() => {
      this.database.exec('DELETE FROM sync_outbox; DELETE FROM sync_entity_state; DELETE FROM sync_conflicts;');
      this.setMetadata('cloud_sync_server_id', serverId);
      this.setMetadata('cloud_sync_cursor', '0');
      this.setMetadata('cloud_sync_bootstrapped', '0');
      this.setMetadata('cloud_sync_last_success_at', '');
      this.setMetadata('cloud_sync_last_error', '');
    });
    return true;
  }

  pendingSyncCount(): number {
    const row = this.database.prepare('SELECT COUNT(*) AS count FROM sync_outbox').get() as { count: number };
    return row.count;
  }

  listSyncConflicts(): SyncConflict[] {
    const rows = this.database.prepare(`
      SELECT id, collection, entity_id AS entityId, local_payload AS localPayload,
             remote_payload AS remotePayload, remote_revision AS remoteRevision, created_at AS createdAt
      FROM sync_conflicts ORDER BY created_at DESC
    `).all() as unknown as SyncConflictRow[];
    return rows.map((row) => ({
      ...row,
      localPayload: JSON.parse(row.localPayload) as Record<string, unknown>,
      remotePayload: JSON.parse(row.remotePayload) as Record<string, unknown>,
    }));
  }

  resolveSyncConflict(id: string, strategy: 'local' | 'remote'): SyncConflict {
    const conflict = this.listSyncConflicts().find((item) => item.id === id);
    if (!conflict) throw new Error(`同步冲突 ${id} 不存在`);
    this.transaction(() => {
      this.setCloudRevision(conflict.collection, conflict.entityId, conflict.remoteRevision);
      if (strategy === 'local') {
        this.put(conflict.collection, conflict.localPayload as StoredEntity, 'local');
      } else {
        const payload = this.restoreLocalOnlyFields(conflict.collection, conflict.entityId, conflict.remotePayload);
        this.put(conflict.collection, payload as StoredEntity, 'remote');
      }
      this.database.prepare('DELETE FROM sync_conflicts WHERE id = ?').run(id);
    });
    return conflict;
  }

  markSyncAttempt(): void {
    this.setMetadata('cloud_sync_last_attempt_at', new Date().toISOString());
  }

  markSyncSuccess(): void {
    this.setMetadata('cloud_sync_last_success_at', new Date().toISOString());
    this.setMetadata('cloud_sync_last_error', '');
  }

  markSyncError(message: string): void {
    this.setMetadata('cloud_sync_last_error', message.slice(0, 500));
    this.database.prepare(`
      UPDATE sync_outbox SET attempts = attempts + 1, last_error = ?
    `).run(message.slice(0, 500));
  }

  getOperationReceipt<T>(id: string): T | undefined {
    const row = this.database
      .prepare('SELECT response FROM operation_receipts WHERE id = ?')
      .get(id) as { response: string } | undefined;
    return row ? JSON.parse(row.response) as T : undefined;
  }

  putOperationReceipt(id: string, response: unknown): void {
    this.database.prepare(`
      INSERT INTO operation_receipts (id, response, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(id, JSON.stringify(response), new Date().toISOString());
  }

  appendAudit(domain: string, recordId: string, action: string, detail = '', actor = '系统管理员'): AuditLog {
    const audit: AuditLog = {
      id: randomUUID(),
      domain,
      recordId,
      action,
      detail,
      actor,
      createdAt: new Date().toISOString(),
    };
    this.database.prepare(`
      INSERT INTO audit_logs (id, domain, record_id, action, detail, actor, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(audit.id, audit.domain, audit.recordId, audit.action, audit.detail, audit.actor, audit.createdAt);
    return audit;
  }

  listAuditLogs(limit = 200): AuditLog[] {
    const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));
    const rows = this.database.prepare(`
      SELECT id, domain, record_id AS recordId, action, detail, actor, created_at AS createdAt
      FROM audit_logs ORDER BY created_at DESC LIMIT ?
    `).all(safeLimit) as unknown as AuditLog[];
    return rows;
  }

  createBackup(): BackupInfo {
    this.database.exec('PRAGMA wal_checkpoint(FULL);');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `agriculture-${stamp}-${randomUUID().slice(0, 8)}.db`;
    const backupPath = resolve(this.backupDirectory, name);
    const escapedPath = backupPath.replace(/'/g, "''");
    this.database.exec(`VACUUM INTO '${escapedPath}'`);
    return this.backupInfo(name);
  }

  listBackups(): BackupInfo[] {
    return readdirSync(this.backupDirectory)
      .filter((name) => /^agriculture-.+\.db$/.test(name))
      .map((name) => this.backupInfo(name))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  integrityCheck(): { ok: boolean; messages: string[]; checkedAt: string } {
    const rows = this.database.prepare('PRAGMA integrity_check').all() as unknown as Array<{ integrity_check: string }>;
    const messages = rows.map((row) => row.integrity_check);
    return { ok: messages.length === 1 && messages[0] === 'ok', messages, checkedAt: new Date().toISOString() };
  }

  private backupInfo(name: string): BackupInfo {
    const backupPath = resolve(this.backupDirectory, name);
    const stats = statSync(backupPath);
    return { name, path: backupPath, size: stats.size, createdAt: stats.mtime.toISOString() };
  }

  transaction<T>(operation: () => T): T {
    if (this.database.isTransaction) return operation();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  private enqueueSyncEntity(collection: SyncCollection, entity: StoredEntity): void {
    const payload = this.syncPayload(collection, entity);
    const revision = this.cloudRevision(collection, entity.id);
    this.database.prepare(`
      INSERT INTO sync_outbox (
        event_id, collection, entity_id, payload, base_revision, occurred_at, attempts, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, 0, '')
      ON CONFLICT(collection, entity_id) DO UPDATE SET
        event_id = excluded.event_id,
        payload = excluded.payload,
        base_revision = excluded.base_revision,
        occurred_at = excluded.occurred_at,
        attempts = 0,
        last_error = ''
    `).run(randomUUID(), collection, entity.id, JSON.stringify(payload), revision, new Date().toISOString());
  }

  private cloudRevision(collection: SyncCollection, entityId: string): number {
    const row = this.database.prepare(`
      SELECT cloud_revision AS revision FROM sync_entity_state WHERE collection = ? AND entity_id = ?
    `).get(collection, entityId) as { revision: number } | undefined;
    return row?.revision ?? 0;
  }

  private hasCloudEntityState(): boolean {
    return this.database.prepare('SELECT 1 FROM sync_entity_state LIMIT 1').get() !== undefined;
  }

  private setCloudRevision(collection: SyncCollection, entityId: string, revision: number): void {
    this.database.prepare(`
      INSERT INTO sync_entity_state (collection, entity_id, cloud_revision)
      VALUES (?, ?, ?)
      ON CONFLICT(collection, entity_id) DO UPDATE SET cloud_revision = excluded.cloud_revision
    `).run(collection, entityId, revision);
  }

  private hasSyncConflict(collection: SyncCollection, entityId: string): boolean {
    return this.database.prepare(`
      SELECT 1 FROM sync_conflicts WHERE collection = ? AND entity_id = ?
    `).get(collection, entityId) !== undefined;
  }

  private syncEventForEntity(collection: SyncCollection, entityId: string): SyncEvent | undefined {
    const row = this.database.prepare(`
      SELECT event_id AS eventId, collection, entity_id AS entityId, payload,
             base_revision AS baseRevision, occurred_at AS occurredAt
      FROM sync_outbox WHERE collection = ? AND entity_id = ?
    `).get(collection, entityId) as SyncEventRow | undefined;
    return row ? { ...row, payload: JSON.parse(row.payload) as Record<string, unknown> } : undefined;
  }

  private syncConflictForEntity(collection: SyncCollection, entityId: string): SyncConflict | undefined {
    return this.listSyncConflicts().find((item) => item.collection === collection && item.entityId === entityId);
  }

  private upsertSyncConflict(
    collection: SyncCollection,
    entityId: string,
    localPayload: Record<string, unknown>,
    remotePayload: Record<string, unknown>,
    remoteRevision: number,
  ): void {
    this.database.prepare(`
      INSERT INTO sync_conflicts (
        id, collection, entity_id, local_payload, remote_payload, remote_revision, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(collection, entity_id) DO UPDATE SET
        local_payload = excluded.local_payload,
        remote_payload = excluded.remote_payload,
        remote_revision = excluded.remote_revision,
        created_at = excluded.created_at
    `).run(
      randomUUID(),
      collection,
      entityId,
      JSON.stringify(localPayload),
      JSON.stringify(remotePayload),
      remoteRevision,
      new Date().toISOString(),
    );
  }

  private localEntityPayload(
    collection: SyncCollection,
    entityId: string,
    fallback: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const row = this.database.prepare(`
      SELECT payload FROM entities WHERE collection = ? AND id = ?
    `).get(collection, entityId) as EntityRow | undefined;
    return row ? JSON.parse(row.payload) as Record<string, unknown> : { ...fallback };
  }

  private syncPayload(collection: SyncCollection, entity: StoredEntity): Record<string, unknown> {
    const payload = { ...entity } as Record<string, unknown>;
    if (collection === 'compliance_documents' || collection === 'farm_contracts') payload.filePath = '';
    return payload;
  }

  private restoreLocalOnlyFields(
    collection: SyncCollection,
    entityId: string,
    remotePayload: Record<string, unknown>,
  ): Record<string, unknown> {
    const payload = { ...remotePayload };
    if (collection !== 'compliance_documents' && collection !== 'farm_contracts') return payload;
    const row = this.database.prepare(`
      SELECT payload FROM entities WHERE collection = ? AND id = ?
    `).get(collection, entityId) as EntityRow | undefined;
    const local = row ? JSON.parse(row.payload) as Record<string, unknown> : undefined;
    payload.filePath = local?.filePath ?? '';
    return payload;
  }

  private isSyncCollection(collection: string): collection is SyncCollection {
    return (SYNC_COLLECTIONS as readonly string[]).includes(collection);
  }

  onModuleDestroy(): void {
    this.database.close();
  }
}
