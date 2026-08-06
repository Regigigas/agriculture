import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { chatApi, chatAuthApi, invalidatePendingRequests } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { ChatConversation, ChatMessage, CreateGroupConversationInput, CreateUserInput, User } from '@/types'
import {
  clearCloudChatSession,
  getChatAccessToken,
  getChatServiceConfig,
  getCloudChatUser,
  saveChatServiceConfig,
  saveCloudChatSession,
  type ChatServiceConfig,
} from '@/chat-service'

const MESSAGE_POLL_INTERVAL = 3000
const CONVERSATION_POLL_INTERVAL = 8000

export const useChatStore = defineStore('chat', () => {
  const auth = useAuthStore()
  const users = ref<User[]>([])
  const conversations = ref<ChatConversation[]>([])
  const activeConversationId = ref<string | number | null>(null)
  const messages = ref<ChatMessage[]>([])
  const loading = ref(false)
  const messagesLoading = ref(false)
  const olderMessagesLoading = ref(false)
  const hasOlderMessages = ref(false)
  const error = ref('')
  const serviceConfig = ref(getChatServiceConfig())
  const cloudUser = ref<User | null>(getCloudChatUser())
  const cloudToken = ref(serviceConfig.value.mode === 'cloud' ? getChatAccessToken(serviceConfig.value) : '')
  const serviceLoginLoading = ref(false)
  let messageTimer: ReturnType<typeof setInterval> | undefined
  let conversationTimer: ReturnType<typeof setInterval> | undefined
  let conversationsPending = false
  let messagesPending = false
  let serviceEpoch = 0

  const activeConversation = computed(() => conversations.value.find((item) => String(item.id) === String(activeConversationId.value)) || null)
  const currentUser = computed(() => serviceConfig.value.mode === 'local' ? auth.user : cloudUser.value)
  const serviceAuthenticated = computed(() => serviceConfig.value.mode === 'local'
    ? auth.isAuthenticated
    : Boolean(cloudToken.value && cloudUser.value))

  async function loadUsers(query = '') {
    const epoch = serviceEpoch
    const received = await chatAuthApi.listUsers(query)
    if (epoch === serviceEpoch) users.value = received
  }

  async function loadConversations(silent = false) {
    const epoch = serviceEpoch
    if (conversationsPending) return
    conversationsPending = true
    if (!silent) loading.value = true
    try {
      const received = await chatApi.listConversations()
      if (epoch !== serviceEpoch) return
      conversations.value = received
      if (activeConversationId.value && !activeConversation.value) {
        activeConversationId.value = null
        messages.value = []
      }
    } finally {
      if (epoch === serviceEpoch) {
        conversationsPending = false
        if (!silent) loading.value = false
      }
    }
  }

  function mergeMessages(received: ChatMessage[]) {
    const merged = new Map<string, ChatMessage>()
    for (const item of messages.value) merged.set(item.clientMessageId ? `client:${item.clientMessageId}` : `id:${item.id}`, item)
    for (const item of received) merged.set(item.clientMessageId ? `client:${item.clientMessageId}` : `id:${item.id}`, item)
    messages.value = [...merged.values()].sort((left, right) => (
      left.createdAt.localeCompare(right.createdAt) || String(left.id).localeCompare(String(right.id))
    ))
  }

  async function loadMessages(silent = false, before = '') {
    const epoch = serviceEpoch
    const conversationId = activeConversationId.value
    if (conversationId === null || messagesPending) return
    messagesPending = true
    if (!silent) messagesLoading.value = true
    try {
      const received = await chatApi.listMessages(conversationId, before)
      if (epoch !== serviceEpoch || String(activeConversationId.value) !== String(conversationId)) return
      mergeMessages(received)
      if (before || messages.value.length === received.length) hasOlderMessages.value = received.length === 100
      await markActiveConversationRead()
    } finally {
      if (epoch === serviceEpoch) {
        messagesPending = false
        if (!silent) messagesLoading.value = false
      }
    }
  }

  async function loadOlderMessages() {
    const first = messages.value.find((item) => !String(item.id).startsWith('local-'))
    if (!first || !hasOlderMessages.value || olderMessagesLoading.value) return
    olderMessagesLoading.value = true
    try {
      await loadMessages(true, `${first.createdAt}|${first.id}`)
    } finally {
      olderMessagesLoading.value = false
    }
  }

  async function markActiveConversationRead() {
    const conversationId = activeConversationId.value
    if (conversationId === null) return
    const conversation = conversations.value.find((item) => String(item.id) === String(conversationId))
    if (conversation) conversation.unreadCount = 0
    await chatApi.markRead(conversationId).catch(() => undefined)
  }

  async function selectConversation(id: string | number) {
    if (String(activeConversationId.value) === String(id)) return loadMessages()
    activeConversationId.value = id
    messages.value = []
    hasOlderMessages.value = false
    await loadMessages()
  }

  async function createPrivateConversation(userId: string | number) {
    const conversation = await chatApi.createPrivateConversation(userId)
    await loadConversations(true)
    if (!conversations.value.some((item) => String(item.id) === String(conversation.id))) conversations.value.unshift(conversation)
    await selectConversation(conversation.id)
    return conversation
  }

  async function createGroupConversation(input: CreateGroupConversationInput) {
    const conversation = await chatApi.createGroupConversation(input)
    await loadConversations(true)
    if (!conversations.value.some((item) => String(item.id) === String(conversation.id))) conversations.value.unshift(conversation)
    await selectConversation(conversation.id)
    return conversation
  }

  function currentSenderId() {
    return currentUser.value?.id ?? currentUser.value?.username ?? 'current-user'
  }

  async function deliver(message: ChatMessage) {
    message.clientStatus = 'sending'
    try {
      const sent = await chatApi.sendMessage(message.conversationId, message.body, message.clientMessageId)
      const index = messages.value.findIndex((item) => item.id === message.id)
      if (index >= 0) messages.value[index] = { ...sent, clientStatus: 'sent' }
      await loadConversations(true)
    } catch (cause) {
      message.clientStatus = 'failed'
      throw cause
    }
  }

  async function sendMessage(body: string) {
    if (activeConversationId.value === null) throw new Error('请先选择会话')
    const temporary: ChatMessage = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      conversationId: activeConversationId.value,
      senderId: currentSenderId(),
      clientMessageId: `desktop-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      sender: currentUser.value || undefined,
      body,
      createdAt: new Date().toISOString(),
      clientStatus: 'sending',
    }
    messages.value.push(temporary)
    await deliver(temporary)
  }

  async function retryMessage(messageId: string | number) {
    const failed = messages.value.find((item) => item.id === messageId && item.clientStatus === 'failed')
    if (!failed) return
    await deliver(failed)
  }

  async function createUser(input: CreateUserInput) {
    const created = await chatAuthApi.createUser(input)
    await loadUsers()
    return created
  }

  async function initialize() {
    const epoch = serviceEpoch
    error.value = ''
    if (!serviceAuthenticated.value) return
    try {
      await Promise.all([loadUsers(), loadConversations()])
      if (!activeConversationId.value && conversations.value[0]) await selectConversation(conversations.value[0].id)
    } catch (cause) {
      if (epoch === serviceEpoch) error.value = cause instanceof Error ? cause.message : '工作沟通数据加载失败'
    }
  }

  function startPolling() {
    stopPolling()
    if (!serviceAuthenticated.value) return
    messageTimer = setInterval(() => void loadMessages(true).catch(() => undefined), MESSAGE_POLL_INTERVAL)
    conversationTimer = setInterval(() => void loadConversations(true).catch(() => undefined), CONVERSATION_POLL_INTERVAL)
  }

  function stopPolling() {
    if (messageTimer) clearInterval(messageTimer)
    if (conversationTimer) clearInterval(conversationTimer)
    messageTimer = undefined
    conversationTimer = undefined
  }

  function clearData() {
    stopPolling()
    users.value = []
    conversations.value = []
    activeConversationId.value = null
    messages.value = []
    loading.value = false
    messagesLoading.value = false
    olderMessagesLoading.value = false
    hasOlderMessages.value = false
    error.value = ''
    conversationsPending = false
    messagesPending = false
  }

  async function configureService(input: ChatServiceConfig) {
    const previous = serviceConfig.value
    const next = saveChatServiceConfig(input)
    if (previous.mode === next.mode && previous.baseUrl === next.baseUrl) return next
    serviceEpoch += 1
    invalidatePendingRequests()
    clearData()
    clearCloudChatSession()
    cloudUser.value = null
    cloudToken.value = ''
    serviceConfig.value = next
    if (next.mode === 'local') {
      await initialize()
      startPolling()
    }
    return next
  }

  async function signInToCloud(username: string, password: string) {
    if (serviceConfig.value.mode !== 'cloud') throw new Error('请先切换到线上聊天服务')
    serviceLoginLoading.value = true
    error.value = ''
    try {
      const result = await chatAuthApi.login(username, password)
      if (!result.token || !result.user) throw new Error('线上聊天登录响应不完整')
      saveCloudChatSession(result.token, result.user)
      cloudToken.value = result.token
      cloudUser.value = result.user
      await initialize()
      startPolling()
    } finally {
      serviceLoginLoading.value = false
    }
  }

  async function signOutCloud() {
    const logoutRequest = serviceConfig.value.mode === 'cloud' && getChatAccessToken(serviceConfig.value)
      ? chatAuthApi.logout()
      : Promise.resolve()
    serviceEpoch += 1
    invalidatePendingRequests()
    clearCloudChatSession()
    cloudToken.value = ''
    cloudUser.value = null
    clearData()
    await logoutRequest.catch(() => undefined)
  }

  function expireCloudSession() {
    if (serviceConfig.value.mode !== 'cloud') return
    serviceEpoch += 1
    clearCloudChatSession()
    cloudToken.value = ''
    cloudUser.value = null
    clearData()
    error.value = '线上聊天登录已过期，请重新登录'
  }

  function reset() {
    serviceEpoch += 1
    clearCloudChatSession()
    cloudToken.value = ''
    cloudUser.value = null
    clearData()
  }

  return {
    users,
    conversations,
    activeConversationId,
    activeConversation,
    messages,
    loading,
    messagesLoading,
    olderMessagesLoading,
    hasOlderMessages,
    error,
    serviceConfig,
    cloudToken,
    cloudUser,
    currentUser,
    serviceAuthenticated,
    serviceLoginLoading,
    loadUsers,
    loadConversations,
    selectConversation,
    loadOlderMessages,
    createPrivateConversation,
    createGroupConversation,
    sendMessage,
    retryMessage,
    createUser,
    configureService,
    signInToCloud,
    signOutCloud,
    expireCloudSession,
    initialize,
    startPolling,
    stopPolling,
    reset,
  }
})
