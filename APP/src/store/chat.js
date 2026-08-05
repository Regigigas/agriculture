import { defineStore } from 'pinia'
import {
  createGroupConversation,
  createPrivateConversation,
  getConversations,
  getMessages,
  markConversationRead,
  sendMessage as postMessage
} from '../api/chat'

function payloadOf(result) {
  return result?.data ?? result
}

function listOf(result, key) {
  const payload = payloadOf(result)
  if (Array.isArray(payload)) return payload
  return payload?.[key] || payload?.items || []
}

function clientMessageIdOf(message) {
  return message.clientMessageId || message.client_message_id
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    conversations: [],
    messagesByConversation: {},
    hasOlderByConversation: {},
    conversationsLoading: false,
    messagesLoading: {},
    creating: false
  }),
  getters: {
    totalUnread: (state) => state.conversations.reduce(
      (total, item) => total + Number(item.unreadCount ?? item.unread_count ?? 0),
      0
    )
  },
  actions: {
    async loadConversations() {
      if (this.conversationsLoading) return
      this.conversationsLoading = true
      try {
        this.conversations = listOf(await getConversations(), 'conversations')
      } finally {
        this.conversationsLoading = false
      }
    },
    async loadMessages(conversationId, before = '') {
      if (this.messagesLoading[conversationId]) return
      this.messagesLoading[conversationId] = true
      try {
        const remote = listOf(await getMessages(conversationId, 100, before), 'messages')
        const existing = this.messagesByConversation[conversationId] || []
        const merged = new Map()
        for (const message of existing) merged.set(clientMessageIdOf(message) ? `client:${clientMessageIdOf(message)}` : `id:${message.id}`, message)
        for (const message of remote) merged.set(clientMessageIdOf(message) ? `client:${clientMessageIdOf(message)}` : `id:${message.id}`, message)
        this.messagesByConversation[conversationId] = [...merged.values()].sort((left, right) => {
          const time = String(left.createdAt || left.created_at).localeCompare(String(right.createdAt || right.created_at))
          return time || String(left.id || '').localeCompare(String(right.id || ''))
        })
        if (before || existing.length === 0) this.hasOlderByConversation[conversationId] = remote.length === 100
      } finally {
        this.messagesLoading[conversationId] = false
      }
    },
    async loadOlderMessages(conversationId) {
      if (!this.hasOlderByConversation[conversationId]) return
      const first = (this.messagesByConversation[conversationId] || []).find((message) => message.id)
      if (!first) return
      const createdAt = first.createdAt || first.created_at
      await this.loadMessages(conversationId, `${createdAt}|${first.id}`)
    },
    async createPrivate(userId) {
      return this.createConversation(() => createPrivateConversation(userId))
    },
    async createGroup(title, memberIds) {
      return this.createConversation(() => createGroupConversation(title, memberIds))
    },
    async createConversation(create) {
      this.creating = true
      try {
        const conversation = payloadOf(await create())
        await this.loadConversations()
        return conversation
      } finally {
        this.creating = false
      }
    },
    async markRead(conversationId) {
      await markConversationRead(conversationId)
      const conversation = this.conversations.find((item) => String(item.id) === String(conversationId))
      if (conversation) {
        conversation.unreadCount = 0
        conversation.unread_count = 0
      }
    },
    async sendMessage(conversationId, body, sender, clientMessageId) {
      const id = clientMessageId || `${Date.now()}-${sender?.id || 'user'}-${Math.random().toString(36).slice(2, 10)}`
      const messages = this.messagesByConversation[conversationId] || []
      let local = messages.find((message) => message.clientMessageId === id)
      if (local) {
        local.sendStatus = 'sending'
      } else {
        local = {
          clientMessageId: id,
          body,
          sender,
          senderId: sender?.id,
          createdAt: new Date().toISOString(),
          sendStatus: 'sending'
        }
        this.messagesByConversation[conversationId] = [...messages, local]
      }

      try {
        const payload = payloadOf(await postMessage(conversationId, body, id))
        const saved = payload?.message || payload
        const current = this.messagesByConversation[conversationId] || []
        const index = current.findIndex((message) => message.clientMessageId === id)
        if (index !== -1) current[index] = { ...(saved || local), clientMessageId: id, sendStatus: 'sent' }
        return saved
      } catch (error) {
        local.sendStatus = 'failed'
        throw error
      }
    }
  }
})
