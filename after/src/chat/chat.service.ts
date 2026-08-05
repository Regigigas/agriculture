import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ApplicationDatabase } from '../application-database';
import { User, UserRole } from '../types';
import { ChatMessage, ConversationSummary } from './chat.types';

interface ConversationRow {
  id: string;
  type: 'private' | 'group';
  title: string;
  updatedAt: string;
  lastReadAt: string;
}

interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  body: string;
  createdAt: string;
  senderUsername: string;
  senderName: string;
  senderRole: UserRole;
}

@Injectable()
export class ChatService {
  constructor(private readonly database: ApplicationDatabase) {}

  listConversations(userId: string): ConversationSummary[] {
    const rows = this.database.connection.prepare(`
      SELECT c.id, c.type, c.title, c.updated_at AS updatedAt, cm.last_read_at AS lastReadAt
      FROM conversation_members cm JOIN conversations c ON c.id = cm.conversation_id
      WHERE cm.user_id = ? ORDER BY c.updated_at DESC
    `).all(userId) as unknown as ConversationRow[];
    return rows.map((row) => this.summary(row, userId));
  }

  createPrivate(userId: string, otherUserIdValue: unknown): ConversationSummary {
    const otherUserId = this.validId(otherUserIdValue, '联系人');
    if (userId === otherUserId) throw new BadRequestException('不能与自己创建私聊');
    this.requireUser(otherUserId);
    const directKey = [userId, otherUserId].sort().join(':');
    const existing = this.database.connection.prepare('SELECT id FROM conversations WHERE direct_key = ?')
      .get(directKey) as { id: string } | undefined;
    const id = existing?.id ?? randomUUID();
    if (!existing) {
      const now = new Date().toISOString();
      this.database.transaction(() => {
        this.database.connection.prepare(`
          INSERT INTO conversations (id, type, title, direct_key, created_by, created_at, updated_at)
          VALUES (?, 'private', '', ?, ?, ?, ?)
        `).run(id, directKey, userId, now, now);
        const addMember = this.database.connection.prepare(`
          INSERT INTO conversation_members (conversation_id, user_id, member_role, joined_at, last_read_at)
          VALUES (?, ?, 'member', ?, ?)
        `);
        addMember.run(id, userId, now, now);
        addMember.run(id, otherUserId, now, now);
      });
    }
    return this.conversationById(id, userId);
  }

  createGroup(userId: string, titleValue: unknown, memberIdsValue: unknown): ConversationSummary {
    const title = typeof titleValue === 'string' ? titleValue.trim() : '';
    if (title.length < 2 || title.length > 60) throw new BadRequestException('群聊名称需为 2-60 个字符');
    if (!Array.isArray(memberIdsValue)) throw new BadRequestException('请选择群聊成员');
    const memberIds = [...new Set(memberIdsValue.filter((value): value is string => typeof value === 'string'))]
      .filter((id) => id !== userId);
    if (!memberIds.length || memberIds.length > 49) throw new BadRequestException('群聊需选择 1-49 位成员');
    memberIds.forEach((id) => this.requireUser(id));
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.transaction(() => {
      this.database.connection.prepare(`
        INSERT INTO conversations (id, type, title, direct_key, created_by, created_at, updated_at)
        VALUES (?, 'group', ?, NULL, ?, ?, ?)
      `).run(id, title, userId, now, now);
      const addMember = this.database.connection.prepare(`
        INSERT INTO conversation_members (conversation_id, user_id, member_role, joined_at, last_read_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      addMember.run(id, userId, 'owner', now, now);
      memberIds.forEach((memberId) => addMember.run(id, memberId, 'member', now, now));
    });
    return this.conversationById(id, userId);
  }

  listMessages(userId: string, conversationId: string, beforeValue: unknown, limitValue: unknown): ChatMessage[] {
    this.requireMembership(conversationId, userId);
    const beforeParts = typeof beforeValue === 'string' ? beforeValue.split('|', 2) : [];
    const before = beforeParts[0] && Number.isFinite(Date.parse(beforeParts[0]))
      ? beforeParts[0] : '9999-12-31T23:59:59.999Z';
    const beforeId = beforeParts.length === 2 && /^[A-Za-z0-9-]{8,100}$/.test(beforeParts[1])
      ? beforeParts[1] : '';
    const requestedLimit = Number(limitValue);
    const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 50;
    const rows = this.database.connection.prepare(`
      SELECT m.id, m.conversation_id AS conversationId, m.sender_id AS senderId,
             m.client_message_id AS clientMessageId, m.body, m.created_at AS createdAt,
             u.username AS senderUsername, u.name AS senderName, u.role AS senderRole
      FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ?
         AND (m.created_at < ? OR (? <> '' AND m.created_at = ? AND m.id < ?))
       ORDER BY m.created_at DESC, m.id DESC LIMIT ?
    `).all(conversationId, before, beforeId, before, beforeId, limit) as unknown as MessageRow[];
    return rows.reverse().map((row) => this.message(row));
  }

  sendMessage(userId: string, conversationId: string, input: Record<string, unknown>): ChatMessage {
    this.requireMembership(conversationId, userId);
    const body = typeof input.body === 'string' ? input.body.trim() : '';
    const clientMessageId = typeof input.clientMessageId === 'string' ? input.clientMessageId.trim() : '';
    if (!body || body.length > 4000) throw new BadRequestException('消息内容需为 1-4000 个字符');
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(clientMessageId)) throw new BadRequestException('消息请求标识无效');
    const existing = this.messageByClientId(conversationId, userId, clientMessageId);
    if (existing) return existing;
    const id = randomUUID();
    const createdAt = this.nextMessageTimestamp(conversationId);
    this.database.transaction(() => {
      this.database.connection.prepare(`
        INSERT INTO messages (id, conversation_id, sender_id, client_message_id, body, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, conversationId, userId, clientMessageId, body, createdAt);
      this.database.connection.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(createdAt, conversationId);
      this.database.connection.prepare(`
        UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?
      `).run(createdAt, conversationId, userId);
    });
    return this.messageById(id);
  }

  markRead(userId: string, conversationId: string): void {
    this.requireMembership(conversationId, userId);
    const last = this.database.connection.prepare(`
      SELECT created_at AS createdAt FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 1
    `).get(conversationId) as { createdAt: string } | undefined;
    this.database.connection.prepare(`
      UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?
    `).run(last?.createdAt ?? new Date().toISOString(), conversationId, userId);
  }

  private conversationById(id: string, userId: string): ConversationSummary {
    const row = this.database.connection.prepare(`
      SELECT c.id, c.type, c.title, c.updated_at AS updatedAt, cm.last_read_at AS lastReadAt
      FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id
      WHERE c.id = ? AND cm.user_id = ?
    `).get(id, userId) as ConversationRow | undefined;
    if (!row) throw new NotFoundException('会话不存在');
    return this.summary(row, userId);
  }

  private summary(row: ConversationRow, userId: string): ConversationSummary {
    const members = this.members(row.id);
    const lastRow = this.database.connection.prepare(`
      SELECT m.id, m.conversation_id AS conversationId, m.sender_id AS senderId,
             m.client_message_id AS clientMessageId, m.body, m.created_at AS createdAt,
             u.username AS senderUsername, u.name AS senderName, u.role AS senderRole
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT 1
    `).get(row.id) as MessageRow | undefined;
    const unread = this.database.connection.prepare(`
      SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ? AND sender_id <> ? AND created_at > ?
    `).get(row.id, userId, row.lastReadAt) as { count: number };
    const privatePeer = row.type === 'private' ? members.find((member) => member.id !== userId) : undefined;
    return {
      id: row.id,
      type: row.type,
      title: row.type === 'private' ? privatePeer?.name || privatePeer?.username || '私聊' : row.title,
      members,
      lastMessage: lastRow ? this.message(lastRow) : null,
      unreadCount: unread.count,
      updatedAt: row.updatedAt,
    };
  }

  private members(conversationId: string): User[] {
    return this.database.connection.prepare(`
      SELECT u.id, u.username, u.name, u.role FROM conversation_members cm
      JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = ?
      ORDER BY CASE cm.member_role WHEN 'owner' THEN 0 ELSE 1 END, cm.joined_at ASC, u.name COLLATE NOCASE ASC
    `).all(conversationId) as unknown as User[];
  }

  private messageById(id: string): ChatMessage {
    const row = this.database.connection.prepare(`
      SELECT m.id, m.conversation_id AS conversationId, m.sender_id AS senderId,
             m.client_message_id AS clientMessageId, m.body, m.created_at AS createdAt,
             u.username AS senderUsername, u.name AS senderName, u.role AS senderRole
      FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?
    `).get(id) as MessageRow | undefined;
    if (!row) throw new NotFoundException('消息不存在');
    return this.message(row);
  }

  private messageByClientId(conversationId: string, userId: string, clientMessageId: string): ChatMessage | undefined {
    const row = this.database.connection.prepare(`
      SELECT m.id, m.conversation_id AS conversationId, m.sender_id AS senderId,
             m.client_message_id AS clientMessageId, m.body, m.created_at AS createdAt,
             u.username AS senderUsername, u.name AS senderName, u.role AS senderRole
      FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ? AND m.sender_id = ? AND m.client_message_id = ?
    `).get(conversationId, userId, clientMessageId) as MessageRow | undefined;
    return row ? this.message(row) : undefined;
  }

  private message(row: MessageRow): ChatMessage {
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      clientMessageId: row.clientMessageId,
      body: row.body,
      createdAt: row.createdAt,
      sender: { id: row.senderId, username: row.senderUsername, name: row.senderName, role: row.senderRole },
    };
  }

  private nextMessageTimestamp(conversationId: string): string {
    const latest = this.database.connection.prepare(`
      SELECT MAX(value) AS value FROM (
        SELECT MAX(created_at) AS value FROM messages WHERE conversation_id = ?
        UNION ALL
        SELECT MAX(last_read_at) AS value FROM conversation_members WHERE conversation_id = ?
      )
    `).get(conversationId, conversationId) as { value: string | null };
    const previous = latest.value ? Date.parse(latest.value) : 0;
    return new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString();
  }

  private requireMembership(conversationId: string, userId: string): void {
    if (!this.database.connection.prepare(`
      SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?
    `).get(conversationId, userId)) throw new ForbiddenException('你不是该会话成员');
  }

  private requireUser(userId: string): void {
    if (!this.database.connection.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) {
      throw new NotFoundException('所选用户不存在');
    }
  }

  private validId(value: unknown, label: string): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9-]{8,100}$/.test(value)) {
      throw new BadRequestException(`${label}标识无效`);
    }
    return value;
  }
}
