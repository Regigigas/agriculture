import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi } from '@/api/client'
import type { User } from '@/types'

const TOKEN_KEY = 'farm_admin_token'
const USER_KEY = 'farm_admin_user'

function storedUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null') as User | null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '')
  const user = ref<User | null>(storedUser())
  const loading = ref(false)
  const error = ref('')
  const isAuthenticated = computed(() => Boolean(token.value))

  async function login(username: string, password: string) {
    loading.value = true
    error.value = ''
    try {
      const result = await authApi.login(username, password)
      if (!result.token) throw new Error('登录响应中缺少访问令牌')
      token.value = result.token
      user.value = result.user || { username, name: username === 'admin' ? '系统管理员' : username }
      localStorage.setItem(TOKEN_KEY, token.value)
      localStorage.setItem(USER_KEY, JSON.stringify(user.value))
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '登录失败'
      throw cause
    } finally {
      loading.value = false
    }
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  return { token, user, loading, error, isAuthenticated, login, logout }
})
