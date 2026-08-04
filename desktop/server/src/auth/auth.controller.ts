import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { Public } from './public.decorator';
import { User } from '../types';
import { LocalDatabase } from '../local-database';
import { randomUUID } from 'crypto';

@Controller('auth')
export class AuthController {
  constructor(private readonly database: LocalDatabase) {}

  @Public()
  @Post('login')
  login(@Body() body: unknown): { token: string; user: User; serverId: string } {
    if (!body || typeof body !== 'object') {
      throw new HttpException('请求体必须是 JSON 对象', HttpStatus.BAD_REQUEST);
    }
    const { username, password } = body as Record<string, unknown>;
    if (username !== 'admin' || password !== (process.env.ADMIN_PASSWORD ?? 'admin123')) {
      throw new HttpException('用户名或密码错误', HttpStatus.UNAUTHORIZED);
    }

    return {
      token: process.env.DEMO_TOKEN ?? 'agri-demo-token',
      user: { id: 'user-admin', username: 'admin', name: '智慧农场管理员', role: 'admin' },
      serverId: this.database.getOrCreateMetadata('server_id', () => randomUUID()),
    };
  }
}
