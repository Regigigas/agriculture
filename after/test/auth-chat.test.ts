import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DatabaseSync } from 'node:sqlite';
import { ForbiddenException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationDatabase } from '../src/application-database';
import { AgricultureController } from '../src/agriculture.controller';
import { AgricultureService } from '../src/agriculture.service';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { ROLES_KEY } from '../src/auth/roles.decorator';
import { ChatService } from '../src/chat/chat.service';
import { SyncController } from '../src/sync.controller';
import { SyncDatabase } from '../src/sync-database';

describe('账号与聊天持久化', () => {
  let directory: string;
  let database: ApplicationDatabase;
  let auth: AuthService;
  let chat: ChatService;
  let sync: SyncDatabase;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'agriculture-auth-chat-'));
    process.env.AGRI_APP_DATA_DIR = directory;
    process.env.ADMIN_PASSWORD = 'Admin12345';
    process.env.ALLOW_PUBLIC_REGISTRATION = 'true';
    delete process.env.DEMO_TOKEN;
    database = new ApplicationDatabase();
    sync = new SyncDatabase(database);
    auth = new AuthService(database);
    chat = new ChatService(database);
  });

  afterEach(() => {
    database.onModuleDestroy();
    rmSync(directory, { recursive: true, force: true });
    delete process.env.AGRI_APP_DATA_DIR;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ALLOW_PUBLIC_REGISTRATION;
    delete process.env.DEMO_TOKEN;
  });

  it('默认关闭公共注册', () => {
    delete process.env.ALLOW_PUBLIC_REGISTRATION;
    expect(() => auth.register({ username: 'public_user', password: 'Public1234', name: '公共用户' }))
      .toThrow('公共注册未开放');
  });

  it('管理员可创建固定角色账号且 worker 被拒绝', () => {
    const admin = auth.login('admin', 'Admin12345').user;
    const worker = auth.createUser(admin.id, {
      username: 'fixed_worker',
      password: 'Worker1234',
      name: '固定员工',
      role: 'worker',
    });
    expect(worker.role).toBe('worker');
    expect(auth.login('fixed_worker', 'Worker1234').user.id).toBe(worker.id);
    let denied: unknown;
    try {
      auth.createUser(worker.id, {
        username: 'forbidden_user',
        password: 'Worker5678',
        name: '越权账号',
        role: 'admin',
      });
    } catch (error) {
      denied = error;
    }
    expect(denied).toBeInstanceOf(ForbiddenException);
    expect((denied as ForbiddenException).getStatus()).toBe(403);
    expect(Reflect.getMetadata(ROLES_KEY, AuthController.prototype.createUser)).toEqual(['admin']);
    expect(Reflect.getMetadata(ROLES_KEY, AuthController.prototype.authorizeOperation)).toEqual(['admin']);
    expect(Reflect.getMetadata(ROLES_KEY, SyncController)).toEqual(['admin']);
  });

  it('注册后使用哈希密码并可恢复登录会话', () => {
    const registered = auth.register({ username: 'field_user', password: 'Field1234', name: '巡田人员' });
    expect(auth.authenticate(registered.token)?.id).toBe(registered.user.id);
    const stored = database.connection.prepare(`
      SELECT password_hash AS passwordHash FROM users WHERE id = ?
    `).get(registered.user.id) as { passwordHash: string };
    expect(stored.passwordHash).not.toContain('Field1234');
    expect(auth.login('field_user', 'Field1234').user.name).toBe('巡田人员');
    expect(() => auth.register({ username: 'field_user', password: 'Other1234', name: '重复用户' })).toThrow('已被使用');
  });

  it('修改密码后撤销旧令牌并拒绝旧密码', () => {
    const registered = auth.register({ username: 'warehouse', password: 'Stock1234', name: '仓管人员' });
    auth.changePassword(registered.user.id, 'Stock1234', 'Changed5678');
    expect(auth.authenticate(registered.token)).toBeUndefined();
    expect(() => auth.login('warehouse', 'Stock1234')).toThrow('用户名或密码错误');
    expect(auth.login('warehouse', 'Changed5678').user.id).toBe(registered.user.id);
  });

  it('复用唯一私聊并保证消息发送幂等', () => {
    const alice = auth.register({ username: 'alice_user', password: 'Alice1234', name: '甲巡田员' }).user;
    const bob = auth.register({ username: 'bob_user', password: 'Bobpass123', name: '乙巡田员' }).user;
    const first = chat.createPrivate(alice.id, bob.id);
    const repeated = chat.createPrivate(bob.id, alice.id);
    expect(repeated.id).toBe(first.id);

    const sent = chat.sendMessage(alice.id, first.id, { body: '东区墒情偏低', clientMessageId: 'message-client-0001' });
    const retried = chat.sendMessage(alice.id, first.id, { body: '东区墒情偏低', clientMessageId: 'message-client-0001' });
    expect(retried.id).toBe(sent.id);
    expect(chat.listMessages(bob.id, first.id, undefined, 50)).toHaveLength(1);
    expect(chat.listConversations(bob.id)[0].unreadCount).toBe(1);
    chat.markRead(bob.id, first.id);
    expect(chat.listConversations(bob.id)[0].unreadCount).toBe(0);
  });

  it('同一发送方可在不同会话复用 clientMessageId', () => {
    const alice = auth.register({ username: 'cross_alice', password: 'Alice1234', name: '跨会话甲' }).user;
    const bob = auth.register({ username: 'cross_bob', password: 'Bobpass123', name: '跨会话乙' }).user;
    const direct = chat.createPrivate(alice.id, bob.id);
    const group = chat.createGroup(alice.id, '跨会话群', [bob.id]);
    const clientMessageId = 'shared-client-message-001';
    const directMessage = chat.sendMessage(alice.id, direct.id, { body: '私聊消息', clientMessageId });
    const groupMessage = chat.sendMessage(alice.id, group.id, { body: '群聊消息', clientMessageId });

    expect(groupMessage.id).not.toBe(directMessage.id);
    expect(groupMessage.conversationId).toBe(group.id);
    const nextMessage = chat.sendMessage(alice.id, group.id, { body: '同毫秒后续消息', clientMessageId: 'shared-client-message-002' });
    expect(Date.parse(nextMessage.createdAt)).toBeGreaterThan(Date.parse(groupMessage.createdAt));
    expect(chat.listMessages(bob.id, direct.id, undefined, 50)).toHaveLength(1);
    expect(chat.listMessages(bob.id, group.id, undefined, 50)).toHaveLength(2);
  });

  it('启动时迁移旧消息幂等唯一约束', () => {
    database.connection.exec(`
      DROP INDEX idx_messages_conversation_time;
      DROP TABLE messages;
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id TEXT NOT NULL REFERENCES users(id),
        client_message_id TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(sender_id, client_message_id)
      );
      CREATE INDEX idx_messages_conversation_time
        ON messages(conversation_id, created_at DESC, id DESC);
    `);
    database.onModuleDestroy();
    database = new ApplicationDatabase();
    const schema = database.connection.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'messages'",
    ).get() as { sql: string };
    expect(schema.sql.replace(/\s+/g, '')).toContain('UNIQUE(conversation_id,sender_id,client_message_id)');
  });

  it('高危操作授权校验密码与短语并且只能消费一次', () => {
    const admin = auth.login('admin', 'Admin12345').user;
    expect(() => auth.createOperationAuthorization(admin.id, {
      currentPassword: 'Wrong1234',
      operation: 'database-restore',
      confirmation: 'RESTORE DATABASE',
    })).toThrow('当前密码错误');
    expect(() => auth.createOperationAuthorization(admin.id, {
      currentPassword: 'Admin12345',
      operation: 'database-restore',
      confirmation: 'restore database',
    })).toThrow('确认短语不匹配');

    const authorization = auth.createOperationAuthorization(admin.id, {
      currentPassword: 'Admin12345',
      operation: 'database-restore',
      confirmation: 'RESTORE DATABASE',
    });
    expect(Date.parse(authorization.expiresAt)).toBeGreaterThan(Date.now());
    expect(auth.consumeOperationAuthorization(admin.id, 'database-restore', authorization.token)).toBe(true);
    expect(auth.consumeOperationAuthorization(admin.id, 'database-restore', authorization.token)).toBe(false);
  });

  it('线上挖除作物要求一次性管理员授权', () => {
    const agriculture = new AgricultureService(database, sync);
    const controller = new AgricultureController(agriculture, auth, database);
    const admin = auth.login('admin', 'Admin12345').user;
    const occurredAt = new Date().toISOString();
    sync.exchange('desktop-seed', 0, [
      { eventId: 'field-seed', collection: 'fields', entityId: 'field-002', payload: { ...agriculture.getFields().find((field) => field.id === 'field-002'), id: 'field-002', farmId: 'farm-002' }, baseRevision: 0, occurredAt },
      { eventId: 'cycle-seed', collection: 'crop_cycles', entityId: 'cycle-001', payload: { id: 'cycle-001', fieldId: 'field-002', status: 'in_progress', updatedAt: occurredAt }, baseRevision: 0, occurredAt },
      { eventId: 'plan-seed', collection: 'production_plans', entityId: 'plan-001', payload: { id: 'plan-001', cycleId: 'cycle-001', fieldId: 'field-002', status: 'planned', completedAt: null, updatedAt: occurredAt }, baseRevision: 0, occurredAt },
    ], 200);
    expect(Reflect.getMetadata(ROLES_KEY, AgricultureController.prototype.uprootField)).toEqual(['admin']);
    expect(() => controller.uprootField('field-002', { reason: '严重病害需要改种' }, admin, ''))
      .toThrow('高危操作授权无效');
    const authorization = auth.createOperationAuthorization(admin.id, {
      currentPassword: 'Admin12345',
      operation: 'uproot-crop',
      confirmation: 'UPROOT CROP',
    });
    expect(() => controller.uprootField('field-002', { reason: '短' }, admin, authorization.token))
      .toThrow('至少 4 个字符');
    expect(controller.uprootField('field-002', { reason: '严重病害需要改种' }, admin, authorization.token))
      .toMatchObject({ id: 'field-002', crop: '', status: 'fallow' });
    expect(new AgricultureService(database).getFields().find((field) => field.id === 'field-002'))
      .toMatchObject({ crop: '', status: 'fallow' });
    const changes = sync.exchange('sync-verifier', 0, [], 200).changes;
    expect(changes.filter((change) => change.entityId === 'field-002').at(-1)?.payload).toMatchObject({ crop: '', status: 'fallow' });
    expect(changes.filter((change) => change.entityId === 'cycle-001').at(-1)?.payload).toMatchObject({ status: 'cancelled' });
    expect(changes.filter((change) => change.entityId === 'plan-001').at(-1)?.payload).toMatchObject({ status: 'cancelled', completedAt: null });
    expect(() => controller.uprootField('field-003', { reason: '轮作调整需要改种' }, admin, authorization.token))
      .toThrow('高危操作授权无效');
  });

  it('线上业务状态在服务重启后完整恢复', () => {
    const agriculture = new AgricultureService(database, sync);
    const task = agriculture.createTask({
      title: '重启恢复测试', fieldId: 'field-001', assignee: '李明', dueDate: '2026-08-10', priority: 'medium', description: '验证任务持久化',
    });
    agriculture.updateTaskStatus(task.id, { status: 'in_progress' });
    agriculture.recordTelemetry('DEV-001', 'agri-terminal-2026', { temperature: 28, humidity: 60, soilMoisture: 55, light: 70000 });
    agriculture.acknowledgeAlert('alert-001');
    const purchase = agriculture.createPurchase({
      inventoryItemId: 'inventory-003', quantity: 2, unitPrice: 100, supplier: '测试供应商', expectedAt: '2026-08-10', buyer: '陈静', notes: '',
    });
    agriculture.receivePurchase(purchase.id, { operator: '陈静' });

    database.onModuleDestroy();
    database = new ApplicationDatabase();
    sync = new SyncDatabase(database);
    const restored = new AgricultureService(database, sync);
    expect(restored.getTasks().find((item) => item.id === task.id)?.status).toBe('in_progress');
    expect(restored.getDevices().find((item) => item.id === 'DEV-001')?.telemetry.soilMoisture).toBe(55);
    expect(restored.getFields().find((item) => item.id === 'field-001')?.soilMoisture).toBe(55);
    expect(restored.getAlerts().find((item) => item.id === 'alert-001')?.acknowledged).toBe(true);
    expect(restored.getPurchases().find((item) => item.id === purchase.id)?.status).toBe('received');
    expect(restored.getInventory().find((item) => item.id === 'inventory-003')?.quantity).toBe(50);
  });

  it('线上挖除写入失败时回滚业务状态和一次性授权', () => {
    const agriculture = new AgricultureService(database, sync);
    const controller = new AgricultureController(agriculture, auth, database);
    const admin = auth.login('admin', 'Admin12345').user;
    const authorization = auth.createOperationAuthorization(admin.id, {
      currentPassword: 'Admin12345', operation: 'uproot-crop', confirmation: 'UPROOT CROP',
    });
    database.connection.exec(`
      CREATE TRIGGER fail_uproot_sync_change
      BEFORE INSERT ON sync_changes
      WHEN NEW.source_client_id = 'cloud-api' AND NEW.entity_id = 'field-002'
      BEGIN SELECT RAISE(ABORT, 'forced sync failure'); END;
    `);
    expect(() => controller.uprootField('field-002', { reason: '验证事务失败回滚' }, admin, authorization.token)).toThrow('forced sync failure');
    expect(agriculture.getFields().find((field) => field.id === 'field-002')).toMatchObject({ crop: '番茄', status: 'attention' });
    expect(new AgricultureService(database, sync).getFields().find((field) => field.id === 'field-002')).toMatchObject({ crop: '番茄', status: 'attention' });
    expect(database.connection.prepare("SELECT COUNT(*) AS count FROM uprooted_fields WHERE field_id = 'field-002'").get()).toMatchObject({ count: 0 });
    expect(database.connection.prepare("SELECT COUNT(*) AS count FROM sync_entities WHERE collection = 'fields' AND entity_id = 'field-002'").get()).toMatchObject({ count: 0 });
    expect(auth.consumeOperationAuthorization(admin.id, 'uproot-crop', authorization.token)).toBe(true);
  });

  it('在线与 Electron 字段双向投影并约束挖除后的晚到事件', () => {
    const agriculture = new AgricultureService(database, sync);
    const occurredAt = new Date().toISOString();
    const electronField = { ...agriculture.getFields()[0], id: 'field-electron', name: 'Electron 新增地块' };
    sync.exchange('electron-client', 0, [
      { eventId: 'electron-field-create', collection: 'fields', entityId: electronField.id, payload: electronField, baseRevision: 0, occurredAt },
    ], 200);
    expect(agriculture.getFields().find((field) => field.id === electronField.id)?.name).toBe('Electron 新增地块');

    const onlineField = agriculture.createField({
      farmId: 'farm-001', name: '在线新增地块', crop: '花生', area: 6, location: '东侧试验区', status: 'healthy',
      plantedAt: '2026-05-01', expectedHarvestAt: '2026-09-01', soilMoisture: 52, manager: '李明',
    });
    expect(sync.exchange('online-create-verifier', 0, [], 200).changes.find((change) => change.entityId === onlineField.id)?.payload)
      .toMatchObject({ id: onlineField.id, farmId: 'farm-001', name: '在线新增地块' });

    agriculture.uprootField('field-003', { reason: '病害清理后安排轮作' });
    const late = sync.exchange('late-electron-client', 0, [
      { eventId: 'late-field', collection: 'fields', entityId: 'field-003', payload: { ...agriculture.getFields().find((field) => field.id === 'field-003'), crop: '玉米', status: 'healthy' }, baseRevision: 1, occurredAt },
      { eventId: 'late-cycle', collection: 'crop_cycles', entityId: 'cycle-late', payload: { id: 'cycle-late', fieldId: 'field-003', status: 'in_progress', updatedAt: occurredAt }, baseRevision: 0, occurredAt },
      { eventId: 'late-plan', collection: 'production_plans', entityId: 'plan-late', payload: { id: 'plan-late', cycleId: 'cycle-late', fieldId: 'field-003', status: 'planned', completedAt: null, updatedAt: occurredAt }, baseRevision: 0, occurredAt },
    ], 200);
    expect(late.results[0].payload).toMatchObject({ crop: '', status: 'fallow' });
    expect(late.results[1].payload).toMatchObject({ status: 'cancelled' });
    expect(late.results[2].payload).toMatchObject({ status: 'cancelled', completedAt: null });
    expect(agriculture.getFields().find((field) => field.id === 'field-003')).toMatchObject({ crop: '', status: 'fallow' });
  });

  it('启动时迁移旧 cloud-sync 数据库并保留服务身份与字段', () => {
    const legacyDirectory = join(directory, 'legacy-cloud');
    mkdirSync(legacyDirectory, { recursive: true });
    const legacy = new DatabaseSync(join(legacyDirectory, 'cloud-sync.db'));
    legacy.exec(`
      CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE sync_entities (collection TEXT NOT NULL, entity_id TEXT NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL, source_client_id TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (collection, entity_id));
      CREATE TABLE sync_changes (cursor INTEGER PRIMARY KEY AUTOINCREMENT, collection TEXT NOT NULL, entity_id TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, source_client_id TEXT NOT NULL, changed_at TEXT NOT NULL);
      CREATE TABLE processed_sync_events (client_id TEXT NOT NULL, event_id TEXT NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (client_id, event_id));
    `);
    const changedAt = new Date().toISOString();
    const field = { id: 'legacy-field', farmId: 'farm-001', name: '旧同步地块', crop: '小麦', area: 4, location: '旧数据区', status: 'healthy', plantedAt: '2026-01-01', expectedHarvestAt: '2026-06-01', soilMoisture: 50, manager: '李明', createdAt: changedAt };
    legacy.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)').run('server_id', 'legacy-server-id');
    legacy.prepare('INSERT INTO sync_entities VALUES (?, ?, ?, ?, ?, ?)').run('fields', field.id, JSON.stringify(field), 1, 'legacy-client', changedAt);
    legacy.prepare('INSERT INTO sync_changes (collection, entity_id, revision, payload, source_client_id, changed_at) VALUES (?, ?, ?, ?, ?, ?)').run('fields', field.id, 1, JSON.stringify(field), 'legacy-client', changedAt);
    legacy.close();

    process.env.AGRI_APP_DATA_DIR = legacyDirectory;
    const migratedDatabase = new ApplicationDatabase();
    try {
      const migratedSync = new SyncDatabase(migratedDatabase);
      const migratedAgriculture = new AgricultureService(migratedDatabase, migratedSync);
      expect(migratedSync.serverId()).toBe('legacy-server-id');
      expect(migratedSync.latestCursor()).toBe(1);
      expect(migratedAgriculture.getFields().find((item) => item.id === field.id)?.name).toBe('旧同步地块');
    } finally {
      migratedDatabase.onModuleDestroy();
      process.env.AGRI_APP_DATA_DIR = directory;
    }
  });

  it('群聊只允许成员读取和发送消息', () => {
    const owner = auth.register({ username: 'group_owner', password: 'Owner1234', name: '群主用户' }).user;
    const member = auth.register({ username: 'group_member', password: 'Member1234', name: '群组成员' }).user;
    const outsider = auth.register({ username: 'group_outside', password: 'Outside1234', name: '外部用户' }).user;
    const group = chat.createGroup(owner.id, '春耕协作组', [member.id]);
    expect(group.members.map((item) => item.id)).toEqual([owner.id, member.id]);
    expect(() => chat.listMessages(outsider.id, group.id, undefined, 50)).toThrow('不是该会话成员');
    expect(() => chat.sendMessage(outsider.id, group.id, { body: '无权限消息', clientMessageId: 'outside-message-001' })).toThrow('不是该会话成员');
    expect(chat.sendMessage(member.id, group.id, { body: '任务已接收', clientMessageId: 'member-message-0001' }).senderId).toBe(member.id);
  });
});
