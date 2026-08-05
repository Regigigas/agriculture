import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ForbiddenException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationDatabase } from '../src/application-database';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { ROLES_KEY } from '../src/auth/roles.decorator';
import { ChatService } from '../src/chat/chat.service';
import { SyncController } from '../src/sync.controller';

describe('账号与聊天持久化', () => {
  let directory: string;
  let database: ApplicationDatabase;
  let auth: AuthService;
  let chat: ChatService;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'agriculture-auth-chat-'));
    process.env.AGRI_APP_DATA_DIR = directory;
    process.env.ADMIN_PASSWORD = 'Admin12345';
    process.env.ALLOW_PUBLIC_REGISTRATION = 'true';
    delete process.env.DEMO_TOKEN;
    database = new ApplicationDatabase();
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
