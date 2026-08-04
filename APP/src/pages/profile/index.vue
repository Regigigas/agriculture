<template>
  <view class="profile-page">
    <view class="profile-header">
      <view class="avatar">{{ avatarText }}</view>
      <view class="identity">
        <text class="user-name">{{ user.name || user.username || '农业用户' }}</text>
        <text class="user-role">{{ user.roleName || user.role_name || user.role || '巡田人员' }}</text>
      </view>
      <view class="account-state"><view class="state-dot"></view><text>已登录</text></view>
    </view>

    <view class="section-title"><text>账号信息</text></view>
    <view class="surface info-list">
      <view class="info-row">
        <text class="info-label">登录账号</text>
        <text class="info-value">{{ user.username || user.account || '--' }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">所属农场</text>
        <text class="info-value">{{ user.farmName || user.farm_name || user.farm || '--' }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">联系电话</text>
        <text class="info-value">{{ user.phone || '--' }}</text>
      </view>
    </view>

    <view class="section-title"><text>系统信息</text></view>
    <view class="surface info-list">
      <view class="info-row">
        <text class="info-label">服务状态</text>
        <text class="service-state" :class="{ unavailable: serviceStatus === '不可用' }">{{ serviceStatus }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">当前版本</text>
        <text class="info-value">1.0.0</text>
      </view>
    </view>

    <button class="logout-button" @click="confirmLogout">退出登录</button>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getHealth } from '../../api/farm'
import { useAuthStore } from '../../store/auth'

const authStore = useAuthStore()
const serviceStatus = ref('未检测')
const user = computed(() => authStore.user || {})
const avatarText = computed(() => (user.value.name || user.value.username || '农').slice(0, 1))

onShow(async () => {
  authStore.restoreSession()
  if (!authStore.isAuthenticated) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  serviceStatus.value = '检测中'
  try {
    await getHealth()
    serviceStatus.value = '正常'
  } catch {
    serviceStatus.value = '不可用'
  }
})

function confirmLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确定退出当前账号？',
    confirmColor: '#a43e37',
    success: ({ confirm }) => {
      if (confirm) authStore.signOut()
    }
  })
}
</script>

<style scoped lang="scss">
.profile-page {
  min-height: 100vh;
  padding: 30rpx 28rpx calc(50rpx + env(safe-area-inset-bottom));
}

.profile-header {
  display: flex;
  align-items: center;
  padding: 34rpx 28rpx;
  border-radius: 8rpx;
  background: #245839;
  color: #ffffff;
}

.avatar {
  display: flex;
  width: 96rpx;
  height: 96rpx;
  align-items: center;
  justify-content: center;
  margin-right: 22rpx;
  border: 2rpx solid #8eae98;
  border-radius: 8rpx;
  background: #f1c45e;
  color: #284631;
  font-size: 40rpx;
  font-weight: 800;
}

.identity {
  min-width: 0;
  flex: 1;
}

.user-name,
.user-role {
  display: block;
}

.user-name {
  overflow: hidden;
  font-size: 34rpx;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-role {
  margin-top: 8rpx;
  color: #bed0c3;
  font-size: 22rpx;
}

.account-state {
  display: flex;
  align-items: center;
  padding: 10rpx 14rpx;
  border: 1rpx solid #61826b;
  border-radius: 6rpx;
  color: #d5e1d8;
  font-size: 20rpx;
}

.state-dot {
  width: 10rpx;
  height: 10rpx;
  margin-right: 8rpx;
  border-radius: 50%;
  background: #f1c45e;
}

.info-row {
  display: flex;
  min-height: 92rpx;
  align-items: center;
  justify-content: space-between;
  padding: 0 24rpx;
  border-bottom: 1rpx solid #e4e9e5;
}

.info-row:last-child {
  border-bottom: 0;
}

.info-label {
  color: #68736c;
  font-size: 25rpx;
}

.info-value {
  max-width: 65%;
  overflow: hidden;
  color: #27352d;
  font-size: 25rpx;
  font-weight: 600;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.service-state {
  color: #287044;
  font-size: 25rpx;
  font-weight: 700;
}

.service-state.unavailable {
  color: #a33f38;
}

.logout-button {
  height: 82rpx;
  margin-top: 48rpx;
  border: 1rpx solid #d4b1ae;
  border-radius: 8rpx;
  background: #ffffff;
  color: #a33f38;
  font-size: 27rpx;
  font-weight: 700;
  line-height: 80rpx;
}
</style>
