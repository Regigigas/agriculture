import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../types';
import { ChatService } from './chat.service';
import { ChatMessage, ConversationSummary } from './chat.types';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversations')
  conversations(@CurrentUser() user: User): ConversationSummary[] {
    return this.chat.listConversations(user.id);
  }

  @Post('conversations/private')
  createPrivate(@CurrentUser() user: User, @Body() body: unknown): ConversationSummary {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    return this.chat.createPrivate(user.id, input.userId);
  }

  @Post('conversations/group')
  createGroup(@CurrentUser() user: User, @Body() body: unknown): ConversationSummary {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    return this.chat.createGroup(user.id, input.title, input.memberIds);
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ): ChatMessage[] {
    return this.chat.listMessages(user.id, id, before, limit);
  }

  @Post('conversations/:id/messages')
  send(@CurrentUser() user: User, @Param('id') id: string, @Body() body: unknown): ChatMessage {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    return this.chat.sendMessage(user.id, id, input);
  }

  @Patch('conversations/:id/read')
  read(@CurrentUser() user: User, @Param('id') id: string): { read: true } {
    this.chat.markRead(user.id, id);
    return { read: true };
  }
}
