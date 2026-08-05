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

    <view class="section-title"><text>账号与沟通</text></view>
    <view class="surface info-list">
      <view class="info-row update-entry" hover-class="row-pressed" @click="openChat">
        <text class="info-label">工作沟通</text>
        <view class="entry-value"><text class="info-value">会话与消息</text><text class="entry-arrow">›</text></view>
      </view>
      <view class="info-row update-entry" hover-class="row-pressed" @click="openPassword">
        <text class="info-label">修改密码</text>
        <view class="entry-value"><text class="entry-arrow">›</text></view>
      </view>
      <view v-if="isAdmin" class="info-row update-entry" hover-class="row-pressed" @click="openAddUser">
        <text class="info-label">添加账号</text>
        <view class="entry-value"><text class="info-value">管理员</text><text class="entry-arrow">›</text></view>
      </view>
    </view>

    <view class="section-title"><text>系统信息</text></view>
    <view class="surface info-list">
      <view class="info-row">
        <text class="info-label">服务状态</text>
        <text class="service-state" :class="{ unavailable: serviceStatus === '不可用' }">{{ serviceStatus }}</text>
      </view>
      <view class="info-row update-entry" hover-class="row-pressed" @click="openServiceConfig">
        <text class="info-label">服务连接</text>
        <view class="entry-value"><text class="info-value">{{ connectionType }}</text><text class="entry-arrow">›</text></view>
      </view>
      <view class="info-row update-entry" hover-class="row-pressed" @click="openUpdatePage">
        <text class="info-label">当前版本</text>
        <view class="entry-value"><text class="info-value">{{ appVersion }}</text><text class="entry-arrow">›</text></view>
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
import { getRuntimeInfo } from '../../utils/app-update'
import { getServiceConfig, serviceModeText } from '../../utils/service-config'

const authStore = useAuthStore()
const serviceStatus = ref('未检测')
const appVersion = ref('--')
const user = computed(() => authStore.user || {})
const isAdmin = computed(() => String(user.value.role || '').toLowerCase() === 'admin')
const connectionType = ref('线上服务')
const avatarText = computed(() => (user.value.name || user.value.username || '农').slice(0, 1))

onShow(async () => {
  authStore.restoreSession()
  connectionType.value = serviceModeText(getServiceConfig().mode)
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
  try {
    appVersion.value = (await getRuntimeInfo()).appVersion
  } catch {
    appVersion.value = '--'
  }
})

function openUpdatePage() {
  uni.navigateTo({ url: '/pages/update/index' })
}

function openChat() {
  uni.navigateTo({ url: '/pages/chat/index' })
}

function openPassword() {
  uni.navigateTo({ url: '/pages/password/index' })
}

function openAddUser() {
  if (isAdmin.value) uni.navigateTo({ url: '/pages/register/index' })
}

function openServiceConfig() {
  uni.navigateTo({ url: '/pages/service/index' })
}

function confirmLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确定退出当前账号？',
    confirmColor: '#a43e37',
    success: async ({ confirm }) => {
      if (confirm) {
        try {
          await authStore.signOut()
        } catch {
          // signOut 始终在 finally 中完成本地清理和跳转。
        }
      }
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

.update-entry {
  cursor: pointer;
}

.row-pressed {
  background: #f2f5f2;
}

.entry-value {
  display: flex;
  align-items: center;
}

.entry-arrow {
  margin-left: 14rpx;
  color: #89928d;
  font-size: 38rpx;
  line-height: 1;
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
