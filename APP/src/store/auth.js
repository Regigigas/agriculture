import { defineStore } from 'pinia'
import { login } from '../api/auth'
import { useFarmStore } from './farm'
import { resetUnauthorizedState, TOKEN_KEY } from '../utils/request'

const USER_KEY = 'agriculture_user'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: '',
    user: null,
    loggingIn: false
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token)
  },
  actions: {
    restoreSession() {
      this.token = uni.getStorageSync(TOKEN_KEY) || ''
      this.user = uni.getStorageSync(USER_KEY) || null
    },
    async signIn(credentials) {
      this.loggingIn = true
      try {
        const result = await login(credentials)
        const payload = result?.data || result

        if (!payload?.token) throw new Error('登录响应缺少 token')

        this.token = payload.token
        this.user = payload.user || null
        uni.setStorageSync(TOKEN_KEY, this.token)
        uni.setStorageSync(USER_KEY, this.user)
        resetUnauthorizedState()
      } finally {
        this.loggingIn = false
      }
    },
    clearSession() {
      this.token = ''
      this.user = null
      uni.removeStorageSync(TOKEN_KEY)
      uni.removeStorageSync(USER_KEY)
      useFarmStore().$reset()
    },
    expireSession() {
      this.clearSession()
      uni.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
    },
    signOut() {
      this.clearSession()
      uni.reLaunch({ url: '/pages/login/index' })
    }
  }
})
