import { existsSync, mkdtempSync, rmSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalDatabase } from '../src/local-database';

describe('本地数据库备份', () => {
  let directory: string;
  let database: LocalDatabase;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'agriculture-local-backup-'));
    process.env.AGRI_DATA_DIR = directory;
    database = new LocalDatabase();
  });

  afterEach(() => {
    database.onModuleDestroy();
    rmSync(directory, { recursive: true, force: true });
    delete process.env.AGRI_DATA_DIR;
  });

  it('生成可独立读取的一致性 SQLite 快照', () => {
    database.put('tasks', { id: 'task-backup', title: '备份回归任务' });
    const backup = database.createBackup();
    expect(existsSync(backup.path)).toBe(true);
    expect(database.listBackups()[0].name).toBe(backup.name);

    const snapshot = new DatabaseSync(backup.path, { readOnly: true });
    try {
      expect(snapshot.prepare('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' });
      const row = snapshot.prepare(`
        SELECT payload FROM entities WHERE collection = 'tasks' AND id = 'task-backup'
      `).get() as { payload: string };
      expect(JSON.parse(row.payload).title).toBe('备份回归任务');
    } finally {
      snapshot.close();
    }
  });

  it('完整性检查返回通过状态', () => {
    expect(database.integrityCheck()).toMatchObject({ ok: true, messages: ['ok'] });
  });
});
