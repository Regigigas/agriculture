<template>
  <view class="page-shell task-page">
    <scroll-view class="filter-scroll" scroll-x :show-scrollbar="false">
      <view class="filter-bar">
        <view
          v-for="filter in filters"
          :key="filter.value"
          class="filter-item"
          :class="{ active: activeFilter === filter.value }"
          @click="activeFilter = filter.value"
        >
          <text>{{ filter.label }}</text>
          <text class="filter-count">{{ countByStatus(filter.value) }}</text>
        </view>
      </view>
    </scroll-view>

    <view class="result-line">
      <text>{{ activeLabel }}</text>
      <text class="result-count">{{ filteredTasks.length }} 项</text>
    </view>

    <view v-if="farmStore.loading && !farmStore.tasks.length" class="loading-state">正在加载任务...</view>
    <view v-else class="task-stack">
      <view v-for="task in filteredTasks" :key="task.id" class="task-card surface">
        <view class="task-card-head">
          <text class="task-name">{{ task.title || task.name }}</text>
          <text class="status-badge" :class="statusClass(task.status)">{{ statusText(task.status) }}</text>
        </view>
        <view class="task-field">
          <text class="meta-key">地块</text>
          <text class="meta-value">{{ fieldName(task.fieldId) }}</text>
        </view>
        <view class="task-meta-row">
          <view class="meta-block">
            <text class="meta-key">计划时间</text>
            <text class="meta-value">{{ task.dueDate || '未安排' }}</text>
          </view>
          <view class="meta-block align-right">
            <text class="meta-key">负责人</text>
            <text class="meta-value">{{ task.assigneeName || task.assignee_name || task.assignee || '待分配' }}</text>
          </view>
        </view>
        <text v-if="task.description" class="task-description">{{ task.description }}</text>
        <button
          v-if="!isCompleted(task.status)"
          class="complete-button"
          :loading="farmStore.updatingTaskId === task.id"
          :disabled="farmStore.updatingTaskId !== null"
          @click="confirmAdvance(task)"
        >
          {{ normalizeStatus(task.status) === 'pending' ? '开始任务' : '确认完工' }}
        </button>
      </view>
      <view v-if="!filteredTasks.length" class="surface empty-state">当前筛选下暂无任务</view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { useFarmStore } from '../../store/farm'

const farmStore = useFarmStore()
const activeFilter = ref('all')
const filters = [
  { label: '全部', value: 'all' },
  { label: '待处理', value: 'pending' },
  { label: '进行中', value: 'in_progress' },
  { label: '已完成', value: 'completed' }
]

const filteredTasks = computed(() => activeFilter.value === 'all'
  ? farmStore.tasks
  : farmStore.tasks.filter((task) => normalizeStatus(task.status) === activeFilter.value)
)
const activeLabel = computed(() => filters.find((item) => item.value === activeFilter.value)?.label)

onShow(refresh)
onPullDownRefresh(async () => {
  await refresh()
  uni.stopPullDownRefresh()
})

async function refresh() {
  try {
    await Promise.all([farmStore.loadTasks(), farmStore.fields.length ? Promise.resolve() : farmStore.loadFields()])
  } catch (error) {
    if (error.name !== 'UnauthorizedError') uni.showToast({ title: error.message || '任务加载失败', icon: 'none' })
  }
}

function normalizeStatus(status) {
  return ({ todo: 'pending', processing: 'in_progress', done: 'completed', 待处理: 'pending', 进行中: 'in_progress', 已完成: 'completed' })[status] || status
}

function fieldName(fieldId) {
  return farmStore.fields.find((field) => field.id === fieldId)?.name || '未指定'
}

function isCompleted(status) {
  return normalizeStatus(status) === 'completed'
}

function statusText(status) {
  return ({ pending: '待处理', in_progress: '进行中', completed: '已完成' })[normalizeStatus(status)] || status || '待处理'
}

function statusClass(status) {
  return ({ pending: 'is-amber', in_progress: 'is-blue', completed: 'is-green' })[normalizeStatus(status)] || 'is-gray'
}

function countByStatus(status) {
  if (status === 'all') return farmStore.tasks.length
  return farmStore.tasks.filter((task) => normalizeStatus(task.status) === status).length
}

function confirmAdvance(task) {
  const nextStatus = normalizeStatus(task.status) === 'pending' ? 'in_progress' : 'completed'
  const completing = nextStatus === 'completed'
  uni.showModal({
    title: completing ? '确认完工' : '开始任务',
    content: completing ? `确认“${task.title || task.name}”已经完成？` : `确认开始执行“${task.title || task.name}”？`,
    confirmColor: '#21613c',
    success: async ({ confirm }) => {
      if (!confirm) return
      try {
        await farmStore.updateTask(task, nextStatus)
        uni.showToast({ title: completing ? '任务已完成' : '任务已开始', icon: 'success' })
      } catch (error) {
        if (error.name !== 'UnauthorizedError') uni.showToast({ title: error.message || '更新失败', icon: 'none' })
      }
    }
  })
}
</script>

<style scoped lang="scss">
.task-page {
  padding-top: 22rpx;
}

.filter-scroll {
  width: 100%;
  white-space: nowrap;
}

.filter-bar {
  display: inline-flex;
  min-width: 100%;
  padding: 6rpx;
  border: 1rpx solid #dce3dd;
  border-radius: 8rpx;
  background: #ffffff;
}

.filter-item {
  display: flex;
  min-width: 142rpx;
  height: 62rpx;
  align-items: center;
  justify-content: center;
  padding: 0 16rpx;
  border-radius: 6rpx;
  color: #647068;
  font-size: 24rpx;
}

.filter-item.active {
  background: #e6f0e8;
  color: #205d3a;
  font-weight: 700;
}

.filter-count {
  margin-left: 8rpx;
  font-size: 20rpx;
}

.result-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 30rpx 2rpx 18rpx;
  font-size: 30rpx;
  font-weight: 700;
}

.result-count {
  color: #737e77;
  font-size: 23rpx;
  font-weight: 500;
}

.task-card {
  margin-bottom: 18rpx;
  padding: 26rpx 24rpx 22rpx;
}

.task-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 24rpx;
}

.task-name {
  min-width: 0;
  flex: 1;
  font-size: 31rpx;
  font-weight: 800;
  line-height: 1.4;
}

.task-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 0;
  border-top: 1rpx solid #e5e9e6;
  border-bottom: 1rpx solid #e5e9e6;
}

.task-meta-row {
  display: flex;
  justify-content: space-between;
  padding: 20rpx 0 4rpx;
}

.meta-block {
  max-width: 50%;
}

.align-right {
  text-align: right;
}

.meta-key,
.meta-value {
  display: block;
}

.meta-key {
  color: #78827c;
  font-size: 21rpx;
}

.meta-value {
  margin-top: 6rpx;
  color: #2e3b34;
  font-size: 25rpx;
  font-weight: 600;
}

.task-field .meta-value {
  margin-top: 0;
}

.task-description {
  display: block;
  margin-top: 18rpx;
  padding: 16rpx;
  border-left: 5rpx solid #c68b28;
  background: #faf7ef;
  color: #5d625e;
  font-size: 23rpx;
  line-height: 1.6;
}

.complete-button {
  height: 72rpx;
  margin-top: 24rpx;
  border: 1rpx solid #39764c;
  border-radius: 6rpx;
  background: #ffffff;
  color: #21613c;
  font-size: 26rpx;
  font-weight: 700;
  line-height: 70rpx;
}

.complete-button[disabled] {
  border-color: #bbc5bd;
  color: #879189;
}
</style>
