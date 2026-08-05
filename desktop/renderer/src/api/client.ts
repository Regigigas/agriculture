import type { ChatConversation, ChatMessage, CreateGroupConversationInput, CreateUserInput, LoginResponse, OperationAuthorization, User } from '@/types'

const API_BASE_URL = (
  window.agricultureDesktop?.apiBaseUrl ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:3100/api'
).replace(/\/$/, '')

interface ApiEnvelope<T> {
  data?: T
  message?: string
  error?: string
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

interface RequestOptions extends RequestInit {
  skipAuthRedirect?: boolean
}

let requestGeneration = 0

export function invalidatePendingRequests() {
  requestGeneration += 1
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const generation = requestGeneration
  const { skipAuthRedirect = false, ...fetchOptions } = options
  const token = localStorage.getItem('farm_admin_token')
  const headers = new Headers(fetchOptions.headers)
  headers.set('Accept', 'application/json')
  if (options.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...fetchOptions, headers })
  } catch {
    throw new ApiError('无法连接服务器，请检查 API 服务是否运行', 0)
  }
  if (generation !== requestGeneration) throw new ApiError('会话已切换，请重新操作', 0)

  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T> | T
  if (!response.ok) {
    const envelope = payload as ApiEnvelope<T>
    if (response.status === 401 && !skipAuthRedirect) {
      localStorage.removeItem('farm_admin_token')
      localStorage.removeItem('farm_admin_user')
      window.dispatchEvent(new Event('agriculture-auth-expired'))
    }
    throw new ApiError(envelope.message || envelope.error || `请求失败 (${response.status})`, response.status)
  }
  if (payload && typeof payload === 'object' && 'data' in payload && (payload as ApiEnvelope<T>).data !== undefined) {
    return (payload as ApiEnvelope<T>).data as T
  }
  return payload as T
}

export const authApi = {
  login: (username: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      skipAuthRedirect: true,
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST', skipAuthRedirect: true }),
  listUsers: (query = '') => request<User[]>(`/auth/users${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  createUser: (input: CreateUserInput) => request<User>('/auth/users', {
    method: 'POST',
    body: JSON.stringify(input),
  }),
  authorizeOperation: (input: { currentPassword: string; operation: string; confirmation: string }) =>
    request<OperationAuthorization>('/auth/operation-authorizations', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
}

export const chatApi = {
  listConversations: () => request<ChatConversation[]>('/chat/conversations'),
  createPrivateConversation: (userId: string | number) => request<ChatConversation>('/chat/conversations/private', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  }),
  createGroupConversation: (input: CreateGroupConversationInput) => request<ChatConversation>('/chat/conversations/group', {
    method: 'POST',
    body: JSON.stringify(input),
  }),
  listMessages: (conversationId: string | number, before = '', limit = 100) => request<ChatMessage[]>(
    `/chat/conversations/${encodeURIComponent(String(conversationId))}/messages?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`,
  ),
  sendMessage: (conversationId: string | number, body: string, clientMessageId: string) => request<ChatMessage>(`/chat/conversations/${encodeURIComponent(String(conversationId))}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body, clientMessageId }),
  }),
  markRead: (conversationId: string | number) => request<void>(`/chat/conversations/${encodeURIComponent(String(conversationId))}/read`, { method: 'PATCH' }),
}
