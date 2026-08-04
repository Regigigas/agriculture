import type { LoginResponse } from '@/types'

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

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
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
}
