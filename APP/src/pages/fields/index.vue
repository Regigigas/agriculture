<template>
  <view class="page-shell field-page">
    <view class="field-summary">
      <view>
        <text class="summary-label">纳管地块</text>
        <text class="summary-value">{{ farmStore.fields.length }}<text class="summary-unit"> 块</text></text>
      </view>
      <view class="summary-divider"></view>
      <view>
        <text class="summary-label">总面积</text>
        <text class="summary-value">{{ totalArea }}<text class="summary-unit"> 亩</text></text>
      </view>
    </view>

    <view class="section-title">
      <text>地块档案</text>
      <text class="section-count">实时状态</text>
    </view>

    <view v-if="farmStore.loading && !farmStore.fields.length" class="loading-state">正在加载地块...</view>
    <view v-else class="field-list">
      <view v-for="field in farmStore.fields" :key="field.id" class="field-card surface" hover-class="field-card-pressed" @click="openScene(field)">
        <view class="field-head">
          <view class="field-code">{{ field.code || field.id }}</view>
          <view class="field-title-wrap">
            <text class="field-name">{{ field.name }}</text>
            <text class="field-location">{{ field.location || field.zone || '位置未标注' }}</text>
          </view>
          <text class="status-badge" :class="fieldStatusClass(field.status)">{{ fieldStatusText(field.status) }}</text>
        </view>
        <view class="crop-band">
          <view class="crop-symbol">禾</view>
          <view class="crop-content">
            <text class="crop-label">当前作物</text>
            <text class="crop-name">{{ field.crop || field.cropName || field.crop_name || '未种植' }}</text>
          </view>
          <view class="area-content">
            <text class="crop-label">地块面积</text>
            <text class="area-value">{{ field.area ?? '--' }} {{ field.areaUnit || field.area_unit || '亩' }}</text>
          </view>
        </view>
        <view class="growth-row">
          <text class="growth-label">生长阶段</text>
          <view class="growth-track"><view class="growth-progress" :style="{ width: growthPercent(field) + '%' }"></view></view>
          <text class="growth-stage">{{ growthStage(field) }}</text>
        </view>
        <view class="scene-entry"><text>查看三维地块</text><text class="scene-arrow">›</text></view>
        <button v-if="isAdmin && field.crop && field.status !== 'fallow'" class="uproot-button" @click.stop="openUproot(field)">挖除作物</button>
      </view>
      <view v-if="!farmStore.fields.length" class="surface empty-state">暂无地块数据</view>
    </view>

    <view v-if="uproot.show" class="modal-mask" @click.self="closeUproot">
      <view class="uproot-modal surface">
        <text class="uproot-title">挖除作物多重验证</text>
        <text class="uproot-warning">将挖除“{{ uproot.field?.name }}”的“{{ uproot.field?.crop }}”并转为休耕，操作记录会保留。</text>
        <text class="modal-label">挖除原因</text>
        <textarea v-model.trim="uproot.reason" class="modal-textarea" maxlength="300" placeholder="说明病害、改种或其他原因" />
        <text class="modal-label">当前管理员密码</text>
        <input v-model="uproot.currentPassword" class="modal-input" password placeholder="请输入当前密码" />
        <text class="modal-label">确认短语 UPROOT CROP</text>
        <input v-model.trim="uproot.confirmation" class="modal-input" placeholder="UPROOT CROP" />
        <view class="modal-actions"><button class="cancel-button" :disabled="uproot.busy" @click="closeUproot">取消</button><button class="danger-button" :disabled="!canUproot || uproot.busy" @click="confirmUproot">{{ uproot.busy ? '正在验证...' : '验证并挖除' }}</button></view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { authorizeOperation } from '../../api/auth'
import { useAuthStore } from '../../store/auth'
import { useFarmStore } from '../../store/farm'

const farmStore = useFarmStore()
const authStore = useAuthStore()
const totalArea = computed(() => farmStore.fields.reduce((sum, field) => sum + (Number(field.area) || 0), 0).toFixed(1).replace('.0', ''))
const isAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'admin')
const uproot = reactive({ show: false, field: null, reason: '', currentPassword: '', confirmation: '', busy: false })
const canUproot = computed(() => uproot.reason.length >= 4 && uproot.currentPassword && uproot.confirmation === 'UPROOT CROP')

onShow(refresh)
onPullDownRefresh(async () => {
  await refresh()
  uni.stopPullDownRefresh()
})

async function refresh() {
  authStore.restoreSession()
  try {
    await farmStore.loadFields()
  } catch (error) {
    if (error.name !== 'UnauthorizedError') uni.showToast({ title: error.message || '地块加载失败', icon: 'none' })
  }
}

function openUproot(field) {
  Object.assign(uproot, { show: true, field, reason: '', currentPassword: '', confirmation: '', busy: false })
}

function closeUproot() {
  if (!uproot.busy) uproot.show = false
}

async function confirmUproot() {
  if (!canUproot.value || uproot.busy) return
  uproot.busy = true
  try {
    const result = await authorizeOperation({ currentPassword: uproot.currentPassword, operation: 'uproot-crop', confirmation: uproot.confirmation })
    const authorization = result?.data || result
    await farmStore.uproot(uproot.field, uproot.reason, authorization.token)
    uproot.show = false
    uni.showToast({ title: '作物已挖除', icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error.message || '挖除作物失败', icon: 'none' })
  } finally {
    uproot.busy = false
  }
}

function fieldStatusText(status) {
  return ({ normal: '正常', healthy: '长势良好', attention: '需关注', warning: '需关注', abnormal: '异常', idle: '休耕', fallow: '休耕' })[status] || status || '正常'
}

function openScene(field) {
  uni.navigateTo({ url: `/pages/fields/scene?id=${encodeURIComponent(field.id)}` })
}

function fieldStatusClass(status) {
  if (['attention', 'warning', 'abnormal'].includes(status)) return 'is-amber'
  if (['idle', 'fallow'].includes(status)) return 'is-gray'
  return 'is-green'
}

function growthPercent(field) {
  if (field.status === 'fallow') return 0
  const planted = Date.parse(field.plantedAt)
  const harvest = Date.parse(field.expectedHarvestAt)
  if (!Number.isFinite(planted) || !Number.isFinite(harvest) || harvest <= planted) return 45
  return Math.max(5, Math.min(100, Math.round((Date.now() - planted) / (harvest - planted) * 100)))
}

function growthStage(field) {
  if (field.status === 'fallow') return '休耕'
  const progress = growthPercent(field)
  if (progress < 20) return '苗期'
  if (progress < 60) return '生长期'
  if (progress < 85) return '成熟期'
  return '采收期'
}
</script>

<style scoped lang="scss">
.field-page {
  padding-top: 24rpx;
}

.field-summary {
  display: grid;
  grid-template-columns: 1fr 1rpx 1fr;
  align-items: center;
  padding: 28rpx 34rpx;
  border-radius: 8rpx;
  background: #245839;
  color: #ffffff;
}

.field-summary > view:last-child {
  padding-left: 36rpx;
}

.summary-label,
.summary-value {
  display: block;
}

.summary-label {
  margin-bottom: 7rpx;
  color: #bfd1c4;
  font-size: 22rpx;
}

.summary-value {
  font-size: 42rpx;
  font-weight: 800;
}

.summary-unit {
  font-size: 22rpx;
  font-weight: 500;
}

.summary-divider {
  width: 1rpx;
  height: 72rpx;
  background: #557a62;
}

.field-card {
  overflow: hidden;
  margin-bottom: 18rpx;
}

.field-card-pressed { opacity: 0.82; }
.uproot-button { height: 66rpx; margin: 0; border-radius: 0; border-top: 1rpx solid #ead7d4; background: #fff7f6; color: #a43e37; font-size: 24rpx; line-height: 66rpx; }.modal-mask { position: fixed; z-index: 30; inset: 0; display: flex; align-items: center; justify-content: center; padding: calc(30rpx + env(safe-area-inset-top)) 30rpx calc(30rpx + env(safe-area-inset-bottom)); background: rgba(16,28,21,.58); }.uproot-modal { width: 100%; max-width: 680rpx; max-height: 86vh; overflow-y: auto; padding: 34rpx 30rpx; }.uproot-title, .uproot-warning, .modal-label { display: block; }.uproot-title { font-size: 32rpx; font-weight: 800; }.uproot-warning { margin: 14rpx 0 26rpx; padding: 18rpx; border-left: 6rpx solid #a43e37; background: #fff2f0; color: #7d3732; font-size: 23rpx; line-height: 1.55; }.modal-label { margin: 20rpx 0 10rpx; color: #425148; font-size: 24rpx; font-weight: 700; }.modal-input, .modal-textarea { width: 100%; box-sizing: border-box; padding: 0 20rpx; border: 1rpx solid #c9d2cb; border-radius: 6rpx; background: #f9faf9; font-size: 26rpx; }.modal-input { height: 78rpx; }.modal-textarea { height: 130rpx; padding-top: 16rpx; }.modal-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 16rpx; margin-top: 30rpx; }.modal-actions button { height: 76rpx; margin: 0; border-radius: 6rpx; font-size: 25rpx; line-height: 76rpx; }.cancel-button { background: #eef1ef; color: #526158; }.danger-button { background: #a43e37; color: #fff; }

.field-head {
  display: flex;
  align-items: center;
  padding: 24rpx;
}

.field-code {
  display: flex;
  width: 66rpx;
  height: 66rpx;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  margin-right: 18rpx;
  border-radius: 6rpx;
  background: #e5efe7;
  color: #28613d;
  font-size: 20rpx;
  font-weight: 800;
}

.field-title-wrap {
  min-width: 0;
  flex: 1;
}

.field-name,
.field-location {
  display: block;
}

.field-name {
  font-size: 30rpx;
  font-weight: 800;
}

.field-location {
  margin-top: 5rpx;
  color: #7a847e;
  font-size: 21rpx;
}

.crop-band {
  display: flex;
  align-items: center;
  padding: 20rpx 24rpx;
  border-top: 1rpx solid #e4e8e5;
  border-bottom: 1rpx solid #e4e8e5;
  background: #f8faf8;
}

.crop-symbol {
  display: flex;
  width: 54rpx;
  height: 54rpx;
  align-items: center;
  justify-content: center;
  margin-right: 16rpx;
  border-radius: 6rpx;
  background: #fff0cf;
  color: #93600c;
  font-size: 24rpx;
  font-weight: 800;
}

.crop-content {
  min-width: 0;
  flex: 1;
}

.area-content {
  text-align: right;
}

.crop-label,
.crop-name,
.area-value {
  display: block;
}

.crop-label {
  color: #7a847e;
  font-size: 20rpx;
}

.crop-name,
.area-value {
  margin-top: 5rpx;
  font-size: 26rpx;
  font-weight: 700;
}

.growth-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 18rpx;
  align-items: center;
  padding: 22rpx 24rpx;
}

.growth-label,
.growth-stage {
  color: #66716a;
  font-size: 21rpx;
}

.growth-stage {
  color: #315d40;
  font-weight: 700;
}

.growth-track {
  height: 10rpx;
  overflow: hidden;
  border-radius: 5rpx;
  background: #dfe5e0;
}

.growth-progress {
  height: 100%;
  border-radius: 5rpx;
  background: #4c825b;
}

.scene-entry { display: flex; height: 72rpx; align-items: center; justify-content: flex-end; padding: 0 24rpx; border-top: 1rpx solid #e4e8e5; color: #25613c; font-size: 23rpx; font-weight: 700; }
.scene-arrow { margin-left: 12rpx; color: #77857b; font-size: 34rpx; line-height: 1; }
</style>
