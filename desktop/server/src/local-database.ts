import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdirSync, readdirSync, statSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'path';

type StoredEntity = { id: string };

interface EntityRow {
  payload: string;
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
      for (const entity of seed) this.put(collection, entity);
    });
    return seed.map((entity) => ({ ...entity }));
  }

  put<T extends StoredEntity>(collection: string, entity: T): void {
    this.database.prepare(`
      INSERT INTO entities (collection, id, payload, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(collection, id) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `).run(collection, entity.id, JSON.stringify(entity), new Date().toISOString());
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

  onModuleDestroy(): void {
    this.database.close();
  }
}
