import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, statfsSync, statSync } from 'fs';
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

interface ImportedEntityRow extends EntityRow {
  collection: string;
  id: string;
  updatedAt: string;
}

interface LocalEntityRow extends EntityRow {
  updatedAt: string;
}

interface ImportedTelemetryRow {
  id: string;
  deviceId: string;
  recordedAt: string;
  payload: string;
}

interface ImportedAuditRow {
  id: string;
  domain: string;
  recordId: string;
  action: string;
  detail: string;
  actor: string;
  createdAt: string;
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

export interface LocalSyncResult {
  sourceName: string;
  inserted: number;
  updated: number;
  skipped: number;
  telemetryImported: number;
  auditImported: number;
  safetyBackup: BackupInfo;
  synchronizedAt: string;
}

const LOCAL_IMPORT_COLLECTIONS = new Set<string>([...SYNC_COLLECTIONS, 'activities']);
const CURRENT_SCHEMA_VERSION = 4;
const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024 * 1024;
const MAX_IMPORT_ENTITY_COUNT = 500_000;
const MAX_IMPORT_TELEMETRY_COUNT = 500_000;
const MAX_IMPORT_AUDIT_COUNT = 200_000;
const MAX_IMPORT_PAYLOAD_LENGTH = 1024 * 1024;
const MAX_IMPORT_TEXT_LENGTH = 100_000;

interface ImportedEntitySchema {
  strings: readonly string[];
  numbers?: readonly string[];
  booleans?: readonly string[];
  nullableStrings?: readonly string[];
  objects?: readonly string[];
  enums?: Readonly<Record<string, readonly string[]>>;
}

const IMPORTED_ENTITY_SCHEMAS: Readonly<Record<string, ImportedEntitySchema>> = {
  fields: { strings: ['id', 'farmId', 'name', 'crop', 'location', 'status', 'plantedAt', 'expectedHarvestAt', 'manager', 'createdAt'], numbers: ['area', 'soilMoisture'], enums: { status: ['healthy', 'attention', 'fallow'] } },
  tasks: { strings: ['id', 'title', 'fieldId', 'assignee', 'dueDate', 'priority', 'status', 'description', 'createdAt'], nullableStrings: ['completedAt'], enums: { priority: ['low', 'medium', 'high'], status: ['pending', 'in_progress', 'completed'] } },
  devices: { strings: ['id', 'name', 'type', 'fieldId', 'status', 'lastSeenAt'], numbers: ['battery'], objects: ['telemetry'], enums: { status: ['online', 'offline', 'maintenance'] } },
  alerts: { strings: ['id', 'title', 'message', 'severity', 'source', 'createdAt'], booleans: ['acknowledged'], nullableStrings: ['fieldId', 'acknowledgedAt'], enums: { severity: ['info', 'warning', 'critical'] } },
  inventory: { strings: ['id', 'name', 'category', 'unit', 'location', 'updatedAt'], numbers: ['quantity', 'minimumStock'] },
  inventory_transactions: { strings: ['id', 'itemId', 'type', 'operator', 'reference', 'notes', 'createdAt'], numbers: ['change', 'balanceAfter'], nullableStrings: ['fieldId'], enums: { type: ['opening', 'purchase', 'usage', 'return', 'adjustment'] } },
  purchases: { strings: ['id', 'orderNo', 'inventoryItemId', 'itemName', 'unit', 'supplier', 'expectedAt', 'buyer', 'notes', 'status', 'createdAt', 'updatedAt'], numbers: ['quantity', 'unitPrice', 'amount'], nullableStrings: ['receivedAt'], enums: { status: ['pending', 'received'] } },
  issues: { strings: ['id', 'title', 'fieldId', 'category', 'severity', 'status', 'description', 'reporter', 'assignee', 'observedAt', 'resolution', 'createdAt', 'updatedAt'], nullableStrings: ['reviewDueDate', 'closedAt'], enums: { category: ['pest', 'disease', 'irrigation', 'equipment', 'quality', 'other'], severity: ['low', 'medium', 'high', 'critical'], status: ['open', 'in_progress', 'review', 'closed'] } },
  corrections: { strings: ['id', 'code', 'category', 'priority', 'title', 'description', 'expectedValue', 'route', 'entityType', 'entityId', 'errorCode', 'createdBy', 'status', 'resolution', 'createdAt', 'updatedAt'], nullableStrings: ['resolvedAt'], enums: { category: ['data', 'system', 'workflow', 'suggestion'], priority: ['low', 'medium', 'high'], status: ['open', 'processing', 'resolved'] } },
  business_subjects: { strings: ['id', 'name', 'type', 'creditCode', 'contact', 'phone', 'address', 'status', 'notes', 'createdAt', 'updatedAt'], enums: { type: ['individual', 'family_farm', 'cooperative', 'company'], status: ['active', 'inactive'] } },
  farms: { strings: ['id', 'subjectId', 'name', 'location', 'manager', 'status', 'description', 'createdAt', 'updatedAt'], numbers: ['totalArea'], enums: { status: ['active', 'inactive'] } },
  crop_cycles: { strings: ['id', 'code', 'fieldId', 'crop', 'variety', 'plannedStart', 'plannedHarvest', 'manager', 'status', 'notes', 'createdAt', 'updatedAt'], numbers: ['seasonYear', 'targetYield', 'budget'], nullableStrings: ['actualStart', 'actualHarvest'], enums: { status: ['planned', 'in_progress', 'harvesting', 'completed', 'cancelled'] } },
  production_plans: { strings: ['id', 'cycleId', 'fieldId', 'title', 'operationType', 'plannedDate', 'assignee', 'plannedMaterial', 'status', 'notes', 'createdAt', 'updatedAt'], numbers: ['plannedCost'], nullableStrings: ['completedAt'], enums: { operationType: ['tillage', 'sowing', 'irrigation', 'fertilizing', 'pesticide', 'scouting', 'harvest', 'other'], status: ['planned', 'in_progress', 'completed', 'cancelled'] } },
  operation_logs: { strings: ['id', 'cycleId', 'fieldId', 'operationType', 'occurredAt', 'executor', 'result', 'materialName', 'materialUnit', 'weather', 'notes', 'createdAt'], numbers: ['laborHours', 'cost', 'materialQuantity'], nullableStrings: ['planId', 'inventoryItemId'], enums: { operationType: ['tillage', 'sowing', 'irrigation', 'fertilizing', 'pesticide', 'scouting', 'harvest', 'other'] } },
  cost_adjustments: { strings: ['id', 'cycleId', 'type', 'evidenceNo', 'reason', 'operator', 'occurredAt', 'createdAt'], numbers: ['amount'], enums: { type: ['supplement', 'reversal'] } },
  harvest_batches: { strings: ['id', 'batchCode', 'traceCode', 'cycleId', 'fieldId', 'product', 'grade', 'unit', 'harvestedAt', 'warehouse', 'qualityStatus', 'inspector', 'notes', 'createdAt', 'updatedAt'], numbers: ['quantity'], enums: { qualityStatus: ['pending', 'passed', 'rejected'] } },
  sales_orders: { strings: ['id', 'orderNo', 'harvestBatchId', 'customer', 'unit', 'soldAt', 'paymentStatus', 'deliveryStatus', 'notes', 'createdAt', 'updatedAt'], numbers: ['quantity', 'unitPrice', 'amount'], enums: { paymentStatus: ['unpaid', 'partial', 'paid'], deliveryStatus: ['pending', 'delivered'] } },
  invoices: { strings: ['id', 'applicationNo', 'invoiceNo', 'direction', 'sourceType', 'sourceId', 'sourceNo', 'counterparty', 'title', 'taxNumber', 'status', 'applicant', 'notes', 'createdAt', 'updatedAt'], numbers: ['amount'], nullableStrings: ['issuedAt'], enums: { direction: ['output', 'input'], sourceType: ['sales_order', 'purchase'], status: ['pending', 'issued', 'voided'] } },
  compliance_documents: { strings: ['id', 'documentType', 'name', 'documentNo', 'status', 'custodian', 'filePath', 'notes', 'createdAt', 'updatedAt'], nullableStrings: ['subjectId', 'farmId', 'fieldId', 'issueDate', 'expiryDate'], enums: { documentType: ['land', 'inspection', 'input_invoice', 'certification', 'insurance', 'other'], status: ['valid', 'expiring', 'expired'] } },
  farm_contracts: { strings: ['id', 'contractType', 'contractNo', 'title', 'counterparty', 'startDate', 'endDate', 'status', 'filePath', 'notes', 'createdAt', 'updatedAt'], numbers: ['amount', 'reminderDays'], nullableStrings: ['subjectId', 'farmId'], enums: { contractType: ['land_lease', 'purchase', 'outsource', 'sales', 'insurance', 'other'], status: ['draft', 'active', 'expired', 'terminated'] } },
  activities: { strings: ['id', 'type', 'message', 'timestamp'] },
};

const IMPORTED_ENTITY_REFERENCES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  farms: { subjectId: 'business_subjects' },
  fields: { farmId: 'farms' },
  tasks: { fieldId: 'fields' },
  devices: { fieldId: 'fields' },
  alerts: { fieldId: 'fields' },
  inventory_transactions: { itemId: 'inventory', fieldId: 'fields' },
  purchases: { inventoryItemId: 'inventory' },
  issues: { fieldId: 'fields' },
  crop_cycles: { fieldId: 'fields' },
  production_plans: { cycleId: 'crop_cycles', fieldId: 'fields' },
  operation_logs: { cycleId: 'crop_cycles', planId: 'production_plans', fieldId: 'fields', inventoryItemId: 'inventory' },
  cost_adjustments: { cycleId: 'crop_cycles' },
  harvest_batches: { cycleId: 'crop_cycles', fieldId: 'fields' },
  sales_orders: { harvestBatchId: 'harvest_batches' },
  invoices: {},
  compliance_documents: { subjectId: 'business_subjects', farmId: 'farms', fieldId: 'fields' },
  farm_contracts: { subjectId: 'business_subjects', farmId: 'farms' },
};

const IMPORTED_NUMBER_RANGES: Readonly<Record<string, Readonly<Record<string, readonly [number, number]>>>> = {
  fields: { area: [0.1, 1_000_000], soilMoisture: [0, 100] },
  devices: { battery: [0, 100] },
  inventory: { quantity: [0, 1_000_000_000], minimumStock: [0, 1_000_000_000] },
  inventory_transactions: { change: [-1_000_000_000, 1_000_000_000], balanceAfter: [0, 1_000_000_000] },
  purchases: { quantity: [0.001, 1_000_000_000], unitPrice: [0, 1_000_000_000], amount: [0, 1_000_000_000_000] },
  farms: { totalArea: [0.1, 1_000_000] },
  crop_cycles: { seasonYear: [2000, 2200], targetYield: [0, 1_000_000_000], budget: [0, 1_000_000_000_000] },
  production_plans: { plannedCost: [0, 1_000_000_000_000] },
  operation_logs: { laborHours: [0, 1_000_000], cost: [0, 1_000_000_000_000], materialQuantity: [0, 1_000_000_000] },
  cost_adjustments: { amount: [1, 100_000_000_000] },
  harvest_batches: { quantity: [0.001, 1_000_000_000] },
  sales_orders: { quantity: [0.001, 1_000_000_000], unitPrice: [0, 1_000_000_000], amount: [0, 1_000_000_000_000] },
  invoices: { amount: [0, 1_000_000_000_000] },
  farm_contracts: { amount: [0, 1_000_000_000_000], reminderDays: [0, 3650] },
};

const IMPORTED_DATE_FIELDS = new Set([
  'createdAt', 'updatedAt', 'completedAt', 'receivedAt', 'closedAt', 'resolvedAt', 'acknowledgedAt',
  'recordedAt', 'lastSeenAt', 'plantedAt', 'expectedHarvestAt', 'dueDate', 'expectedAt', 'observedAt',
  'reviewDueDate', 'plannedStart', 'plannedHarvest', 'actualStart', 'actualHarvest', 'plannedDate',
  'occurredAt', 'harvestedAt', 'soldAt', 'issuedAt', 'issueDate', 'expiryDate', 'startDate', 'endDate', 'timestamp',
]);

@Injectable()
export class LocalDatabase implements OnModuleDestroy {
  private readonly database: DatabaseSync;
  private readonly dataDirectory: string;
  private readonly backupDirectory: string;
  private readonly importDirectory: string;
  readonly filePath: string;

  constructor() {
    this.dataDirectory = resolve(process.env.AGRI_DATA_DIR ?? resolve(process.cwd(), 'data'));
    this.backupDirectory = resolve(this.dataDirectory, 'backups');
    this.importDirectory = resolve(this.dataDirectory, 'imports');
    mkdirSync(this.dataDirectory, { recursive: true });
    mkdirSync(this.backupDirectory, { recursive: true });
    mkdirSync(this.importDirectory, { recursive: true });
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

  get connection(): DatabaseSync {
    return this.database;
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
      {
        version: 3,
        description: '新增本地账号、会话、聊天和高危操作授权',
        up: () => this.database.exec(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'worker')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
          CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

          CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL CHECK(type IN ('private', 'group')),
            title TEXT NOT NULL,
            direct_key TEXT UNIQUE,
            created_by TEXT NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS conversation_members (
            conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            member_role TEXT NOT NULL CHECK(member_role IN ('owner', 'member')),
            joined_at TEXT NOT NULL,
            last_read_at TEXT NOT NULL,
            PRIMARY KEY (conversation_id, user_id)
          );
          CREATE INDEX IF NOT EXISTS idx_members_user ON conversation_members(user_id, conversation_id);

          CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            sender_id TEXT NOT NULL REFERENCES users(id),
            client_message_id TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(conversation_id, sender_id, client_message_id)
          );
          CREATE INDEX IF NOT EXISTS idx_messages_conversation_time
          ON messages(conversation_id, created_at DESC, id DESC);

          CREATE TABLE IF NOT EXISTS operation_authorizations (
            token_hash TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            operation TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_operation_authorizations_expiry
          ON operation_authorizations(expires_at);
        `),
      },
      {
        version: 4,
        description: '金额字段统一由元迁移为整数分',
        up: () => this.migrateMoneyFieldsToCents(),
      },
    ];
    const applied = new Set(
      (this.database.prepare('SELECT version FROM schema_migrations').all() as unknown as Array<{ version: number }>)
        .map((row) => row.version),
    );
    const futureVersion = [...applied].find((version) => !Number.isInteger(version) || version < 1 || version > CURRENT_SCHEMA_VERSION);
    if (futureVersion !== undefined) throw new Error(`数据库结构版本 ${futureVersion} 不受支持`);
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
    for (const table of ['audit_logs', 'sync_outbox', 'sync_entity_state', 'sync_conflicts', 'users', 'sessions', 'conversations', 'conversation_members', 'messages', 'operation_authorizations']) {
      if (!this.database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) {
        throw new Error(`数据库结构不完整，缺少数据表 ${table}`);
      }
    }
  }

  private migrateMoneyFieldsToCents(): void {
    const fields: Record<string, readonly string[]> = {
      purchases: ['unitPrice', 'amount'], crop_cycles: ['budget'], production_plans: ['plannedCost'],
      operation_logs: ['cost'], cost_adjustments: ['amount'],
      sales_orders: ['unitPrice', 'amount', 'initialCost', 'processCost', 'cumulativeRevenue', 'estimatedProfit', 'actualProfit', 'projectedProfit'], invoices: ['amount'],
      farm_contracts: ['amount'],
    };
    const convert = (collection: string, raw: string): string => {
      const moneyFields = fields[collection];
      if (!moneyFields) return raw;
      const payload = JSON.parse(raw) as Record<string, unknown>;
      for (const field of moneyFields) if (typeof payload[field] === 'number') payload[field] = Math.round((payload[field] as number) * 100);
      return JSON.stringify(payload);
    };
    const entityRows = this.database.prepare('SELECT collection, id, payload FROM entities').all() as unknown as Array<{ collection: string; id: string; payload: string }>;
    const updateEntity = this.database.prepare('UPDATE entities SET payload = ? WHERE collection = ? AND id = ?');
    for (const row of entityRows) updateEntity.run(convert(row.collection, row.payload), row.collection, row.id);
    const outboxRows = this.database.prepare('SELECT event_id AS eventId, collection, payload FROM sync_outbox').all() as unknown as Array<{ eventId: string; collection: string; payload: string }>;
    const updateOutbox = this.database.prepare('UPDATE sync_outbox SET payload = ? WHERE event_id = ?');
    for (const row of outboxRows) updateOutbox.run(convert(row.collection, row.payload), row.eventId);
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
      const previous = this.database.prepare(`
        SELECT updated_at AS updatedAt FROM entities WHERE collection = ? AND id = ?
      `).get(collection, entity.id) as { updatedAt: string } | undefined;
      this.database.prepare(`
        INSERT INTO entities (collection, id, payload, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(collection, id) DO UPDATE SET
          payload = excluded.payload,
          updated_at = excluded.updated_at
      `).run(collection, entity.id, JSON.stringify(entity), this.nextWriteTimestamp(previous?.updatedAt));
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
    const sourceSize = statSync(this.filePath).size;
    const disk = statfsSync(this.backupDirectory);
    const available = Number(disk.bavail) * Number(disk.bsize);
    if (available < sourceSize * 2 + 64 * 1024 * 1024) {
      throw new Error('本机可用磁盘空间不足，无法创建数据库备份');
    }
    this.database.exec('PRAGMA wal_checkpoint(FULL);');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `agriculture-${stamp}-${randomUUID().slice(0, 8)}.db`;
    const backupPath = resolve(this.backupDirectory, name);
    const escapedPath = backupPath.replace(/'/g, "''");
    try {
      this.database.exec(`VACUUM INTO '${escapedPath}'`);
      const backup = new DatabaseSync(backupPath, { readOnly: true, timeout: 5000 });
      try {
        const check = backup.prepare('PRAGMA quick_check').all() as unknown as Array<{ quick_check: string }>;
        if (check.length !== 1 || check[0].quick_check !== 'ok') throw new Error('备份完整性检查失败');
      } finally {
        backup.close();
      }
      return this.backupInfo(name);
    } catch (error) {
      rmSync(backupPath, { force: true });
      throw error;
    }
  }

  listBackups(): BackupInfo[] {
    return readdirSync(this.backupDirectory)
      .filter((name) => /^agriculture-.+\.db$/.test(name))
      .map((name) => this.backupInfo(name))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  syncFromStagedFile(importId: string, requestedSourceName: string): LocalSyncResult {
    const importPath = this.stagedImportPath(importId);
    const sourceName = this.safeSourceName(requestedSourceName);
    let imported: DatabaseSync | undefined;
    try {
      if (!existsSync(importPath)) throw new Error('待同步的数据文件不存在或已失效，请重新选择');
      const size = statSync(importPath).size;
      if (size < 100 || size > MAX_IMPORT_FILE_SIZE) throw new Error('数据文件大小无效或超过 2 GB 限制');

      imported = new DatabaseSync(importPath, { readOnly: true, timeout: 5000 });
      this.validateImportedDatabase(imported);
      const safetyBackup = this.createBackup();
      const merged = this.mergeImportedDatabase(imported, sourceName);
      return {
        sourceName,
        ...merged,
        safetyBackup,
        synchronizedAt: new Date().toISOString(),
      };
    } finally {
      try {
        imported?.close();
      } finally {
        this.discardStagedImport(importPath);
      }
    }
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

  private validateImportedDatabase(imported: DatabaseSync): void {
    const checkRows = imported.prepare('PRAGMA quick_check').all() as unknown as Array<{ quick_check: string }>;
    if (checkRows.length !== 1 || checkRows[0].quick_check !== 'ok') {
      throw new Error(`数据文件完整性检查失败：${checkRows.map((row) => row.quick_check).join('；')}`);
    }

    for (const table of ['metadata', 'entities', 'schema_migrations']) {
      if (!this.importedTableExists(imported, table)) throw new Error(`数据文件缺少必要数据表 ${table}`);
    }
    const columns = new Set(
      (imported.prepare('PRAGMA table_info(entities)').all() as unknown as Array<{ name: string }>).map((row) => row.name),
    );
    for (const column of ['collection', 'id', 'payload', 'updated_at']) {
      if (!columns.has(column)) throw new Error(`数据文件的 entities 表缺少字段 ${column}`);
    }
    const versionRow = imported.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number | null };
    if (!Number.isInteger(versionRow.version) || (versionRow.version ?? 0) < 1) {
      throw new Error('无法识别数据文件的结构版本');
    }
    if ((versionRow.version ?? 0) > CURRENT_SCHEMA_VERSION) {
      throw new Error(`数据文件结构版本 ${versionRow.version} 高于当前支持版本 ${CURRENT_SCHEMA_VERSION}`);
    }
    const entityCount = this.importedRowCount(imported, 'entities');
    if (entityCount > MAX_IMPORT_ENTITY_COUNT) throw new Error(`数据文件记录数超过 ${MAX_IMPORT_ENTITY_COUNT} 条限制`);
    if (this.importedTableExists(imported, 'telemetry_samples') && this.importedRowCount(imported, 'telemetry_samples') > MAX_IMPORT_TELEMETRY_COUNT) {
      throw new Error(`遥测记录数超过 ${MAX_IMPORT_TELEMETRY_COUNT} 条限制`);
    }
    if (this.importedTableExists(imported, 'audit_logs') && this.importedRowCount(imported, 'audit_logs') > MAX_IMPORT_AUDIT_COUNT) {
      throw new Error(`审计记录数超过 ${MAX_IMPORT_AUDIT_COUNT} 条限制`);
    }
  }

  private mergeImportedDatabase(
    imported: DatabaseSync,
    sourceName: string,
  ): Omit<LocalSyncResult, 'sourceName' | 'safetyBackup' | 'synchronizedAt'> {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let telemetryImported = 0;
    let auditImported = 0;
    const localEntity = this.database.prepare(`
      SELECT payload, updated_at AS updatedAt FROM entities WHERE collection = ? AND id = ?
    `);
    const setImportedTimestamp = this.database.prepare(`
      UPDATE entities SET updated_at = ? WHERE collection = ? AND id = ?
    `);
    const importStartedAt = Date.now();

    this.transaction(() => {
      const rows = imported.prepare(`
        SELECT collection, id, payload, updated_at AS updatedAt FROM entities ORDER BY rowid ASC
      `).iterate() as unknown as Iterable<ImportedEntityRow>;
      for (const row of rows) {
        if (typeof row.collection !== 'string' || typeof row.id !== 'string' || typeof row.payload !== 'string' || typeof row.updatedAt !== 'string') {
          throw new Error('数据文件包含字段类型无效的实体记录');
        }
        if (row.id.length > 500) throw new Error(`记录 ${row.collection} 的标识超过长度限制`);
        if (!LOCAL_IMPORT_COLLECTIONS.has(row.collection)) {
          skipped += 1;
          continue;
        }
        const local = localEntity.get(row.collection, row.id) as LocalEntityRow | undefined;
        if (local?.payload === row.payload) {
          skipped += 1;
          continue;
        }
        const importedAt = Date.parse(row.updatedAt);
        if (!Number.isFinite(importedAt)) throw new Error(`记录 ${row.collection}/${row.id} 的更新时间无效`);
        if (importedAt > importStartedAt + 5 * 60_000) throw new Error(`记录 ${row.collection}/${row.id} 的更新时间超出本机时间`);
        const payload = this.parseImportedEntity(row);
        if (local && importedAt <= Date.parse(local.updatedAt)) {
          skipped += 1;
          continue;
        }
        const restored = this.isSyncCollection(row.collection)
          ? this.restoreLocalOnlyFields(row.collection, row.id, payload)
          : payload;
        this.put(row.collection, restored as StoredEntity, 'local');
        setImportedTimestamp.run(new Date(importedAt).toISOString(), row.collection, row.id);
        if (local) updated += 1;
        else inserted += 1;
      }

      if (this.importedTableExists(imported, 'telemetry_samples')) {
        const insertTelemetry = this.database.prepare(`
          INSERT OR IGNORE INTO telemetry_samples (id, device_id, recorded_at, payload) VALUES (?, ?, ?, ?)
        `);
        const rows = imported.prepare(`
          SELECT id, device_id AS deviceId, recorded_at AS recordedAt, payload FROM telemetry_samples ORDER BY rowid ASC
        `).iterate() as unknown as Iterable<ImportedTelemetryRow>;
        for (const row of rows) {
          this.validateImportedTextRow(row, ['id', 'deviceId', 'recordedAt', 'payload'], '遥测');
          if (!this.validImportedDate(row.recordedAt) || Date.parse(row.recordedAt) > importStartedAt + 5 * 60_000) {
            throw new Error(`遥测记录 ${row.id} 的采集时间无效或超出本机时间`);
          }
          if (row.payload.length > MAX_IMPORT_PAYLOAD_LENGTH) throw new Error(`遥测记录 ${row.id} 超过大小限制`);
          JSON.parse(row.payload);
          telemetryImported += Number(insertTelemetry.run(row.id, row.deviceId, row.recordedAt, row.payload).changes);
        }
      }

      if (this.importedTableExists(imported, 'audit_logs')) {
        const insertAudit = this.database.prepare(`
          INSERT OR IGNORE INTO audit_logs (id, domain, record_id, action, detail, actor, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const rows = imported.prepare(`
          SELECT id, domain, record_id AS recordId, action, detail, actor, created_at AS createdAt
          FROM audit_logs ORDER BY rowid ASC
        `).iterate() as unknown as Iterable<ImportedAuditRow>;
        for (const row of rows) {
          this.validateImportedTextRow(row, ['id', 'domain', 'recordId', 'action', 'detail', 'actor', 'createdAt'], '审计');
          if (!this.validImportedDate(row.createdAt) || Date.parse(row.createdAt) > importStartedAt + 5 * 60_000) {
            throw new Error(`审计记录 ${row.id} 的创建时间无效或超出本机时间`);
          }
          auditImported += Number(insertAudit.run(
            row.id, row.domain, row.recordId, row.action, row.detail, row.actor, row.createdAt,
          ).changes);
        }
      }

      this.validateImportedReferences();

      this.appendAudit(
        'system',
        randomUUID(),
        'local_sync',
        `${sourceName}；新增 ${inserted}；更新 ${updated}；跳过 ${skipped}；遥测 ${telemetryImported}；审计 ${auditImported}`,
      );
    });
    return { inserted, updated, skipped, telemetryImported, auditImported };
  }

  private parseImportedEntity(row: ImportedEntityRow): Record<string, unknown> {
    if (row.payload.length > MAX_IMPORT_PAYLOAD_LENGTH) throw new Error(`记录 ${row.collection}/${row.id} 超过大小限制`);
    let payload: unknown;
    try {
      payload = JSON.parse(row.payload);
    } catch {
      throw new Error(`记录 ${row.collection}/${row.id} 的 JSON 数据无效`);
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error(`记录 ${row.collection}/${row.id} 的数据结构无效`);
    }
    if ((payload as Record<string, unknown>).id !== row.id) {
      throw new Error(`记录 ${row.collection}/${row.id} 的标识不一致`);
    }
    const entity = payload as Record<string, unknown>;
    this.validateImportedEntityShape(row.collection, entity);
    return entity;
  }

  private validateImportedTextRow(row: object, fields: string[], label: string): void {
    const input = row as Record<string, unknown>;
    if (fields.some((field) => typeof input[field] !== 'string')) throw new Error(`${label}数据包含无效字段`);
    if (fields.some((field) => (input[field] as string).length > MAX_IMPORT_TEXT_LENGTH)) throw new Error(`${label}数据字段超过长度限制`);
  }

  private validateImportedEntityShape(collection: string, entity: Record<string, unknown>): void {
    const schema = IMPORTED_ENTITY_SCHEMAS[collection];
    if (!schema) throw new Error(`不支持导入数据集合 ${collection}`);
    for (const field of schema.strings) this.requireImportedType(collection, entity, field, 'string');
    for (const field of schema.numbers ?? []) {
      this.requireImportedType(collection, entity, field, 'number');
      if (!Number.isFinite(entity[field] as number)) throw new Error(`记录 ${collection}/${entity.id} 的字段 ${field} 不是有限数值`);
    }
    for (const field of schema.booleans ?? []) this.requireImportedType(collection, entity, field, 'boolean');
    for (const field of schema.objects ?? []) this.requireImportedType(collection, entity, field, 'object');
    for (const field of schema.nullableStrings ?? []) {
      if (entity[field] !== null) this.requireImportedType(collection, entity, field, 'string');
    }
    for (const [field, values] of Object.entries(schema.enums ?? {})) {
      if (!values.includes(entity[field] as string)) throw new Error(`记录 ${collection}/${entity.id} 的字段 ${field} 取值无效`);
    }
    if (collection === 'devices') {
      const telemetry = entity.telemetry as Record<string, unknown>;
      if (!telemetry || Array.isArray(telemetry)) throw new Error(`记录 ${collection}/${entity.id} 的 telemetry 结构无效`);
      for (const field of ['temperature', 'humidity', 'soilMoisture', 'light']) {
        if (typeof telemetry[field] !== 'number' || !Number.isFinite(telemetry[field] as number)) {
          throw new Error(`记录 ${collection}/${entity.id} 的 telemetry.${field} 无效`);
        }
      }
      if (typeof telemetry.recordedAt !== 'string') throw new Error(`记录 ${collection}/${entity.id} 的 telemetry.recordedAt 无效`);
      if (!this.validImportedDate(telemetry.recordedAt)) throw new Error(`记录 ${collection}/${entity.id} 的 telemetry.recordedAt 无效`);
      const telemetryRanges: Record<string, readonly [number, number]> = {
        temperature: [-50, 80], humidity: [0, 100], soilMoisture: [0, 100], light: [0, 200_000],
      };
      for (const [field, [minimum, maximum]] of Object.entries(telemetryRanges)) {
        const value = telemetry[field] as number;
        if (value < minimum || value > maximum) throw new Error(`记录 ${collection}/${entity.id} 的 telemetry.${field} 超出范围`);
      }
    }
    this.validateImportedBusinessRules(collection, entity);
  }

  private requireImportedType(collection: string, entity: Record<string, unknown>, field: string, type: 'string' | 'number' | 'boolean' | 'object'): void {
    const value = entity[field];
    if (typeof value !== type || (type === 'object' && (!value || Array.isArray(value)))) {
      throw new Error(`记录 ${collection}/${entity.id} 的字段 ${field} 类型无效`);
    }
    if (type === 'string' && (value as string).length > MAX_IMPORT_TEXT_LENGTH) {
      throw new Error(`记录 ${collection}/${entity.id} 的字段 ${field} 超过长度限制`);
    }
  }

  private validateImportedBusinessRules(collection: string, entity: Record<string, unknown>): void {
    for (const [field, [minimum, maximum]] of Object.entries(IMPORTED_NUMBER_RANGES[collection] ?? {})) {
      const value = entity[field] as number;
      if (value < minimum || value > maximum) throw new Error(`记录 ${collection}/${entity.id} 的字段 ${field} 超出范围`);
    }
    if (collection === 'crop_cycles' && !Number.isInteger(entity.seasonYear)) throw new Error(`记录 ${collection}/${entity.id} 的 seasonYear 必须是整数`);
    const moneyFields: Record<string, readonly string[]> = {
      purchases: ['unitPrice', 'amount'], crop_cycles: ['budget'], production_plans: ['plannedCost'], operation_logs: ['cost'],
      cost_adjustments: ['amount'], sales_orders: ['unitPrice', 'amount'], invoices: ['amount'], farm_contracts: ['amount'],
    };
    for (const field of moneyFields[collection] ?? []) {
      if (!Number.isSafeInteger(entity[field])) throw new Error(`记录 ${collection}/${entity.id} 的金额字段 ${field} 必须是整数分`);
    }
    if (collection === 'farm_contracts' && !Number.isInteger(entity.reminderDays)) throw new Error(`记录 ${collection}/${entity.id} 的 reminderDays 必须是整数`);
    for (const [field, value] of Object.entries(entity)) {
      if (value !== null && IMPORTED_DATE_FIELDS.has(field) && (typeof value !== 'string' || !this.validImportedDate(value))) {
        throw new Error(`记录 ${collection}/${entity.id} 的日期字段 ${field} 无效`);
      }
    }

    if (collection === 'fields') this.assertImportedDateOrder(collection, entity, 'plantedAt', 'expectedHarvestAt');
    if (collection === 'crop_cycles') {
      this.assertImportedDateOrder(collection, entity, 'plannedStart', 'plannedHarvest');
      this.assertImportedDateOrder(collection, entity, 'actualStart', 'actualHarvest');
      if (entity.status === 'completed' && entity.actualHarvest === null) throw new Error(`记录 ${collection}/${entity.id} 已完成但缺少实际采收时间`);
    }
    if (collection === 'compliance_documents') this.assertImportedDateOrder(collection, entity, 'issueDate', 'expiryDate');
    if (collection === 'farm_contracts') this.assertImportedDateOrder(collection, entity, 'startDate', 'endDate');
    if (collection === 'tasks') this.assertImportedCompletionState(collection, entity, 'completed', 'completedAt');
    if (collection === 'purchases') this.assertImportedCompletionState(collection, entity, 'received', 'receivedAt');
    if (collection === 'issues') this.assertImportedCompletionState(collection, entity, 'closed', 'closedAt');
    if (collection === 'corrections') this.assertImportedCompletionState(collection, entity, 'resolved', 'resolvedAt');
    if (collection === 'production_plans') this.assertImportedCompletionState(collection, entity, 'completed', 'completedAt');
    if (collection === 'purchases' || collection === 'sales_orders') {
      const expected = Math.round((entity.quantity as number) * (entity.unitPrice as number));
      if ((entity.amount as number) !== expected) throw new Error(`记录 ${collection}/${entity.id} 的金额与数量单价不一致`);
    }
  }

  private assertImportedCompletionState(
    collection: string,
    entity: Record<string, unknown>,
    completedStatus: string,
    completedAtField: string,
  ): void {
    const completed = entity.status === completedStatus;
    if (completed !== (entity[completedAtField] !== null)) {
      throw new Error(`记录 ${collection}/${entity.id} 的状态与 ${completedAtField} 不一致`);
    }
  }

  private assertImportedDateOrder(
    collection: string,
    entity: Record<string, unknown>,
    startField: string,
    endField: string,
  ): void {
    const start = entity[startField];
    const end = entity[endField];
    if (typeof start === 'string' && typeof end === 'string' && Date.parse(end) < Date.parse(start)) {
      throw new Error(`记录 ${collection}/${entity.id} 的 ${endField} 不能早于 ${startField}`);
    }
  }

  private validImportedDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value) && Number.isFinite(Date.parse(value));
  }

  private validateImportedReferences(): void {
    const collections = new Set([
      ...Object.keys(IMPORTED_ENTITY_REFERENCES),
      ...Object.values(IMPORTED_ENTITY_REFERENCES).flatMap((references) => Object.values(references)),
    ]);
    const entities = new Map<string, Map<string, Record<string, unknown>>>();
    for (const collection of collections) {
      const rows = this.database.prepare('SELECT id, payload FROM entities WHERE collection = ?').all(collection) as unknown as Array<{ id: string; payload: string }>;
      entities.set(collection, new Map(rows.map((row) => [row.id, JSON.parse(row.payload) as Record<string, unknown>])));
    }
    for (const [collection, references] of Object.entries(IMPORTED_ENTITY_REFERENCES)) {
      for (const [id, entity] of entities.get(collection) ?? []) {
        for (const [field, targetCollection] of Object.entries(references)) {
          const value = entity[field];
          if (value !== null && typeof value === 'string' && !entities.get(targetCollection)?.has(value)) {
            throw new Error(`记录 ${collection}/${id} 引用了不存在的 ${targetCollection}/${value}`);
          }
        }
      }
    }

    const get = (collection: string, id: unknown) => typeof id === 'string' ? entities.get(collection)?.get(id) : undefined;
    for (const farm of entities.get('farms')?.values() ?? []) {
      const subject = get('business_subjects', farm.subjectId);
      if (farm.status === 'active' && subject?.status !== 'active') throw new Error(`启用农场 ${farm.id} 的经营主体未启用`);
    }
    const activeCycleFields = new Set<string>();
    for (const cycle of entities.get('crop_cycles')?.values() ?? []) {
      const field = get('fields', cycle.fieldId);
      const farm = get('farms', field?.farmId);
      if (['planned', 'in_progress', 'harvesting'].includes(cycle.status as string)) {
        if (activeCycleFields.has(cycle.fieldId as string)) throw new Error(`地块 ${cycle.fieldId} 存在多个未结束种植季`);
        activeCycleFields.add(cycle.fieldId as string);
        if (farm?.status !== 'active') throw new Error(`未结束种植季 ${cycle.id} 所属农场未启用`);
      }
    }
    for (const plan of entities.get('production_plans')?.values() ?? []) {
      const cycle = get('crop_cycles', plan.cycleId);
      if (cycle?.fieldId !== plan.fieldId) throw new Error(`生产计划 ${plan.id} 与种植季地块不一致`);
      if (['planned', 'in_progress'].includes(plan.status as string) && ['completed', 'cancelled'].includes(cycle?.status as string)) {
        throw new Error(`未结束生产计划 ${plan.id} 关联了已结束种植季`);
      }
    }
    for (const operation of entities.get('operation_logs')?.values() ?? []) {
      const cycle = get('crop_cycles', operation.cycleId);
      const plan = operation.planId === null ? undefined : get('production_plans', operation.planId);
      if (cycle?.fieldId !== operation.fieldId) throw new Error(`农事实绩 ${operation.id} 与种植季地块不一致`);
      if (plan && (plan.cycleId !== operation.cycleId || plan.fieldId !== operation.fieldId)) throw new Error(`农事实绩 ${operation.id} 与生产计划不一致`);
    }
    for (const harvest of entities.get('harvest_batches')?.values() ?? []) {
      if (get('crop_cycles', harvest.cycleId)?.fieldId !== harvest.fieldId) throw new Error(`采收批次 ${harvest.id} 与种植季地块不一致`);
    }
    for (const collection of ['compliance_documents', 'farm_contracts']) {
      for (const entity of entities.get(collection)?.values() ?? []) {
        const farm = entity.farmId === null ? undefined : get('farms', entity.farmId);
        const field = collection === 'compliance_documents' && entity.fieldId !== null ? get('fields', entity.fieldId) : undefined;
        if (entity.subjectId !== null && farm && farm.subjectId !== entity.subjectId) throw new Error(`记录 ${collection}/${entity.id} 的农场与经营主体不一致`);
        if (field && farm && field.farmId !== farm.id) throw new Error(`记录 ${collection}/${entity.id} 的地块与农场不一致`);
        if (entity.subjectId !== null && field) {
          const fieldFarm = get('farms', field.farmId);
          if (fieldFarm?.subjectId !== entity.subjectId) throw new Error(`记录 ${collection}/${entity.id} 的地块与经营主体不一致`);
        }
      }
    }
  }

  private importedTableExists(imported: DatabaseSync, name: string): boolean {
    return imported.prepare(`
      SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
    `).get(name) !== undefined;
  }

  private importedRowCount(imported: DatabaseSync, table: 'entities' | 'telemetry_samples' | 'audit_logs'): number {
    const row = imported.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
    return row.count;
  }

  private stagedImportPath(importId: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(importId)) {
      throw new Error('本地同步请求标识无效');
    }
    return resolve(this.importDirectory, `${importId}.db`);
  }

  private discardStagedImport(importPath: string): void {
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${importPath}${suffix}`, { force: true });
  }

  private safeSourceName(value: string): string {
    const normalized = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
    return normalized.slice(0, 200) || '本地 SQLite 数据文件';
  }

  private nextWriteTimestamp(previous?: string): string {
    const previousAt = previous ? Date.parse(previous) : Number.NaN;
    const timestamp = Number.isFinite(previousAt) ? Math.max(Date.now(), previousAt + 1) : Date.now();
    return new Date(timestamp).toISOString();
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
