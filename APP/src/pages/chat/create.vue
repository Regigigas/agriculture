<template>
  <view class="create-page">
    <view class="mode-control">
      <view class="mode-item" :class="{ active: mode === 'private' }" @click="setMode('private')">私聊</view>
      <view class="mode-item" :class="{ active: mode === 'group' }" @click="setMode('group')">群聊</view>
    </view>

    <view v-if="mode === 'group'" class="group-title surface">
      <text class="field-label">群聊名称</text>
      <input v-model.trim="groupTitle" class="field-input" placeholder="请输入群聊名称" />
    </view>

    <view class="search-bar">
      <input v-model.trim="query" class="search-input" placeholder="按姓名或账号查找" confirm-type="search" @confirm="search" />
      <button class="search-button" :disabled="searching" @click="search">{{ searching ? '查找中' : '查找' }}</button>
    </view>

    <view class="result-title">
      <text>联系人</text>
      <text v-if="mode === 'group'" class="selected-count">已选 {{ selectedIds.length }} 人</text>
    </view>
    <view class="user-list surface">
      <view v-for="user in users" :key="user.id" class="user-row" @click="selectUser(user)">
        <view class="user-mark">{{ userName(user).slice(0, 1) }}</view>
        <view class="user-content">
          <text class="user-name">{{ userName(user) }}</text>
          <text class="user-account">{{ user.username || user.account || '无账号信息' }}</text>
        </view>
        <view v-if="mode === 'group'" class="check-box" :class="{ checked: isSelected(user.id) }">{{ isSelected(user.id) ? '✓' : '' }}</view>
        <text v-else class="private-action">发起</text>
      </view>
      <view v-if="!users.length && !searching" class="empty-state">未找到联系人</view>
    </view>

    <button v-if="mode === 'group'" class="primary-button group-button" :disabled="!canCreateGroup || chatStore.creating" @click="createGroup">
      {{ chatStore.creating ? '正在创建...' : '创建群聊' }}
    </button>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { searchUsers } from '../../api/auth'
import { useAuthStore } from '../../store/auth'
import { useChatStore } from '../../store/chat'

const authStore = useAuthStore()
const chatStore = useChatStore()
const mode = ref('private')
const query = ref('')
const users = ref([])
const selectedIds = ref([])
const groupTitle = ref('')
const searching = ref(false)
const canCreateGroup = computed(() => groupTitle.value && selectedIds.value.length)

onLoad(search)

function setMode(value) {
  mode.value = value
  selectedIds.value = []
}

async function search() {
  if (searching.value) return
  searching.value = true
  try {
    const result = await searchUsers(query.value)
    const payload = result?.data ?? result
    const list = Array.isArray(payload) ? payload : payload?.users || payload?.items || []
    users.value = list.filter((user) => String(user.id) !== String(authStore.user?.id))
  } catch (error) {
    if (error.name !== 'UnauthorizedError') uni.showToast({ title: error.message || '联系人查找失败', icon: 'none' })
  } finally {
    searching.value = false
  }
}

function userName(user) {
  return user.name || user.username || '未命名用户'
}

function isSelected(id) {
  return selectedIds.value.some((item) => String(item) === String(id))
}

function selectUser(user) {
  if (mode.value === 'private') {
    createPrivate(user)
    return
  }
  selectedIds.value = isSelected(user.id)
    ? selectedIds.value.filter((id) => String(id) !== String(user.id))
    : [...selectedIds.value, user.id]
}

async function createPrivate(user) {
  if (chatStore.creating) return
  try {
    const created = await chatStore.createPrivate(user.id)
    openCreated(created, userName(user))
  } catch (error) {
    if (error.name !== 'UnauthorizedError') uni.showToast({ title: error.message || '私聊创建失败', icon: 'none' })
  }
}

async function createGroup() {
  if (!canCreateGroup.value || chatStore.creating) return
  try {
    const created = await chatStore.createGroup(groupTitle.value, selectedIds.value)
    openCreated(created, groupTitle.value)
  } catch (error) {
    if (error.name !== 'UnauthorizedError') uni.showToast({ title: error.message || '群聊创建失败', icon: 'none' })
  }
}

function openCreated(result, fallbackTitle) {
  const conversation = result?.conversation || result
  if (!conversation?.id) {
    uni.showToast({ title: '创建成功，请在会话列表中查看', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 700)
    return
  }
  const title = encodeURIComponent(conversation.title || conversation.name || fallbackTitle)
  uni.redirectTo({ url: `/pages/chat/messages?id=${encodeURIComponent(conversation.id)}&title=${title}` })
}
</script>

<style scoped lang="scss">
.create-page { min-height: 100vh; padding: 24rpx 28rpx calc(40rpx + env(safe-area-inset-bottom)); }
.mode-control { display: grid; grid-template-columns: repeat(2, 1fr); padding: 6rpx; border: 1rpx solid #dce3dd; border-radius: 8rpx; background: #fff; }
.mode-item { height: 62rpx; border-radius: 6rpx; color: #647068; font-size: 25rpx; line-height: 62rpx; text-align: center; }
.mode-item.active { background: #e4efe7; color: #205d3a; font-weight: 700; }
.group-title { margin-top: 20rpx; padding: 22rpx; }
.field-label { display: block; margin-bottom: 10rpx; color: #526158; font-size: 23rpx; font-weight: 700; }
.field-input { width: 100%; height: 76rpx; padding: 0 20rpx; border: 1rpx solid #ccd5ce; border-radius: 6rpx; background: #f9faf9; font-size: 27rpx; }
.search-bar { display: flex; gap: 14rpx; margin-top: 20rpx; }
.search-input { min-width: 0; height: 76rpx; flex: 1; padding: 0 20rpx; border: 1rpx solid #ccd5ce; border-radius: 6rpx; background: #fff; font-size: 26rpx; }
.search-button { width: 128rpx; height: 76rpx; margin: 0; border-radius: 6rpx; background: #355f43; color: #fff; font-size: 24rpx; line-height: 76rpx; }
.result-title { display: flex; align-items: center; justify-content: space-between; margin: 30rpx 2rpx 14rpx; font-size: 29rpx; font-weight: 700; }
.selected-count { color: #68736d; font-size: 22rpx; font-weight: 500; }
.user-list { overflow: hidden; }
.user-row { display: flex; min-height: 104rpx; align-items: center; padding: 16rpx 20rpx; border-bottom: 1rpx solid #e4e9e5; }
.user-row:last-child { border-bottom: 0; }
.user-mark { display: flex; width: 62rpx; height: 62rpx; align-items: center; justify-content: center; margin-right: 16rpx; border-radius: 6rpx; background: #e3ece5; color: #245839; font-weight: 800; }
.user-content { min-width: 0; flex: 1; }
.user-name,
.user-account { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.user-name { font-size: 27rpx; font-weight: 700; }
.user-account { margin-top: 5rpx; color: #7b8580; font-size: 21rpx; }
.check-box { width: 38rpx; height: 38rpx; border: 2rpx solid #aeb9b1; border-radius: 4rpx; color: #fff; font-size: 26rpx; line-height: 34rpx; text-align: center; }
.check-box.checked { border-color: #21613c; background: #21613c; }
.private-action { color: #21613c; font-size: 23rpx; font-weight: 700; }
.group-button { margin-top: 28rpx; }
</style>
