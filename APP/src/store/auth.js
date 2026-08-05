import { defineStore } from 'pinia'
import { changePassword, createUser, login, logout, register } from '../api/auth'
import { useFarmStore } from './farm'
import { useChatStore } from './chat'
import { invalidatePendingRequests, resetUnauthorizedState, TOKEN_KEY } from '../utils/request'

const USER_KEY = 'agriculture_user'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: '',
    user: null,
    loggingIn: false,
    registering: false,
    addingUser: false,
    changingPassword: false
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

        this.saveSession(payload)
      } finally {
        this.loggingIn = false
      }
    },
    async signUp(account) {
      this.registering = true
      try {
        const result = await register(account)
        const payload = result?.data || result
        if (!payload?.token) throw new Error('注册响应缺少 token')
        this.saveSession(payload)
      } finally {
        this.registering = false
      }
    },
    async addUser(account) {
      if (String(this.user?.role || '').toLowerCase() !== 'admin') throw new Error('仅管理员可添加账号')
      this.addingUser = true
      try {
        return await createUser(account)
      } finally {
        this.addingUser = false
      }
    },
    saveSession(payload) {
      this.token = payload.token
      this.user = payload.user || null
      uni.setStorageSync(TOKEN_KEY, this.token)
      uni.setStorageSync(USER_KEY, this.user)
      resetUnauthorizedState()
    },
    async updatePassword(passwords) {
      this.changingPassword = true
      try {
        await changePassword(passwords)
        this.clearSession()
      } finally {
        this.changingPassword = false
      }
    },
    clearSession() {
      invalidatePendingRequests()
      this.token = ''
      this.user = null
      uni.removeStorageSync(TOKEN_KEY)
      uni.removeStorageSync(USER_KEY)
      useFarmStore().$reset()
      useChatStore().$reset()
    },
    expireSession() {
      this.clearSession()
      uni.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
    },
    async signOut() {
      const logoutRequest = logout()
      this.clearSession()
      uni.reLaunch({ url: '/pages/login/index' })
      await logoutRequest.catch(() => undefined)
    }
  }
})
