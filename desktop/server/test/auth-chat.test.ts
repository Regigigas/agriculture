import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mkdtempSync, rmSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthGuard } from '../src/auth/auth.guard';
import { AuthService } from '../src/auth/auth.service';
import { ChatService } from '../src/chat/chat.service';
import { LocalDatabase } from '../src/local-database';
import { SystemController } from '../src/system.controller';
import { SyncController } from '../src/sync.controller';
import { ROLES_KEY } from '../src/auth/roles.decorator';

describe('本地账号、权限与聊天', () => {
  let directory: string;
  let database: LocalDatabase;
  let auth: AuthService;
  let chat: ChatService;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'agriculture-auth-chat-'));
    process.env.AGRI_DATA_DIR = directory;
    process.env.ADMIN_PASSWORD = 'Admin12345';
    process.env.DEMO_TOKEN = 'electron-installation-token';
    process.env.ALLOW_PUBLIC_REGISTRATION = 'true';
    database = new LocalDatabase();
    auth = new AuthService(database);
    chat = new ChatService(database);
  });

  afterEach(() => {
    database.onModuleDestroy();
    rmSync(directory, { recursive: true, force: true });
    delete process.env.AGRI_DATA_DIR;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.DEMO_TOKEN;
    delete process.env.ALLOW_PUBLIC_REGISTRATION;
  });

  it('默认关闭公开注册并支持管理员创建用户和会话登录', () => {
    delete process.env.ALLOW_PUBLIC_REGISTRATION;
    expect(() => auth.register({ username: 'public_user', password: 'Public123', name: '公开用户' }))
      .toThrow('公开注册未启用');

    const user = auth.createUser({ username: 'field_user', password: 'Field1234', name: '巡田人员' });
    const session = auth.login('field_user', 'Field1234');
    expect(session.user).toEqual(user);
    expect(auth.authenticate(session.token)).toEqual(user);
    const stored = database.connection.prepare('SELECT password_hash AS passwordHash FROM users WHERE id = ?')
      .get(user.id) as { passwordHash: string };
    expect(stored.passwordHash).not.toContain('Field1234');
  });

  it('将 DEMO_TOKEN 映射到管理员但高危授权仍校验当前密码且只能消费一次', () => {
    const admin = auth.authenticate('electron-installation-token');
    expect(admin).toMatchObject({ id: 'user-admin', role: 'admin' });
    expect(() => auth.createOperationAuthorization(
      admin!, 'wrong-password', 'local-data-sync', 'LOCAL DATA SYNC',
    )).toThrow('当前密码错误');

    const authorization = auth.createOperationAuthorization(
      admin!, 'Admin12345', 'local-data-sync', 'LOCAL DATA SYNC',
    );
    const stored = database.connection.prepare('SELECT token_hash AS tokenHash FROM operation_authorizations').get() as {
      tokenHash: string;
    };
    expect(stored.tokenHash).not.toBe(authorization.token);
    auth.consumeOperationAuthorization(admin!.id, 'local-data-sync', authorization.token);
    expect(() => auth.consumeOperationAuthorization(admin!.id, 'local-data-sync', authorization.token))
      .toThrow('已使用');
  });

  it('通过 AuthGuard 拒绝普通用户调用管理员创建账号接口', () => {
    const worker = auth.register({ username: 'guard_user', password: 'Guard1234', name: '普通用户' });
    const request = { headers: { authorization: `Bearer ${worker.token}` } };
    const context = {
      getHandler: () => AuthController.prototype.createUser,
      getClass: () => AuthController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    expect(() => new AuthGuard(new Reflector(), auth).canActivate(context)).toThrow('无权执行');
    expect(Reflect.getMetadata(ROLES_KEY, SyncController)).toEqual(['admin']);
    expect(Reflect.getMetadata(ROLES_KEY, SystemController.prototype.backups)).toEqual(['admin']);
    expect(Reflect.getMetadata(ROLES_KEY, SystemController.prototype.createBackup)).toEqual(['admin']);
  });

  it('复用唯一私聊并支持成员权限、最近消息和已读', () => {
    const alice = auth.register({ username: 'alice_user', password: 'Alice1234', name: '甲巡田员' }).user;
    const bob = auth.register({ username: 'bob_user', password: 'Bobpass123', name: '乙巡田员' }).user;
    const outsider = auth.register({ username: 'outside_user', password: 'Outside123', name: '外部用户' }).user;
    const conversation = chat.createPrivate(alice.id, bob.id);
    expect(chat.createPrivate(bob.id, alice.id).id).toBe(conversation.id);
    expect(() => chat.listMessages(outsider.id, conversation.id, undefined, 50)).toThrow('不是该会话成员');

    const sent = chat.sendMessage(alice.id, conversation.id, {
      body: '东区墒情偏低', clientMessageId: 'message-client-0001',
    });
    expect(chat.sendMessage(alice.id, conversation.id, {
      body: '重试内容不覆盖', clientMessageId: 'message-client-0001',
    }).id).toBe(sent.id);
    expect(chat.listConversations(bob.id)[0]).toMatchObject({ unreadCount: 1, lastMessage: { id: sent.id } });
    chat.markRead(bob.id, conversation.id);
    expect(chat.listConversations(bob.id)[0].unreadCount).toBe(0);
  });

  it('消息幂等键限定在会话和发送者内', () => {
    const owner = auth.register({ username: 'group_owner', password: 'Owner1234', name: '群主用户' }).user;
    const member = auth.register({ username: 'group_member', password: 'Member1234', name: '群组成员' }).user;
    const first = chat.createGroup(owner.id, '第一协作组', [member.id]);
    const second = chat.createGroup(owner.id, '第二协作组', [member.id]);
    const firstMessage = chat.sendMessage(owner.id, first.id, { body: '第一组消息', clientMessageId: 'shared-client-id' });
    const secondMessage = chat.sendMessage(owner.id, second.id, { body: '第二组消息', clientMessageId: 'shared-client-id' });
    expect(secondMessage.id).not.toBe(firstMessage.id);
    expect(secondMessage.conversationId).toBe(second.id);
    const next = chat.sendMessage(owner.id, second.id, { body: '同毫秒后续消息', clientMessageId: 'shared-client-next' });
    expect(Date.parse(next.createdAt)).toBeGreaterThan(Date.parse(secondMessage.createdAt));
  });

  it('本地同步在读取文件前拒绝缺少操作授权令牌', () => {
    const controller = new SystemController(
      database,
      { reloadFromDatabase: () => undefined } as never,
      { reloadFromDatabase: () => undefined } as never,
      auth,
    );
    const admin = auth.authenticate('electron-installation-token')!;
    expect(() => controller.localSync(
      { importId: '12345678-1234-4123-8123-123456789abc', sourceName: 'test.db' }, admin, '',
    )).toThrow('缺少高危操作授权');
  });

  it('账号和聊天表随 agriculture.db 备份', () => {
    const user = auth.createUser({ username: 'backup_user', password: 'Backup123', name: '备份用户' });
    const conversation = chat.createPrivate('user-admin', user.id);
    chat.sendMessage('user-admin', conversation.id, { body: '备份消息', clientMessageId: 'backup-message-001' });
    const snapshot = database.createBackup();
    const backup = new DatabaseSync(snapshot.path, { readOnly: true });
    try {
      expect(backup.prepare('SELECT username FROM users WHERE id = ?').get(user.id)).toEqual({ username: 'backup_user' });
      expect(backup.prepare('SELECT body FROM messages').get()).toEqual({ body: '备份消息' });
    } finally {
      backup.close();
    }
  });
});
