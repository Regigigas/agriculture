import { User } from '../types';

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  body: string;
  createdAt: string;
  sender: User;
}

export interface ConversationSummary {
  id: string;
  type: 'private' | 'group';
  title: string;
  members: User[];
  lastMessage: ChatMessage | null;
  unreadCount: number;
  updatedAt: string;
}
