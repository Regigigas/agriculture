import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { ApplicationDatabase } from '../application-database';
import { User, UserRole } from '../types';

export const OPERATION_CONFIRMATIONS = {
  'local-data-sync': 'LOCAL DATA SYNC',
  'database-restore': 'RESTORE DATABASE',
  'uproot-crop': 'UPROOT CROP',
} as const;

export type ProtectedOperation = keyof typeof OPERATION_CONFIRMATIONS;

interface UserRow {
  id: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  name: string;
  role: UserRole;
}

@Injectable()
export class AuthService {
  constructor(private readonly database: ApplicationDatabase) {
    this.ensureAdministrator();
  }

  login(usernameValue: unknown, passwordValue: unknown): { token: string; user: User } {
    const username = this.normalizeUsername(usernameValue);
    const password = this.normalizePassword(passwordValue, false);
    const row = this.userByUsername(username);
    if (!row || !this.passwordMatches(password, row.passwordSalt, row.passwordHash)) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    return { token: this.createSession(row.id), user: this.publicUser(row) };
  }

  register(input: Record<string, unknown>): { token: string; user: User } {
    if (process.env.ALLOW_PUBLIC_REGISTRATION !== 'true') {
      throw new ForbiddenException('公共注册未开放');
    }
    const user = this.insertUser(input, 'worker');
    return { token: this.createSession(user.id), user };
  }

  createUser(actorUserId: string, input: Record<string, unknown>): User {
    this.requireAdministrator(actorUserId);
    const role = input.role;
    if (role !== 'admin' && role !== 'worker') throw new BadRequestException('角色仅支持 admin 或 worker');
    return this.insertUser(input, role);
  }

  createOperationAuthorization(
    userId: string,
    input: Record<string, unknown>,
  ): { token: string; expiresAt: string } {
    const row = this.requireAdministrator(userId);
    const currentPassword = this.normalizePassword(input.currentPassword, false);
    if (!this.passwordMatches(currentPassword, row.passwordSalt, row.passwordHash)) {
      throw new UnauthorizedException('当前密码错误');
    }
    const operation = input.operation;
    if (!this.isProtectedOperation(operation)) throw new BadRequestException('不支持的高危操作');
    if (input.confirmation !== OPERATION_CONFIRMATIONS[operation]) {
      throw new BadRequestException('确认短语不匹配');
    }
    const token = randomBytes(32).toString('base64url');
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 5 * 60 * 1000);
    this.database.transaction(() => {
      this.database.connection.prepare('DELETE FROM operation_authorizations WHERE expires_at <= ?').run(createdAt.toISOString());
      this.database.connection.prepare(`
        INSERT INTO operation_authorizations (token_hash, user_id, operation, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(this.tokenHash(token), userId, operation, expiresAt.toISOString(), createdAt.toISOString());
    });
    return { token, expiresAt: expiresAt.toISOString() };
  }

  consumeOperationAuthorization(userId: string, operation: ProtectedOperation, token: string): boolean {
    if (!this.isProtectedOperation(operation) || typeof token !== 'string' || !token) return false;
    return this.database.transaction(() => this.database.connection.prepare(`
      DELETE FROM operation_authorizations
      WHERE token_hash = ? AND user_id = ? AND operation = ? AND expires_at > ?
    `).run(this.tokenHash(token), userId, operation, new Date().toISOString()).changes === 1);
  }

  private insertUser(input: Record<string, unknown>, role: UserRole): User {
    const username = this.normalizeUsername(input.username);
    const password = this.normalizePassword(input.password, true);
    const name = this.normalizeName(input.name);
    const id = randomUUID();
    const now = new Date().toISOString();
    const salt = randomBytes(16).toString('base64');
    try {
      this.database.connection.prepare(`
        INSERT INTO users (id, username, password_hash, password_salt, name, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, username, this.hashPassword(password, salt), salt, name, role, now, now);
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) throw new ConflictException('该用户名已被使用');
      throw error;
    }
    return { id, username, name, role };
  }

  authenticate(token: string): User | undefined {
    const serviceToken = process.env.DEMO_TOKEN;
    if (serviceToken && token === serviceToken) return this.administrator();
    return this.database.connection.prepare(`
      SELECT u.id, u.username, u.name, u.role
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).get(this.tokenHash(token), new Date().toISOString()) as User | undefined;
  }

  listUsers(currentUserId: string, queryValue: unknown): User[] {
    const query = typeof queryValue === 'string' ? queryValue.trim().slice(0, 50) : '';
    const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    return this.database.connection.prepare(`
      SELECT id, username, name, role FROM users
      WHERE id <> ? AND (? = '' OR username LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')
      ORDER BY name COLLATE NOCASE ASC LIMIT 100
    `).all(currentUserId, query, pattern, pattern) as unknown as User[];
  }

  changePassword(userId: string, currentPasswordValue: unknown, newPasswordValue: unknown): void {
    const currentPassword = this.normalizePassword(currentPasswordValue, false);
    const newPassword = this.normalizePassword(newPasswordValue, true);
    const row = this.userById(userId);
    if (!row || !this.passwordMatches(currentPassword, row.passwordSalt, row.passwordHash)) {
      throw new UnauthorizedException('当前密码错误');
    }
    const salt = randomBytes(16).toString('base64');
    this.database.transaction(() => {
      this.database.connection.prepare(`
        UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?
      `).run(this.hashPassword(newPassword, salt), salt, new Date().toISOString(), userId);
      this.database.connection.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      this.database.connection.prepare('DELETE FROM operation_authorizations WHERE user_id = ?').run(userId);
    });
  }

  revoke(token: string): void {
    this.database.connection.prepare('DELETE FROM sessions WHERE token_hash = ?').run(this.tokenHash(token));
  }

  private ensureAdministrator(): void {
    if (this.userByUsername('admin')) return;
    const salt = randomBytes(16).toString('base64');
    const now = new Date().toISOString();
    this.database.connection.prepare(`
      INSERT INTO users (id, username, password_hash, password_salt, name, role, created_at, updated_at)
      VALUES ('user-admin', 'admin', ?, ?, '智慧农场管理员', 'admin', ?, ?)
    `).run(this.hashPassword(process.env.ADMIN_PASSWORD ?? 'admin123', salt), salt, now, now);
  }

  private administrator(): User | undefined {
    const row = this.userByUsername('admin');
    return row ? this.publicUser(row) : undefined;
  }

  private requireAdministrator(userId: string): UserRow {
    const row = this.userById(userId);
    if (!row || row.role !== 'admin') throw new ForbiddenException('当前账号无权执行此操作');
    return row;
  }

  private isProtectedOperation(value: unknown): value is ProtectedOperation {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(OPERATION_CONFIRMATIONS, value);
  }

  private createSession(userId: string): string {
    const token = randomBytes(32).toString('base64url');
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    this.database.connection.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(createdAt.toISOString());
    this.database.connection.prepare(`
      INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)
    `).run(this.tokenHash(token), userId, expiresAt.toISOString(), createdAt.toISOString());
    return token;
  }

  private userByUsername(username: string): UserRow | undefined {
    return this.database.connection.prepare(`
      SELECT id, username, password_hash AS passwordHash, password_salt AS passwordSalt, name, role
      FROM users WHERE username = ? COLLATE NOCASE
    `).get(username) as UserRow | undefined;
  }

  private userById(id: string): UserRow | undefined {
    return this.database.connection.prepare(`
      SELECT id, username, password_hash AS passwordHash, password_salt AS passwordSalt, name, role
      FROM users WHERE id = ?
    `).get(id) as UserRow | undefined;
  }

  private publicUser(row: UserRow): User {
    return { id: row.id, username: row.username, name: row.name, role: row.role };
  }

  private normalizeUsername(value: unknown): string {
    const username = typeof value === 'string' ? value.trim() : '';
    if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) throw new BadRequestException('用户名需为 3-32 位字母、数字或下划线');
    return username;
  }

  private normalizePassword(value: unknown, enforceStrength: boolean): string {
    const password = typeof value === 'string' ? value : '';
    if (!password || password.length > 72) throw new BadRequestException('密码无效');
    if (enforceStrength && (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      throw new BadRequestException('密码至少 8 位，且必须同时包含字母和数字');
    }
    return password;
  }

  private normalizeName(value: unknown): string {
    const name = typeof value === 'string' ? value.trim() : '';
    if (name.length < 2 || name.length > 40) throw new BadRequestException('姓名需为 2-40 个字符');
    return name;
  }

  private hashPassword(password: string, salt: string): string {
    return scryptSync(password, Buffer.from(salt, 'base64'), 32).toString('base64');
  }

  private passwordMatches(password: string, salt: string, expected: string): boolean {
    const actual = Buffer.from(this.hashPassword(password, salt), 'base64');
    const stored = Buffer.from(expected, 'base64');
    return actual.length === stored.length && timingSafeEqual(actual, stored);
  }

  private tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
