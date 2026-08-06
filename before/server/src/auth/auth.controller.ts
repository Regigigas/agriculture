import { Body, Controller, Get, Headers, Patch, Post, Query } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LocalDatabase } from '../local-database';
import { User } from '../types';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';
import { Roles } from './roles.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly database: LocalDatabase) {}

  @Public()
  @Post('login')
  login(@Body() body: unknown): { token: string; user: User; serverId: string } {
    const input = this.input(body);
    return {
      ...this.auth.login(input.username, input.password),
      serverId: this.database.getOrCreateMetadata('server_id', () => randomUUID()),
    };
  }

  @Public()
  @Post('register')
  register(@Body() body: unknown): { token: string; user: User } {
    return this.auth.register(this.input(body));
  }

  @Get('me')
  me(@CurrentUser() user: User): User {
    return user;
  }

  @Get('users')
  users(@CurrentUser() user: User, @Query('q') query?: string): User[] {
    return this.auth.listUsers(user.id, query);
  }

  @Roles('admin')
  @Post('users')
  createUser(@Body() body: unknown): User {
    return this.auth.createUser(this.input(body));
  }

  @Patch('password')
  changePassword(@CurrentUser() user: User, @Body() body: unknown): { changed: true } {
    const input = this.input(body);
    this.auth.changePassword(user.id, input.currentPassword, input.newPassword);
    return { changed: true };
  }

  @Roles('admin')
  @Post('operation-authorizations')
  authorizeOperation(
    @CurrentUser() user: User,
    @Body() body: unknown,
  ): { token: string; operation: string; expiresAt: string } {
    const input = this.input(body);
    return this.auth.createOperationAuthorization(user, input.currentPassword, input.operation, input.confirmation);
  }

  @Post('logout')
  logout(@Headers('authorization') authorization = ''): { loggedOut: true } {
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (token) this.auth.revoke(token);
    return { loggedOut: true };
  }

  private input(body: unknown): Record<string, unknown> {
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
  }
}
