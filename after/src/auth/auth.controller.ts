import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { Public } from './public.decorator';
import { User } from '../types';

@Controller('auth')
export class AuthController {
  @Public()
  @Post('login')
  login(@Body() body: unknown): { token: string; user: User } {
    if (!body || typeof body !== 'object') {
      throw new HttpException('请求体必须是 JSON 对象', HttpStatus.BAD_REQUEST);
    }
    const { username, password } = body as Record<string, unknown>;
    if (username !== 'admin' || password !== 'admin123') {
      throw new HttpException('用户名或密码错误', HttpStatus.UNAUTHORIZED);
    }

    return {
      token: process.env.DEMO_TOKEN ?? 'agri-demo-token',
      user: { id: 'user-admin', username: 'admin', name: '智慧农场管理员', role: 'admin' },
    };
  }
}
