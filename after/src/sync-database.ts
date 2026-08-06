import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve } from 'path';
import { ApplicationDatabase } from './application-database';
import { SyncChange, SyncEvent, SyncExchangeResponse, SyncResult } from './sync.types';

interface EntityRow {
  payload: string;
  revision: number;
}

interface ResultRow {
  response: string;
}

interface ChangeRow {
  cursor: number;
  collection: SyncChange['collection'];
  entityId: string;
  revision: number;
  payload: string;
  sourceClientId: string;
  changedAt: string;
}

const APPLICATION_STATE_KEYS: Partial<Record<SyncChange['collection'], string>> = {
  fields: 'agriculture.fields',
  tasks: 'agriculture.tasks',
  devices: 'agriculture.devices',
  alerts: 'agriculture.alerts',
  inventory: 'agriculture.inventory',
  purchases: 'agriculture.purchases',
};

@Injectable()
export class SyncDatabase {
  private readonly database: DatabaseSync;
  readonly filePath: string;

  constructor(private readonly applicationDatabase: ApplicationDatabase) {
    this.filePath = applicationDatabase.filePath;
    this.database = applicationDatabase.connection;
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_entities (
        collection TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        revision INTEGER NOT NULL,
        source_client_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (collection, entity_id)
      );

      CREATE TABLE IF NOT EXISTS sync_changes (
        cursor INTEGER PRIMARY KEY AUTOINCREMENT,
        collection TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        payload TEXT NOT NULL,
        source_client_id TEXT NOT NULL,
        changed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sync_changes_cursor ON sync_changes (cursor);

      CREATE TABLE IF NOT EXISTS processed_sync_events (
        client_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        response TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (client_id, event_id)
      );

      CREATE TABLE IF NOT EXISTS uprooted_fields (
        field_id TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL
      );
    `);
    this.migrateLegacyDatabase();
    this.projectExistingEntities();
  }

  serverId(): string {
    const existing = this.database.prepare('SELECT value FROM metadata WHERE key = ?').get('server_id') as { value: string } | undefined;
    if (existing) return existing.value;
    const value = randomUUID();
    this.database.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)').run('server_id', value);
    return value;
  }

  latestCursor(): number {
    const row = this.database.prepare('SELECT MAX(cursor) AS cursor FROM sync_changes').get() as { cursor: number | null };
    return row.cursor ?? 0;
  }

  exchange(clientId: string, cursor: number, events: SyncEvent[], limit: number): SyncExchangeResponse {
    const results = this.transaction(() => events.map((event) => this.applyEvent(clientId, event)));
    const rows = this.database.prepare(`
      SELECT cursor, collection, entity_id AS entityId, revision, payload,
             source_client_id AS sourceClientId, changed_at AS changedAt
      FROM sync_changes WHERE cursor > ? ORDER BY cursor ASC LIMIT ?
    `).all(cursor, limit + 1) as unknown as ChangeRow[];
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const changes: SyncChange[] = page.map((row) => ({
      ...row,
      payload: JSON.parse(row.payload) as Record<string, unknown>,
    }));
    return {
      serverId: this.serverId(),
      schemaVersion: 1,
      results,
      changes,
      nextCursor: changes.at(-1)?.cursor ?? cursor,
      hasMore,
      serverTime: new Date().toISOString(),
    };
  }

  private applyEvent(clientId: string, event: SyncEvent): SyncResult {
    const processed = this.database.prepare(`
      SELECT response FROM processed_sync_events WHERE client_id = ? AND event_id = ?
    `).get(clientId, event.eventId) as ResultRow | undefined;
    if (processed) {
      const result = JSON.parse(processed.response) as SyncResult;
      return { ...result, status: 'duplicate' };
    }

    const current = this.database.prepare(`
      SELECT payload, revision FROM sync_entities WHERE collection = ? AND entity_id = ?
    `).get(event.collection, event.entityId) as EntityRow | undefined;
    const currentRevision = current?.revision ?? 0;
    let result: SyncResult;
    if (event.baseRevision !== currentRevision) {
      result = {
        eventId: event.eventId,
        status: 'conflict',
        revision: currentRevision,
        payload: current ? JSON.parse(current.payload) as Record<string, unknown> : {},
      };
    } else {
      const revision = currentRevision + 1;
      const changedAt = new Date().toISOString();
      const normalizedPayload = this.normalizeUprootedState(event.collection, event.payload, changedAt);
      const payload = JSON.stringify(normalizedPayload);
      this.database.prepare(`
        INSERT INTO sync_entities (collection, entity_id, payload, revision, source_client_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(collection, entity_id) DO UPDATE SET
          payload = excluded.payload,
          revision = excluded.revision,
          source_client_id = excluded.source_client_id,
          updated_at = excluded.updated_at
      `).run(event.collection, event.entityId, payload, revision, clientId, changedAt);
      this.database.prepare(`
        INSERT INTO sync_changes (collection, entity_id, revision, payload, source_client_id, changed_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(event.collection, event.entityId, revision, payload, clientId, changedAt);
      this.projectApplicationEntity(event.collection, normalizedPayload);
      if (event.collection === 'fields' && this.isUprootedField(normalizedPayload)) {
        this.markUprooted(event.entityId, changedAt);
        this.cancelRelatedProduction(event.entityId, changedAt);
      }
      result = { eventId: event.eventId, status: 'accepted', revision, payload: normalizedPayload };
    }

    this.database.prepare(`
      INSERT INTO processed_sync_events (client_id, event_id, response, created_at)
      VALUES (?, ?, ?, ?)
    `).run(clientId, event.eventId, JSON.stringify(result), new Date().toISOString());
    return result;
  }

  recordUproot(fieldId: string, updatedField: Record<string, unknown>, changedAt: string): void {
    this.markUprooted(fieldId, changedAt);
    const current = this.entity('fields', fieldId);
    this.writeServerChange('fields', fieldId, { ...current?.payload, ...updatedField, crop: '', status: 'fallow' }, changedAt);
    this.cancelRelatedProduction(fieldId, changedAt);
  }

  recordEntity(collection: SyncChange['collection'], payload: Record<string, unknown>, changedAt = new Date().toISOString()): void {
    const entityId = String(payload.id ?? '');
    if (!entityId) throw new Error(`同步集合 ${collection} 的记录缺少 id`);
    this.writeServerChange(collection, entityId, payload, changedAt);
  }

  private normalizeUprootedState(collection: SyncChange['collection'], payload: Record<string, unknown>, changedAt: string): Record<string, unknown> {
    const fieldId = collection === 'fields' ? String(payload.id ?? '') : String(payload.fieldId ?? '');
    if (!fieldId || !this.isMarkedUprooted(fieldId)) return payload;
    if (collection === 'fields') return { ...payload, crop: '', status: 'fallow' };
    if (collection === 'crop_cycles' && ['planned', 'in_progress', 'harvesting'].includes(String(payload.status))) {
      return { ...payload, status: 'cancelled', updatedAt: changedAt };
    }
    if (collection === 'production_plans' && ['planned', 'in_progress'].includes(String(payload.status))) {
      return { ...payload, status: 'cancelled', updatedAt: changedAt, completedAt: null };
    }
    return payload;
  }

  private cancelRelatedProduction(fieldId: string, changedAt: string): void {
    const cycles = this.entities('crop_cycles').filter((item) => item.payload.fieldId === fieldId && ['planned', 'in_progress', 'harvesting'].includes(String(item.payload.status)));
    const cycleIds = new Set(cycles.map((item) => item.entityId));
    const plans = this.entities('production_plans').filter((item) => (item.payload.fieldId === fieldId || cycleIds.has(String(item.payload.cycleId))) && ['planned', 'in_progress'].includes(String(item.payload.status)));
    for (const cycle of cycles) this.writeServerChange('crop_cycles', cycle.entityId, { ...cycle.payload, status: 'cancelled', updatedAt: changedAt }, changedAt);
    for (const plan of plans) this.writeServerChange('production_plans', plan.entityId, { ...plan.payload, status: 'cancelled', updatedAt: changedAt, completedAt: null }, changedAt);
  }

  private writeServerChange(collection: SyncChange['collection'], entityId: string, payload: Record<string, unknown>, changedAt: string): void {
    const current = this.entity(collection, entityId);
    const revision = (current?.revision ?? 0) + 1;
    const serialized = JSON.stringify(payload);
    this.database.prepare(`
      INSERT INTO sync_entities (collection, entity_id, payload, revision, source_client_id, updated_at)
      VALUES (?, ?, ?, ?, 'cloud-api', ?)
      ON CONFLICT(collection, entity_id) DO UPDATE SET
        payload = excluded.payload,
        revision = excluded.revision,
        source_client_id = excluded.source_client_id,
        updated_at = excluded.updated_at
    `).run(collection, entityId, serialized, revision, changedAt);
    this.database.prepare(`
      INSERT INTO sync_changes (collection, entity_id, revision, payload, source_client_id, changed_at)
      VALUES (?, ?, ?, ?, 'cloud-api', ?)
    `).run(collection, entityId, revision, serialized, changedAt);
    this.projectApplicationEntity(collection, payload);
  }

  private entity(collection: SyncChange['collection'], entityId: string): { payload: Record<string, unknown>; revision: number } | undefined {
    const row = this.database.prepare('SELECT payload, revision FROM sync_entities WHERE collection = ? AND entity_id = ?')
      .get(collection, entityId) as EntityRow | undefined;
    return row ? { payload: JSON.parse(row.payload) as Record<string, unknown>, revision: row.revision } : undefined;
  }

  private entities(collection: SyncChange['collection']): Array<{ entityId: string; payload: Record<string, unknown> }> {
    const rows = this.database.prepare('SELECT entity_id AS entityId, payload FROM sync_entities WHERE collection = ?')
      .all(collection) as unknown as Array<{ entityId: string; payload: string }>;
    return rows.map((row) => ({ entityId: row.entityId, payload: JSON.parse(row.payload) as Record<string, unknown> }));
  }

  private isUprootedField(payload: Record<string, unknown>): boolean {
    return payload.status === 'fallow' && !payload.crop;
  }

  private isMarkedUprooted(fieldId: string): boolean {
    return Boolean(this.database.prepare('SELECT 1 FROM uprooted_fields WHERE field_id = ?').get(fieldId));
  }

  private markUprooted(fieldId: string, changedAt: string): void {
    this.database.prepare(`
      INSERT INTO uprooted_fields (field_id, updated_at) VALUES (?, ?)
      ON CONFLICT(field_id) DO UPDATE SET updated_at = excluded.updated_at
    `).run(fieldId, changedAt);
  }

  private projectApplicationEntity(collection: SyncChange['collection'], payload: Record<string, unknown>): void {
    const stateKey = APPLICATION_STATE_KEYS[collection];
    const entityId = String(payload.id ?? '');
    if (!stateKey || !entityId) return;
    const current = this.applicationDatabase.readState<Record<string, unknown>[]>(stateKey, []);
    const next = current.some((item) => item.id === entityId)
      ? current.map((item) => item.id === entityId ? payload : item)
      : [...current, payload];
    this.applicationDatabase.writeState(stateKey, next);
  }

  private projectExistingEntities(): void {
    for (const [collection, stateKey] of Object.entries(APPLICATION_STATE_KEYS) as Array<[SyncChange['collection'], string]>) {
      const entities = this.entities(collection);
      if (!entities.length) continue;
      const current = this.applicationDatabase.readState<Record<string, unknown>[]>(stateKey, []);
      const merged = new Map(current.map((item) => [String(item.id), item]));
      for (const entity of entities) merged.set(entity.entityId, entity.payload);
      this.applicationDatabase.writeState(stateKey, [...merged.values()]);
    }
  }

  private transaction<T>(operation: () => T): T {
    return this.applicationDatabase.transaction(operation);
  }

  private migrateLegacyDatabase(): void {
    const legacyPath = resolve(dirname(this.filePath), 'cloud-sync.db');
    if (!existsSync(legacyPath) || resolve(legacyPath) === resolve(this.filePath)) return;
    this.database.prepare('ATTACH DATABASE ? AS legacy_sync').run(legacyPath);
    try {
      const available = this.database.prepare("SELECT 1 FROM legacy_sync.sqlite_master WHERE type = 'table' AND name = 'sync_entities'").get();
      if (!available) return;
      this.transaction(() => {
        this.database.exec(`
          INSERT OR IGNORE INTO metadata SELECT * FROM legacy_sync.metadata;
          INSERT OR IGNORE INTO sync_entities SELECT * FROM legacy_sync.sync_entities;
          INSERT OR IGNORE INTO sync_changes SELECT * FROM legacy_sync.sync_changes;
          INSERT OR IGNORE INTO processed_sync_events SELECT * FROM legacy_sync.processed_sync_events;
        `);
      });
    } finally {
      this.database.exec('DETACH DATABASE legacy_sync');
    }
  }
}
