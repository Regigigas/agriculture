import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { mkdirSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'path';

@Injectable()
export class ApplicationDatabase implements OnModuleDestroy {
  readonly connection: DatabaseSync;
  readonly filePath: string;

  constructor() {
    const dataDirectory = resolve(
      process.env.AGRI_APP_DATA_DIR ?? process.env.AGRI_CLOUD_DATA_DIR ?? resolve(process.cwd(), 'data'),
    );
    mkdirSync(dataDirectory, { recursive: true });
    this.filePath = resolve(dataDirectory, 'application.db');
    this.connection = new DatabaseSync(this.filePath);
    this.connection.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
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
        member_role TEXT NOT NULL,
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
    `);
    this.migrateMessageIdempotency();
  }

  private migrateMessageIdempotency(): void {
    const row = this.connection.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'messages'")
      .get() as { sql: string } | undefined;
    const schema = row?.sql.replace(/\s+/g, '').toLowerCase() ?? '';
    if (schema.includes('unique(conversation_id,sender_id,client_message_id)')) return;

    this.transaction(() => {
      this.connection.exec(`
        CREATE TABLE messages_migrated (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          sender_id TEXT NOT NULL REFERENCES users(id),
          client_message_id TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(conversation_id, sender_id, client_message_id)
        );
        INSERT INTO messages_migrated
          (id, conversation_id, sender_id, client_message_id, body, created_at)
          SELECT id, conversation_id, sender_id, client_message_id, body, created_at FROM messages;
        DROP TABLE messages;
        ALTER TABLE messages_migrated RENAME TO messages;
        CREATE INDEX idx_messages_conversation_time
          ON messages(conversation_id, created_at DESC, id DESC);
      `);
    });
  }

  transaction<T>(operation: () => T): T {
    if (this.connection.isTransaction) return operation();
    this.connection.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.connection.exec('COMMIT');
      return result;
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }

  onModuleDestroy(): void {
    this.connection.close();
  }
}
