<template>
  <view class="message-page">
    <scroll-view class="message-scroll" scroll-y :scroll-top="scrollTop" :scroll-with-animation="initialized">
      <view class="message-list">
        <view v-if="chatStore.messagesLoading[conversationId] && !messages.length" class="loading-state">正在加载消息...</view>
        <view v-else-if="chatStore.hasOlderByConversation[conversationId]" class="history-action" @click="loadOlder">加载更早消息</view>
        <view v-for="message in messages" :key="messageKey(message)" class="message-row" :class="{ mine: isMine(message) }">
          <view class="sender-mark">{{ senderName(message).slice(0, 1) }}</view>
          <view class="message-content">
            <text v-if="!isMine(message)" class="sender-name">{{ senderName(message) }}</text>
            <view class="message-bubble">{{ message.body }}</view>
            <view class="message-meta">
              <text>{{ formatTime(message.createdAt || message.created_at) }}</text>
              <text v-if="message.sendStatus === 'sending'">发送中</text>
              <text v-if="message.sendStatus === 'failed'" class="failed" @click="retry(message)">发送失败，点击重试</text>
            </view>
          </view>
        </view>
        <view v-if="!messages.length && !chatStore.messagesLoading[conversationId]" class="empty-state">暂无消息</view>
      </view>
    </scroll-view>

    <view class="composer">
      <textarea v-model="draft" class="message-input" :maxlength="2000" auto-height placeholder="输入消息" confirm-type="send" @confirm="send" />
      <button class="send-button" :disabled="!draft.trim()" @click="send">发送</button>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import { useAuthStore } from '../../store/auth'
import { useChatStore } from '../../store/chat'

const authStore = useAuthStore()
const chatStore = useChatStore()
const conversationId = ref('')
const draft = ref('')
const scrollTop = ref(0)
const initialized = ref(false)
const loadingOlder = ref(false)
const messages = computed(() => chatStore.messagesByConversation[conversationId.value] || [])
let refreshTimer = null

onLoad((options) => {
  conversationId.value = options.id || ''
  if (options.title) uni.setNavigationBarTitle({ title: decodeURIComponent(options.title) })
})

onShow(() => {
  refresh()
  stopPolling()
  refreshTimer = setInterval(refresh, 3000)
})
onHide(stopPolling)
onUnload(stopPolling)
watch(() => messages.value.length, () => {
  if (!loadingOlder.value) scrollToBottom()
})

async function refresh() {
  if (!conversationId.value) return
  try {
    await chatStore.loadMessages(conversationId.value)
    await chatStore.markRead(conversationId.value)
    initialized.value = true
  } catch (error) {
    if (error.name !== 'UnauthorizedError' && !messages.value.length) uni.showToast({ title: error.message || '消息加载失败', icon: 'none' })
  }
}

async function loadOlder() {
  if (loadingOlder.value) return
  loadingOlder.value = true
  try {
    await chatStore.loadOlderMessages(conversationId.value)
  } catch (error) {
    if (error.name !== 'UnauthorizedError') uni.showToast({ title: error.message || '历史消息加载失败', icon: 'none' })
  } finally {
    loadingOlder.value = false
  }
}

function stopPolling() {
  if (refreshTimer) clearInterval(refreshTimer)
  refreshTimer = null
}

function scrollToBottom() {
  nextTick(() => {
    scrollTop.value += 100000
  })
}

async function send() {
  const body = draft.value.trim()
  if (!body || !conversationId.value) return
  draft.value = ''
  try {
    await chatStore.sendMessage(conversationId.value, body, authStore.user)
    chatStore.loadConversations().catch(() => {})
  } catch (error) {
    if (error.name !== 'UnauthorizedError') uni.showToast({ title: error.message || '消息发送失败', icon: 'none' })
  }
}

async function retry(message) {
  try {
    await chatStore.sendMessage(conversationId.value, message.body, authStore.user, message.clientMessageId)
  } catch (error) {
    if (error.name !== 'UnauthorizedError') uni.showToast({ title: error.message || '重试失败', icon: 'none' })
  }
}

function isMine(message) {
  const senderId = message.senderId ?? message.sender_id ?? message.sender?.id ?? message.userId ?? message.user_id
  return String(senderId) === String(authStore.user?.id)
}

function senderName(message) {
  return message.sender?.name || message.senderName || message.sender_name || message.sender?.username || (isMine(message) ? '我' : '成员')
}

function messageKey(message) {
  return message.id || message.clientMessageId || message.client_message_id || `${message.createdAt}-${message.body}`
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
</script>

<style scoped lang="scss">
.message-page { height: 100vh; overflow: hidden; background: #edf1ed; }
.message-scroll { height: calc(100vh - 126rpx - env(safe-area-inset-bottom)); }
.message-list { min-height: 100%; padding: 24rpx 24rpx 34rpx; }
.history-action { padding: 12rpx 0 28rpx; color: #39724d; font-size: 22rpx; text-align: center; }
.message-row { display: flex; align-items: flex-start; margin-bottom: 26rpx; }
.message-row.mine { flex-direction: row-reverse; }
.sender-mark { display: flex; width: 58rpx; height: 58rpx; flex: 0 0 58rpx; align-items: center; justify-content: center; margin-right: 14rpx; border-radius: 6rpx; background: #d7e4da; color: #245839; font-size: 24rpx; font-weight: 800; }
.mine .sender-mark { margin-right: 0; margin-left: 14rpx; background: #f0cf7b; color: #344839; }
.message-content { max-width: 72%; }
.sender-name { display: block; margin: 0 0 7rpx 4rpx; color: #748079; font-size: 20rpx; }
.message-bubble { padding: 18rpx 20rpx; border: 1rpx solid #dbe2dc; border-radius: 6rpx; background: #fff; font-size: 27rpx; line-height: 1.55; word-break: break-word; }
.mine .message-bubble { border-color: #b9d1c0; background: #dcecdf; }
.message-meta { display: flex; justify-content: flex-end; gap: 10rpx; margin-top: 6rpx; color: #89928d; font-size: 18rpx; }
.failed { color: #a33f38; }
.composer { display: flex; min-height: 126rpx; align-items: flex-end; gap: 14rpx; padding: 18rpx 22rpx calc(18rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid #d5ddd6; background: #fff; }
.message-input { min-height: 72rpx; max-height: 180rpx; flex: 1; padding: 17rpx 18rpx; border: 1rpx solid #cbd5cd; border-radius: 6rpx; background: #f8faf8; font-size: 27rpx; line-height: 38rpx; }
.send-button { width: 116rpx; height: 72rpx; margin: 0; border-radius: 6rpx; background: #21613c; color: #fff; font-size: 25rpx; font-weight: 700; line-height: 72rpx; }
.send-button[disabled] { background: #a5b5a8; color: #eef2ee; }
</style>
