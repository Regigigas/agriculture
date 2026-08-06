import type { User } from '@/types'

export type ChatServiceMode = 'local' | 'cloud'

export interface ChatServiceConfig {
  mode: ChatServiceMode
  baseUrl: string
}

const CONFIG_KEY = 'agriculture_desktop_chat_service'
const CLOUD_TOKEN_KEY = 'agriculture_desktop_cloud_chat_token'
const CLOUD_USER_KEY = 'agriculture_desktop_cloud_chat_user'

export function localChatBaseUrl() {
  return normalizeApiBaseUrl(
    window.agricultureDesktop?.apiBaseUrl || import.meta.env.VITE_API_BASE_URL || 'http://localhost:3100/api',
    true,
  )
}

export function normalizeApiBaseUrl(value: string, allowNetworkHttp = false) {
  const text = String(value || '').trim()
  if (!text) throw new Error('请输入线上聊天服务地址')
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    throw new Error('聊天服务地址格式不正确')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('聊天服务地址仅支持 HTTP 或 HTTPS')
  if (parsed.protocol === 'http:' && !allowNetworkHttp && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
    throw new Error('线上聊天必须使用 HTTPS；HTTP 仅允许本机调试地址')
  }
  if (parsed.username || parsed.password) throw new Error('聊天服务地址不能包含账号或密码')
  if (parsed.search || parsed.hash) throw new Error('聊天服务地址不能包含查询参数或锚点')
  parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  return parsed.toString().replace(/\/$/, '')
}

export function getChatServiceConfig(): ChatServiceConfig {
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null') as Partial<ChatServiceConfig> | null
    if (stored?.mode === 'cloud') return { mode: 'cloud', baseUrl: normalizeApiBaseUrl(stored.baseUrl || '') }
  } catch {
    // Invalid configuration falls back to the local Electron service.
  }
  return { mode: 'local', baseUrl: localChatBaseUrl() }
}

export function saveChatServiceConfig(input: ChatServiceConfig): ChatServiceConfig {
  const config: ChatServiceConfig = input.mode === 'cloud'
    ? { mode: 'cloud', baseUrl: normalizeApiBaseUrl(input.baseUrl) }
    : { mode: 'local', baseUrl: localChatBaseUrl() }
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  return config
}

export function getChatAccessToken(config = getChatServiceConfig()) {
  return config.mode === 'local'
    ? localStorage.getItem('farm_admin_token') || ''
    : localStorage.getItem(CLOUD_TOKEN_KEY) || ''
}

export function getCloudChatUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(CLOUD_USER_KEY) || 'null') as User | null
  } catch {
    return null
  }
}

export function saveCloudChatSession(token: string, user: User) {
  localStorage.setItem(CLOUD_TOKEN_KEY, token)
  localStorage.setItem(CLOUD_USER_KEY, JSON.stringify(user))
}

export function clearCloudChatSession() {
  localStorage.removeItem(CLOUD_TOKEN_KEY)
  localStorage.removeItem(CLOUD_USER_KEY)
}
