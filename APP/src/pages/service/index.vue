<template>
  <view class="service-page">
    <view class="service-heading">
      <text class="service-title">服务连接</text>
      <text class="service-subtitle">选择 App 连接的数据服务</text>
    </view>

    <view class="mode-switch" role="group">
      <button class="mode-button" :class="{ active: form.mode === 'local' }" @click="selectMode('local')">Electron 本地</button>
      <button class="mode-button" :class="{ active: form.mode === 'cloud' }" @click="selectMode('cloud')">线上</button>
    </view>

    <view class="surface config-panel">
      <template v-if="form.mode === 'local'">
        <text class="field-label">本地服务地址</text>
        <input
          v-model.trim="form.baseUrl"
          class="field-input"
          type="text"
          placeholder="http://192.168.1.10:3100/api"
          confirm-type="done"
          @confirm="save"
        />
        <text class="field-help">手机与运行 Electron 服务的电脑需处于可互访网络</text>
      </template>
      <template v-else>
        <text class="field-label">线上服务地址</text>
        <input
          v-model.trim="form.baseUrl"
          class="field-input"
          type="text"
          :placeholder="cloudBaseUrl"
          confirm-type="done"
          @confirm="save"
        />
        <text class="field-help">可使用构建默认地址，也可填写实际部署的线上 API 地址</text>
      </template>
    </view>

    <button class="primary-button save-button" @click="save">保存连接</button>
  </view>
</template>

<script setup>
import { reactive, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useAuthStore } from '../../store/auth'
import { CLOUD_API_BASE_URL, getServiceConfig, saveServiceConfig } from '../../utils/service-config'
import { normalizeServiceConfig, sameService } from '../../utils/service-config-core'

const authStore = useAuthStore()
const cloudBaseUrl = CLOUD_API_BASE_URL
const original = getServiceConfig()
const form = reactive({ ...original })
const drafts = reactive({
  local: original.mode === 'local' ? original.baseUrl : '',
  cloud: original.mode === 'cloud' ? original.baseUrl : cloudBaseUrl
})

watch(() => form.baseUrl, (value) => { drafts[form.mode] = value })

onLoad(() => authStore.restoreSession())

function selectMode(mode) {
  form.mode = mode
  form.baseUrl = drafts[mode]
}

function save() {
  let next
  try {
    next = normalizeServiceConfig(form, cloudBaseUrl)
  } catch (error) {
    uni.showToast({ title: error.message, icon: 'none' })
    return
  }

  const changed = !sameService(original, next)
  if (changed) authStore.clearSession()
  saveServiceConfig(next)
  uni.showToast({ title: '连接已保存', icon: 'success' })
  setTimeout(() => {
    if (changed) uni.reLaunch({ url: '/pages/login/index' })
    else uni.navigateBack()
  }, 350)
}
</script>

<style scoped lang="scss">
.service-page { min-height: 100vh; padding: 44rpx 30rpx calc(50rpx + env(safe-area-inset-bottom)); }
.service-heading { margin: 10rpx 4rpx 32rpx; }
.service-title,
.service-subtitle { display: block; }
.service-title { font-size: 38rpx; font-weight: 800; }
.service-subtitle { margin-top: 10rpx; color: #6f7a73; font-size: 24rpx; }
.mode-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 8rpx; padding: 8rpx; border: 1rpx solid #d7ded8; border-radius: 8rpx; background: #e8ece9; }
.mode-button { height: 72rpx; margin: 0; border-radius: 6rpx; background: transparent; color: #5d6961; font-size: 25rpx; font-weight: 700; line-height: 72rpx; }
.mode-button.active { background: #ffffff; color: #205d3a; }
.config-panel { min-height: 260rpx; margin-top: 24rpx; padding: 30rpx 26rpx; }
.field-label { display: block; margin-bottom: 14rpx; color: #425148; font-size: 25rpx; font-weight: 700; }
.field-input { width: 100%; height: 84rpx; padding: 0 22rpx; border: 1rpx solid #bfcac2; border-radius: 6rpx; background: #f9faf9; font-size: 27rpx; }
.cloud-url { display: block; overflow-wrap: anywhere; padding: 22rpx; border-left: 6rpx solid #39724d; background: #f1f5f2; color: #263a2d; font-size: 25rpx; line-height: 1.55; }
.field-help { display: block; margin-top: 18rpx; color: #78827c; font-size: 22rpx; line-height: 1.5; }
.save-button { margin-top: 40rpx; }
</style>
