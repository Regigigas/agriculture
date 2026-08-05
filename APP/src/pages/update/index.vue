<template>
  <view class="update-page">
    <view class="version-band">
      <view>
        <text class="version-label">当前版本</text>
        <text class="version-value">{{ runtime.appVersion }}</text>
      </view>
      <text class="version-code">Build {{ runtime.versionCode || '--' }}</text>
    </view>

    <view class="section-title"><text>线上更新</text></view>
    <view class="surface source-panel">
      <view class="segmented-control">
        <button class="segment" :class="{ active: settings.source === 'default' }" @click="setSource('default')">默认地址</button>
        <button class="segment" :class="{ active: settings.source === 'custom' }" @click="setSource('custom')">自定义地址</button>
      </view>

      <view v-if="settings.source === 'default'" class="address-box">
        <text class="address-caption">当前地址</text>
        <text class="address-value">{{ defaultUpdateUrl }}</text>
      </view>
      <view v-else class="custom-address">
        <textarea
          v-model="settings.customUrl"
          class="address-input"
          maxlength="500"
          placeholder="https://example.com/app-update/latest"
        />
        <button class="text-button" @click="restoreDefault">恢复默认地址</button>
      </view>

      <view class="action-row">
        <button class="secondary-button" @click="saveSettings">保存设置</button>
        <button class="primary-action" :disabled="checking || downloading" @click="checkOnlineUpdate">
          {{ checking ? '检测中...' : '检测更新' }}
        </button>
      </view>
    </view>

    <view v-if="status.message" class="status-strip" :class="`is-${status.type}`">
      <text>{{ status.message }}</text>
    </view>

    <view v-if="onlineUpdate?.available" class="surface release-panel">
      <view class="release-heading">
        <view>
          <text class="release-title">{{ onlineUpdate.title }}</text>
          <text class="release-version">{{ onlineUpdate.versionName }} · {{ packageTypeLabel }}</text>
        </view>
        <text v-if="onlineUpdate.mandatory" class="mandatory-badge">必须更新</text>
      </view>
      <text v-if="onlineUpdate.description" class="release-notes">{{ onlineUpdate.description }}</text>
      <view class="release-meta">
        <text>来源 {{ onlineUpdate.sourceHost }}</text>
        <text v-if="onlineUpdate.size">大小 {{ formatBytes(onlineUpdate.size) }}</text>
      </view>

      <view v-if="downloading" class="download-block">
        <view class="progress-line"><view class="progress-value" :style="{ width: `${downloadProgress}%` }"></view></view>
        <view class="progress-meta">
          <text>正在下载 {{ downloadProgress }}%</text>
          <button class="cancel-button" @click="cancelDownload">取消</button>
        </view>
      </view>
      <button v-else class="primary-action full-width" @click="startOnlineUpdate">{{ onlineActionLabel }}</button>
    </view>

    <view class="section-title"><text>本地更新</text></view>
    <view class="surface local-panel">
      <view class="local-summary">
        <view class="package-mark">PKG</view>
        <view>
          <text class="local-title">选择本地更新包</text>
          <text class="local-support">Android APK / WGT</text>
        </view>
      </view>
      <button class="secondary-button full-width" :disabled="installing || !canLocalUpdate" @click="selectLocalPackage">
        {{ installing ? '正在处理...' : canLocalUpdate ? '选择更新包' : '当前平台不可用' }}
      </button>
    </view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { onBackPress, onLoad } from '@dcloudio/uni-app'
import {
  checkForUpdate,
  chooseLocalUpdatePackage,
  createUpdateDownload,
  getActiveUpdateUrl,
  getDefaultUpdateUrl,
  getPackageType,
  getRuntimeInfo,
  getUpdateSettings,
  installUpdatePackage,
  openExternalUrl,
  saveUpdateSettings,
  verifyUpdatePackage
} from '../../utils/app-update'

const defaultUpdateUrl = getDefaultUpdateUrl()
const settings = reactive(getUpdateSettings())
const runtime = reactive({ appVersion: '--', versionCode: 0, platform: '' })
const status = reactive({ type: 'info', message: '' })
const checking = ref(false)
const downloading = ref(false)
const installing = ref(false)
const downloadProgress = ref(0)
const onlineUpdate = ref(null)
let activeDownload = null

const packageTypeLabel = computed(() => {
  if (onlineUpdate.value?.type === 'wgt') return '资源更新'
  if (onlineUpdate.value?.type === 'store') return '应用商店'
  return '完整安装包'
})
const canLocalUpdate = computed(() => runtime.platform === 'android')
const onlineActionLabel = computed(() => {
  if (runtime.platform === 'ios' || onlineUpdate.value?.type === 'store') return '前往更新'
  if (runtime.platform === 'web' || runtime.platform === 'h5') return '打开下载地址'
  return '下载并安装'
})

onLoad(async () => {
  Object.assign(runtime, await getRuntimeInfo())
})

onBeforeUnmount(() => activeDownload?.abort())

onBackPress(() => {
  if (onlineUpdate.value?.mandatory) {
    uni.showToast({ title: '请先完成必须更新', icon: 'none' })
    return true
  }
  return false
})

function setStatus(type, message) {
  status.type = type
  status.message = message
}

function setSource(source) {
  settings.source = source
  onlineUpdate.value = null
  setStatus('info', '')
}

function restoreDefault() {
  settings.source = 'default'
  settings.customUrl = ''
  saveUpdateSettings(settings)
  onlineUpdate.value = null
  uni.showToast({ title: '已恢复默认地址', icon: 'none' })
}

function saveSettings() {
  try {
    Object.assign(settings, saveUpdateSettings(settings))
    uni.showToast({ title: '设置已保存', icon: 'success' })
    return true
  } catch (error) {
    uni.showToast({ title: error.message, icon: 'none' })
    return false
  }
}

async function checkOnlineUpdate() {
  if (!saveSettings()) return
  checking.value = true
  onlineUpdate.value = null
  setStatus('info', '正在连接更新服务...')
  try {
    const result = await checkForUpdate(getActiveUpdateUrl(settings), runtime)
    onlineUpdate.value = result.available ? result : null
    setStatus(result.available ? 'update' : 'success', result.available ? `发现版本 ${result.versionName}` : result.message)
  } catch (error) {
    setStatus('error', error.message || '检测更新失败')
  } finally {
    checking.value = false
  }
}

function confirmAction(options) {
  return new Promise((resolve) => {
    uni.showModal({ ...options, success: ({ confirm }) => resolve(confirm), fail: () => resolve(false) })
  })
}

async function startOnlineUpdate() {
  const update = onlineUpdate.value
  if (!update) return

  if (runtime.platform === 'ios' || update.type === 'store' || ['web', 'h5'].includes(runtime.platform)) {
    openExternalUrl(update.storeUrl || update.packageUrl)
    return
  }

  const confirmed = await confirmAction({
    title: `更新到 ${update.versionName}`,
    content: update.mandatory ? '此版本为必须更新，是否立即下载并安装？' : '是否立即下载并安装此更新？',
    confirmText: '开始更新',
    confirmColor: '#21613c',
    showCancel: !update.mandatory
  })
  if (!confirmed) return

  downloading.value = true
  downloadProgress.value = 0
  setStatus('info', '正在下载安装包...')
  activeDownload = createUpdateDownload(update.packageUrl, (progress) => { downloadProgress.value = progress })
  try {
    const filePath = await activeDownload.promise
    downloading.value = false
    installing.value = true
    setStatus('info', '安装包已下载，正在校验...')
    await verifyUpdatePackage(filePath, update)
    setStatus('info', '校验通过，正在调用系统安装...')
    await installUpdatePackage(filePath, update.type)
    setStatus('success', update.type === 'wgt' ? '更新完成，应用即将重启' : '已打开系统安装界面')
  } catch (error) {
    setStatus('error', error.message || '更新失败')
  } finally {
    activeDownload = null
    downloading.value = false
    installing.value = false
  }
}

function cancelDownload() {
  activeDownload?.abort()
}

async function selectLocalPackage() {
  installing.value = true
  try {
    const file = await chooseLocalUpdatePackage()
    const type = getPackageType(file.name)
    const confirmed = await confirmAction({
      title: '安装本地更新',
      content: `${file.name}\n${formatBytes(file.size)}\n确认安装此更新包？`,
      confirmText: '安装',
      confirmColor: '#21613c'
    })
    if (!confirmed) return
    setStatus('info', '正在调用系统安装...')
    await installUpdatePackage(file.path, type)
    setStatus('success', type === 'wgt' ? '更新完成，应用即将重启' : '已打开系统安装界面')
  } catch (error) {
    if (error.message !== '已取消选择') setStatus('error', error.message || '本地更新失败')
  } finally {
    installing.value = false
  }
}

function formatBytes(bytes) {
  const value = Number(bytes || 0)
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
</script>

<style scoped lang="scss">
.update-page {
  min-height: 100vh;
  padding: 28rpx 28rpx calc(48rpx + env(safe-area-inset-bottom));
}

.version-band {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 30rpx 28rpx;
  border-left: 8rpx solid #f1c45e;
  background: #245839;
  color: #ffffff;
}

.version-label,
.version-value {
  display: block;
}

.version-label {
  color: #bed0c3;
  font-size: 22rpx;
}

.version-value {
  margin-top: 8rpx;
  font-size: 42rpx;
  font-weight: 800;
}

.version-code {
  color: #dbe6de;
  font-size: 23rpx;
}

.source-panel,
.release-panel,
.local-panel {
  padding: 24rpx;
}

.segmented-control {
  display: grid;
  height: 72rpx;
  grid-template-columns: 1fr 1fr;
  padding: 4rpx;
  border: 1rpx solid #d9e1da;
  border-radius: 8rpx;
  background: #eef2ee;
}

.segment {
  height: 62rpx;
  margin: 0;
  border-radius: 6rpx;
  background: transparent;
  color: #65706a;
  font-size: 25rpx;
  line-height: 62rpx;
}

.segment.active {
  background: #ffffff;
  color: #21613c;
  font-weight: 700;
}

.address-box,
.custom-address {
  margin-top: 22rpx;
}

.address-box {
  padding: 20rpx;
  border: 1rpx solid #e0e6e1;
  background: #f7f9f7;
}

.address-caption,
.address-value {
  display: block;
}

.address-caption {
  color: #7a847e;
  font-size: 21rpx;
}

.address-value {
  margin-top: 8rpx;
  overflow-wrap: anywhere;
  color: #33453a;
  font-size: 23rpx;
  line-height: 1.55;
}

.address-input {
  width: 100%;
  height: 140rpx;
  padding: 18rpx 20rpx;
  border: 1rpx solid #cfd9d1;
  border-radius: 6rpx;
  background: #ffffff;
  color: #27352d;
  font-size: 24rpx;
  line-height: 1.5;
}

.text-button {
  width: auto;
  height: 58rpx;
  margin: 8rpx 0 0 auto;
  padding: 0;
  background: transparent;
  color: #21613c;
  font-size: 23rpx;
  line-height: 58rpx;
}

.action-row {
  display: grid;
  margin-top: 24rpx;
  grid-template-columns: 1fr 1.4fr;
  gap: 16rpx;
}

.primary-action,
.secondary-button {
  height: 78rpx;
  margin: 0;
  border-radius: 8rpx;
  font-size: 26rpx;
  font-weight: 700;
  line-height: 78rpx;
}

.primary-action {
  background: #21613c;
  color: #ffffff;
}

.primary-action[disabled] {
  background: #9caf9f;
  color: #eef2ee;
}

.secondary-button {
  border: 1rpx solid #b8c8bc;
  background: #ffffff;
  color: #28583b;
}

.status-strip {
  margin-top: 20rpx;
  padding: 18rpx 20rpx;
  border-left: 6rpx solid #60816b;
  background: #e9efea;
  color: #3b5343;
  font-size: 24rpx;
  line-height: 1.5;
}

.status-strip.is-success {
  border-color: #2f774a;
  background: #e5f1e8;
  color: #21613c;
}

.status-strip.is-update {
  border-color: #b9770e;
  background: #fff1d5;
  color: #805200;
}

.status-strip.is-error {
  border-color: #a33f38;
  background: #f9e8e6;
  color: #913a34;
}

.release-panel {
  margin-top: 20rpx;
}

.release-heading,
.release-meta,
.progress-meta,
.local-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.release-title,
.release-version,
.local-title,
.local-support {
  display: block;
}

.release-title,
.local-title {
  color: #26372d;
  font-size: 28rpx;
  font-weight: 750;
}

.release-version,
.local-support {
  margin-top: 7rpx;
  color: #758079;
  font-size: 22rpx;
}

.mandatory-badge {
  flex: none;
  margin-left: 18rpx;
  padding: 7rpx 10rpx;
  border-radius: 4rpx;
  background: #f9e8e6;
  color: #9b3e37;
  font-size: 20rpx;
  font-weight: 700;
}

.release-notes {
  display: block;
  margin-top: 22rpx;
  color: #4e5e54;
  font-size: 24rpx;
  line-height: 1.7;
  white-space: pre-wrap;
}

.release-meta {
  margin-top: 20rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid #e4e9e5;
  color: #7a847e;
  font-size: 21rpx;
}

.full-width {
  width: 100%;
  margin-top: 24rpx;
}

.download-block {
  margin-top: 26rpx;
}

.progress-line {
  width: 100%;
  height: 12rpx;
  overflow: hidden;
  border-radius: 4rpx;
  background: #dfe6e0;
}

.progress-value {
  height: 100%;
  background: #2d7248;
  transition: width 0.2s ease;
}

.progress-meta {
  min-height: 62rpx;
  color: #617067;
  font-size: 22rpx;
}

.cancel-button {
  width: auto;
  height: 62rpx;
  margin: 0;
  padding: 0 4rpx;
  background: transparent;
  color: #9b3e37;
  font-size: 22rpx;
  line-height: 62rpx;
}

.local-summary {
  justify-content: flex-start;
}

.package-mark {
  display: flex;
  width: 84rpx;
  height: 70rpx;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
  border: 1rpx solid #cad7cd;
  border-radius: 6rpx;
  background: #edf2ee;
  color: #2d6643;
  font-size: 20rpx;
  font-weight: 800;
}
</style>
