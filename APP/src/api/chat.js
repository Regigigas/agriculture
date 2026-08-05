import { request } from '../utils/request'

export const getConversations = () => request({ url: '/chat/conversations' })

export function createPrivateConversation(userId) {
  return request({
    url: '/chat/conversations/private',
    method: 'POST',
    data: { userId }
  })
}

export function createGroupConversation(title, memberIds) {
  return request({
    url: '/chat/conversations/group',
    method: 'POST',
    data: { title, memberIds }
  })
}

export function getMessages(conversationId, limit = 100, before = '') {
  return request({
    url: `/chat/conversations/${encodeURIComponent(conversationId)}/messages?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`
  })
}

export function sendMessage(conversationId, body, clientMessageId) {
  return request({
    url: `/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
    method: 'POST',
    data: { body, clientMessageId }
  })
}

export function markConversationRead(conversationId) {
  return request({
    url: `/chat/conversations/${encodeURIComponent(conversationId)}/read`,
    method: 'PATCH'
  })
}
