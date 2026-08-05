<template>
  <view class="page-shell home-page">
    <view class="work-header">
      <view>
        <text class="date-line">{{ todayText }}</text>
        <text class="greeting">{{ greeting }}，{{ userName }}</text>
      </view>
      <view class="work-status"><view class="online-dot"></view><text>作业中</text></view>
    </view>

    <view class="chat-entry" hover-class="chat-entry-pressed" @click="openChat">
      <view class="chat-symbol">讯</view>
      <view class="chat-copy">
        <text class="chat-title">工作沟通</text>
        <text class="chat-meta">{{ chatStore.totalUnread ? `${chatStore.totalUnread} 条消息待查看` : '查看会话与消息' }}</text>
      </view>
      <text v-if="chatStore.totalUnread" class="chat-unread">{{ chatStore.totalUnread > 99 ? '99+' : chatStore.totalUnread }}</text>
      <text class="chat-arrow">›</text>
    </view>

    <view v-if="farmStore.loading && !farmStore.dashboard" class="loading-state">正在同步农场数据...</view>
    <template v-else>
      <view class="weather-panel">
        <view class="weather-main">
          <text class="weather-temp">{{ weather.temperature ?? '--' }}°</text>
          <view>
            <text class="weather-name">田间环境</text>
            <text class="weather-place">丰域智慧农场</text>
          </view>
        </view>
        <view class="environment-grid">
          <view class="environment-item">
            <text class="environment-label">湿度</text>
            <text class="environment-value">{{ weather.humidity ?? '--' }}%</text>
          </view>
          <view class="environment-item">
            <text class="environment-label">土壤墒情</text>
            <text class="environment-value">{{ environment.soilMoisture ?? '--' }}%</text>
          </view>
          <view class="environment-item">
            <text class="environment-label">光照</text>
            <text class="environment-value">{{ environment.light ?? '--' }} lux</text>
          </view>
        </view>
      </view>

      <view class="section-title"><text>今日概览</text></view>
      <view class="overview-grid surface">
        <view class="overview-item is-green">
          <text class="overview-value">{{ metrics.pendingTasks ?? 0 }}</text>
          <text class="overview-label">待处理任务</text>
        </view>
        <view class="overview-item is-blue">
          <text class="overview-value">{{ metrics.onlineDevices ?? 0 }}</text>
          <text class="overview-label">在线设备</text>
        </view>
        <view class="overview-item is-amber">
          <text class="overview-value">{{ metrics.activeAlerts ?? 0 }}</text>
          <text class="overview-label">未处理告警</text>
        </view>
      </view>

      <view class="section-title">
        <text>待办任务</text>
        <text class="section-count" @click="goTasks">查看全部</text>
      </view>
      <view class="surface task-list">
        <view v-for="task in todos" :key="task.id" class="task-row">
          <view class="task-indicator"></view>
          <view class="task-content">
            <text class="task-title">{{ task.title || task.name }}</text>
            <text class="task-meta">{{ fieldName(task.fieldId) }} · {{ task.dueDate || '未安排' }}</text>
          </view>
          <text class="status-badge" :class="priorityClass(task.priority)">{{ priorityText(task.priority) }}</text>
        </view>
        <view v-if="!todos.length" class="empty-state">今日暂无待办任务</view>
      </view>

      <view class="section-title">
        <text>异常设备</text>
        <text class="section-count">{{ farmStore.abnormalDevices.length }} 台</text>
      </view>
      <view class="surface device-list">
        <view v-for="device in farmStore.abnormalDevices" :key="device.id" class="device-row">
          <view class="device-symbol">!</view>
          <view class="device-content">
            <text class="device-name">{{ device.name }}</text>
            <text class="device-meta">{{ fieldName(device.fieldId) }}</text>
          </view>
          <text class="device-status">{{ device.message || statusText(device.status) }}</text>
        </view>
        <view v-if="!farmStore.abnormalDevices.length" class="empty-state">设备运行正常</view>
      </view>
    </template>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { useAuthStore } from '../../store/auth'
import { useChatStore } from '../../store/chat'
import { useFarmStore } from '../../store/farm'

const authStore = useAuthStore()
const chatStore = useChatStore()
const farmStore = useFarmStore()
const dashboard = computed(() => farmStore.dashboard || {})
const environment = computed(() => dashboard.value.environment || {})
const weather = computed(() => environment.value)
const metrics = computed(() => dashboard.value.metrics || {})
const todos = computed(() => farmStore.tasks.filter((task) => task.status !== 'completed').slice(0, 4))
const userName = computed(() => authStore.user?.name || authStore.user?.username || '巡田员')

const now = new Date()
const todayText = `${now.getMonth() + 1}月${now.getDate()}日 星期${'日一二三四五六'[now.getDay()]}`
const greeting = now.getHours() < 12 ? '早上好' : now.getHours() < 18 ? '下午好' : '晚上好'

onShow(refresh)
onPullDownRefresh(async () => {
  await refresh()
  uni.stopPullDownRefresh()
})

async function refresh() {
  try {
    await Promise.all([farmStore.loadHome(), chatStore.loadConversations()])
  } catch (error) {
    if (error.name !== 'UnauthorizedError') uni.showToast({ title: error.message || '数据加载失败', icon: 'none' })
  }
}

function goTasks() {
  uni.switchTab({ url: '/pages/tasks/index' })
}

function openChat() {
  uni.navigateTo({ url: '/pages/chat/index' })
}

function fieldName(fieldId) {
  return farmStore.fields.find((field) => field.id === fieldId)?.name || '未指定地块'
}

function priorityText(priority) {
  return ({ high: '紧急', medium: '普通', low: '低' })[priority] || priority || '普通'
}

function priorityClass(priority) {
  return priority === 'high' ? 'is-amber' : priority === 'low' ? 'is-gray' : 'is-blue'
}

function statusText(status) {
  return ({ offline: '离线', maintenance: '维护中', warning: '告警', alarm: '告警', abnormal: '异常' })[status] || status || '异常'
}
</script>

<style scoped lang="scss">
.home-page {
  padding-top: 26rpx;
}

.work-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28rpx;
}

.date-line,
.greeting {
  display: block;
}

.date-line {
  margin-bottom: 6rpx;
  color: #6c7871;
  font-size: 23rpx;
}

.greeting {
  font-size: 38rpx;
  font-weight: 800;
}

.work-status {
  display: flex;
  align-items: center;
  padding: 12rpx 16rpx;
  border: 1rpx solid #cbd8ce;
  border-radius: 6rpx;
  background: #ffffff;
  color: #36523f;
  font-size: 22rpx;
}

.online-dot {
  width: 12rpx;
  height: 12rpx;
  margin-right: 10rpx;
  border-radius: 50%;
  background: #3d8b56;
}

.chat-entry {
  display: flex;
  min-height: 88rpx;
  align-items: center;
  margin-bottom: 22rpx;
  padding: 14rpx 18rpx;
  border: 1rpx solid #cbd8ce;
  border-left: 6rpx solid #3f79a4;
  border-radius: 8rpx;
  background: #ffffff;
}

.chat-entry-pressed { background: #f0f4f1; }
.chat-symbol { display: flex; width: 50rpx; height: 50rpx; align-items: center; justify-content: center; margin-right: 16rpx; border-radius: 6rpx; background: #e5eff8; color: #245d88; font-size: 22rpx; font-weight: 800; }
.chat-copy { min-width: 0; flex: 1; }
.chat-title,
.chat-meta { display: block; }
.chat-title { font-size: 26rpx; font-weight: 700; }
.chat-meta { margin-top: 3rpx; color: #738078; font-size: 20rpx; }
.chat-unread { min-width: 38rpx; height: 38rpx; padding: 0 8rpx; border-radius: 8rpx; background: #a6423b; color: #fff; font-size: 19rpx; line-height: 38rpx; text-align: center; }
.chat-arrow { margin-left: 12rpx; color: #7c8880; font-size: 38rpx; line-height: 1; }

.weather-panel {
  overflow: hidden;
  border-radius: 8rpx;
  background: #245839;
  color: #ffffff;
}

.weather-main {
  display: flex;
  align-items: center;
  padding: 30rpx 28rpx 24rpx;
}

.weather-temp {
  margin-right: 28rpx;
  font-size: 72rpx;
  font-weight: 300;
  line-height: 1;
}

.weather-name,
.weather-place {
  display: block;
}

.weather-name {
  font-size: 30rpx;
  font-weight: 700;
}

.weather-place {
  margin-top: 8rpx;
  color: #c7d8cb;
  font-size: 22rpx;
}

.environment-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1rpx solid #4f765d;
  background: #1d4a30;
}

.environment-item {
  padding: 20rpx 8rpx;
  border-right: 1rpx solid #4f765d;
  text-align: center;
}

.environment-item:last-child {
  border-right: 0;
}

.environment-label,
.environment-value {
  display: block;
}

.environment-label {
  margin-bottom: 7rpx;
  color: #afc5b5;
  font-size: 20rpx;
}

.environment-value {
  font-size: 25rpx;
  font-weight: 700;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  overflow: hidden;
}

.overview-item {
  padding: 28rpx 12rpx;
  border-right: 1rpx solid #e1e6e2;
  text-align: center;
}

.overview-item:last-child {
  border-right: 0;
}

.overview-item.is-green { border-top: 5rpx solid #3b7e50; }
.overview-item.is-blue { border-top: 5rpx solid #3f79a4; }
.overview-item.is-amber { border-top: 5rpx solid #c38722; }

.overview-value,
.overview-label {
  display: block;
}

.overview-value {
  font-size: 42rpx;
  font-weight: 800;
}

.overview-label {
  margin-top: 6rpx;
  color: #6f7973;
  font-size: 21rpx;
}

.task-row,
.device-row {
  display: flex;
  min-height: 112rpx;
  align-items: center;
  padding: 20rpx 22rpx;
  border-bottom: 1rpx solid #e6eae7;
}

.task-row:last-child,
.device-row:last-child {
  border-bottom: 0;
}

.task-indicator {
  width: 8rpx;
  height: 54rpx;
  margin-right: 20rpx;
  border-radius: 4rpx;
  background: #3f79a4;
}

.task-content,
.device-content {
  min-width: 0;
  flex: 1;
}

.task-title,
.task-meta,
.device-name,
.device-meta {
  display: block;
}

.task-title,
.device-name {
  overflow: hidden;
  font-size: 27rpx;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-meta,
.device-meta {
  overflow: hidden;
  margin-top: 7rpx;
  color: #77817b;
  font-size: 21rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-symbol {
  display: flex;
  width: 48rpx;
  height: 48rpx;
  align-items: center;
  justify-content: center;
  margin-right: 18rpx;
  border-radius: 6rpx;
  background: #fff0d2;
  color: #9a6208;
  font-weight: 800;
}

.device-status {
  max-width: 180rpx;
  color: #a56508;
  font-size: 22rpx;
  text-align: right;
}
</style>
