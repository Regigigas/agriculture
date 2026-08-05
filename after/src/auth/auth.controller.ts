import { Body, Controller, Get, Headers, Patch, Post, Query } from '@nestjs/common';
import { User } from '../types';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';
import { Roles } from './roles.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: unknown): { token: string; user: User } {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    return this.auth.login(input.username, input.password);
  }

  @Public()
  @Post('register')
  register(@Body() body: unknown): { token: string; user: User } {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    return this.auth.register(input);
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
  createUser(@CurrentUser() user: User, @Body() body: unknown): User {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    return this.auth.createUser(user.id, input);
  }

  @Roles('admin')
  @Post('operation-authorizations')
  authorizeOperation(
    @CurrentUser() user: User,
    @Body() body: unknown,
  ): { token: string; expiresAt: string } {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    return this.auth.createOperationAuthorization(user.id, input);
  }

  @Patch('password')
  changePassword(@CurrentUser() user: User, @Body() body: unknown): { changed: true } {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    this.auth.changePassword(user.id, input.currentPassword, input.newPassword);
    return { changed: true };
  }

  @Post('logout')
  logout(@Headers('authorization') authorization = ''): { loggedOut: true } {
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (token) this.auth.revoke(token);
    return { loggedOut: true };
  }
}
