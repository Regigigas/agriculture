import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'path';
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

@Injectable()
export class SyncDatabase implements OnModuleDestroy {
  private readonly database: DatabaseSync;
  readonly filePath: string;

  constructor() {
    const dataDirectory = resolve(process.env.AGRI_CLOUD_DATA_DIR ?? resolve(process.cwd(), 'data'));
    mkdirSync(dataDirectory, { recursive: true });
    this.filePath = resolve(dataDirectory, 'cloud-sync.db');
    this.database = new DatabaseSync(this.filePath);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA synchronous = NORMAL;

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
    `);
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
      const payload = JSON.stringify(event.payload);
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
      result = { eventId: event.eventId, status: 'accepted', revision, payload: event.payload };
    }

    this.database.prepare(`
      INSERT INTO processed_sync_events (client_id, event_id, response, created_at)
      VALUES (?, ?, ?, ?)
    `).run(clientId, event.eventId, JSON.stringify(result), new Date().toISOString());
    return result;
  }

  private transaction<T>(operation: () => T): T {
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
