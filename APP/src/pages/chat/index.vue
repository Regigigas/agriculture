<template>
  <view class="conversation-page">
    <view class="list-toolbar">
      <view>
        <text class="toolbar-title">会话</text>
        <text class="toolbar-meta">{{ chatStore.totalUnread ? `${chatStore.totalUnread} 条未读` : '消息已读' }}</text>
      </view>
      <button class="create-button" @click="openCreate">发起会话</button>
    </view>

    <view v-if="chatStore.conversationsLoading && !chatStore.conversations.length" class="loading-state">正在加载会话...</view>
    <view v-else class="conversation-list surface">
      <view
        v-for="conversation in chatStore.conversations"
        :key="conversation.id"
        class="conversation-row"
        hover-class="row-pressed"
        @click="openConversation(conversation)"
      >
        <view class="conversation-mark">{{ conversationName(conversation).slice(0, 1) }}</view>
        <view class="conversation-content">
          <view class="conversation-head">
            <text class="conversation-name">{{ conversationName(conversation) }}</text>
            <text class="conversation-time">{{ formatTime(lastMessage(conversation)?.createdAt || lastMessage(conversation)?.created_at || conversation.updatedAt) }}</text>
          </view>
          <view class="conversation-foot">
            <text class="message-preview">{{ lastMessage(conversation)?.body || '暂无消息' }}</text>
            <text v-if="unreadCount(conversation)" class="unread-count">{{ unreadCount(conversation) > 99 ? '99+' : unreadCount(conversation) }}</text>
          </view>
        </view>
      </view>
      <view v-if="!chatStore.conversations.length" class="empty-state">暂无会话</view>
    </view>
  </view>
</template>

<script setup>
import { onHide, onPullDownRefresh, onShow, onUnload } from '@dcloudio/uni-app'
import { useChatStore } from '../../store/chat'

const chatStore = useChatStore()
let refreshTimer = null

onShow(() => {
  refresh()
  stopPolling()
  refreshTimer = setInterval(refresh, 8000)
})
onHide(stopPolling)
onUnload(stopPolling)
onPullDownRefresh(async () => {
  await refresh()
  uni.stopPullDownRefresh()
})

async function refresh() {
  try {
    await chatStore.loadConversations()
  } catch (error) {
    if (error.name !== 'UnauthorizedError') uni.showToast({ title: error.message || '会话加载失败', icon: 'none' })
  }
}

function stopPolling() {
  if (refreshTimer) clearInterval(refreshTimer)
  refreshTimer = null
}

function conversationName(conversation) {
  return conversation.title || conversation.name || conversation.displayName || conversation.display_name || '未命名会话'
}

function lastMessage(conversation) {
  return conversation.lastMessage || conversation.last_message || null
}

function unreadCount(conversation) {
  return Number(conversation.unreadCount ?? conversation.unread_count ?? 0)
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function openCreate() {
  uni.navigateTo({ url: '/pages/chat/create' })
}

function openConversation(conversation) {
  const title = encodeURIComponent(conversationName(conversation))
  uni.navigateTo({ url: `/pages/chat/messages?id=${encodeURIComponent(conversation.id)}&title=${title}` })
}
</script>

<style scoped lang="scss">
.conversation-page { min-height: 100vh; padding: 24rpx 28rpx calc(40rpx + env(safe-area-inset-bottom)); }
.list-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20rpx; }
.toolbar-title,
.toolbar-meta { display: block; }
.toolbar-title { font-size: 34rpx; font-weight: 800; }
.toolbar-meta { margin-top: 5rpx; color: #748079; font-size: 21rpx; }
.create-button { height: 64rpx; margin: 0; padding: 0 22rpx; border-radius: 6rpx; background: #21613c; color: #fff; font-size: 24rpx; font-weight: 700; line-height: 64rpx; }
.conversation-list { overflow: hidden; }
.conversation-row { display: flex; min-height: 126rpx; align-items: center; padding: 20rpx 22rpx; border-bottom: 1rpx solid #e3e8e4; }
.conversation-row:last-child { border-bottom: 0; }
.row-pressed { background: #f2f5f2; }
.conversation-mark { display: flex; width: 72rpx; height: 72rpx; flex: 0 0 72rpx; align-items: center; justify-content: center; margin-right: 18rpx; border-radius: 6rpx; background: #dfece2; color: #245839; font-size: 28rpx; font-weight: 800; }
.conversation-content { min-width: 0; flex: 1; }
.conversation-head,
.conversation-foot { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.conversation-name { min-width: 0; overflow: hidden; flex: 1; font-size: 28rpx; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.conversation-time { flex: none; color: #89928d; font-size: 20rpx; }
.conversation-foot { margin-top: 10rpx; }
.message-preview { min-width: 0; overflow: hidden; flex: 1; color: #748079; font-size: 23rpx; text-overflow: ellipsis; white-space: nowrap; }
.unread-count { min-width: 36rpx; height: 36rpx; padding: 0 8rpx; border-radius: 8rpx; background: #a6423b; color: #fff; font-size: 19rpx; line-height: 36rpx; text-align: center; }
</style>
