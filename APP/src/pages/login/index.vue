<template>
  <view class="login-page">
    <view class="brand-block">
      <view class="brand-mark"><text class="brand-leaf">田</text></view>
      <view>
        <text class="brand-title">田间管理</text>
        <text class="brand-subtitle">农业巡检作业平台</text>
      </view>
    </view>

    <view class="login-panel">
      <text class="panel-title">账号登录</text>
      <text class="panel-note">使用农场管理账号进入工作台</text>

      <view class="field-group">
        <text class="field-label">账号</text>
        <input
          v-model.trim="form.username"
          class="field-input"
          type="text"
          placeholder="请输入账号"
          placeholder-class="input-placeholder"
          confirm-type="next"
        />
      </view>

      <view class="field-group">
        <text class="field-label">密码</text>
        <input
          v-model="form.password"
          class="field-input"
          password
          placeholder="请输入密码"
          placeholder-class="input-placeholder"
          confirm-type="done"
          @confirm="submit"
        />
      </view>

      <button class="primary-button login-button" :disabled="!canSubmit || authStore.loggingIn" @click="submit">
        {{ authStore.loggingIn ? '正在登录...' : '登录' }}
      </button>
      <button class="service-button" @click="openServiceConfig">
        <text>{{ connectionType }}</text>
        <text class="service-action">配置连接 ›</text>
      </button>
    </view>

    <view class="login-foot">
      <view class="security-dot"></view>
      <text>数据仅用于农业生产管理</text>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useAuthStore } from '../../store/auth'
import { getServiceConfig, serviceModeText } from '../../utils/service-config'

const authStore = useAuthStore()
const form = reactive({ username: '', password: '' })
const canSubmit = computed(() => form.username && form.password)
const connectionType = ref('线上服务')

onLoad(() => {
  authStore.restoreSession()
  if (authStore.isAuthenticated) uni.switchTab({ url: '/pages/home/index' })
})

onShow(() => {
  connectionType.value = serviceModeText(getServiceConfig().mode)
})

async function submit() {
  if (!canSubmit.value || authStore.loggingIn) return

  try {
    await authStore.signIn(form)
    uni.switchTab({ url: '/pages/home/index' })
  } catch (error) {
    uni.showToast({ title: error.message || '登录失败', icon: 'none' })
  }
}

function openServiceConfig() {
  uni.navigateTo({ url: '/pages/service/index' })
}
</script>

<style scoped lang="scss">
.login-page {
  min-height: 100vh;
  padding: calc(96rpx + env(safe-area-inset-top)) 42rpx 48rpx;
  background: #173f2a;
}

.brand-block {
  display: flex;
  align-items: center;
  margin: 30rpx 0 76rpx;
  color: #ffffff;
}

.brand-mark {
  display: flex;
  width: 92rpx;
  height: 92rpx;
  align-items: center;
  justify-content: center;
  margin-right: 24rpx;
  border: 2rpx solid #80a88d;
  border-radius: 8rpx;
  background: #245839;
}

.brand-leaf {
  color: #f2c55c;
  font-size: 42rpx;
  font-weight: 800;
}

.brand-title,
.brand-subtitle {
  display: block;
  letter-spacing: 0;
}

.brand-title {
  font-size: 48rpx;
  font-weight: 800;
}

.brand-subtitle {
  margin-top: 8rpx;
  color: #bdd0c2;
  font-size: 24rpx;
}

.login-panel {
  padding: 42rpx 36rpx 38rpx;
  border-radius: 8rpx;
  background: #ffffff;
}

.panel-title,
.panel-note {
  display: block;
}

.panel-title {
  font-size: 38rpx;
  font-weight: 800;
}

.panel-note {
  margin: 10rpx 0 38rpx;
  color: #748079;
  font-size: 24rpx;
}

.field-group {
  margin-bottom: 28rpx;
}

.field-label {
  display: block;
  margin-bottom: 12rpx;
  color: #425148;
  font-size: 25rpx;
  font-weight: 700;
}

.field-input {
  width: 100%;
  height: 88rpx;
  padding: 0 24rpx;
  border: 1rpx solid #ccd5ce;
  border-radius: 6rpx;
  background: #f9faf9;
  color: #1c2922;
  font-size: 28rpx;
}

.input-placeholder {
  color: #9aa39e;
}

.login-button {
  margin-top: 42rpx;
}

.service-button {
  display: flex;
  height: 76rpx;
  align-items: center;
  justify-content: space-between;
  margin-top: 18rpx;
  border: 1rpx solid #b9c8bd;
  border-radius: 8rpx;
  background: #ffffff;
  color: #245839;
  font-size: 26rpx;
  font-weight: 700;
  line-height: 1;
}

.service-action { color: #6f7d74; font-size: 23rpx; font-weight: 500; }

.login-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 44rpx;
  color: #b7c9bc;
  font-size: 22rpx;
}

.security-dot {
  width: 12rpx;
  height: 12rpx;
  margin-right: 12rpx;
  border-radius: 50%;
  background: #f2c55c;
}
</style>
