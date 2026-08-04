<template>
  <view class="page-shell purchase-page">
    <view class="purchase-summary">
      <view><text class="summary-label">待到货</text><text class="summary-value">{{ pendingOrders.length }}<text class="summary-unit"> 单</text></text></view>
      <view><text class="summary-label">在途金额</text><text class="summary-money">{{ money(pendingAmount) }}</text></view>
      <view><text class="summary-label">低库存</text><text class="summary-value">{{ lowStockCount }}<text class="summary-unit"> 项</text></text></view>
    </view>

    <view class="action-row"><view><text class="action-title">采购单</text><text class="action-caption">到货确认后自动增加库存</text></view><button class="create-button" @click="openCreate">新建采购</button></view>

    <view v-if="showCreate" class="surface purchase-form">
      <view class="form-heading"><text>采购信息</text><text class="close-form" @click="showCreate = false">取消</text></view>
      <view class="form-field"><text class="field-label">采购农资</text><picker :range="inventoryLabels" :value="inventoryIndex" @change="selectInventory"><view class="picker-value">{{ selectedInventory?.name || '请选择农资' }}<text>›</text></view></picker></view>
      <view class="form-field"><text class="field-label">供应商</text><input v-model="form.supplier" maxlength="100" placeholder="输入供应商名称" /></view>
      <view class="form-grid">
        <view class="form-field"><text class="field-label">采购数量{{ selectedInventory ? `（${selectedInventory.unit}）` : '' }}</text><input v-model="form.quantity" type="digit" placeholder="0" /></view>
        <view class="form-field"><text class="field-label">含税单价（元）</text><input v-model="form.unitPrice" type="digit" placeholder="0.00" /></view>
      </view>
      <view class="form-grid">
        <view class="form-field"><text class="field-label">预计到货</text><picker mode="date" :value="form.expectedAt" @change="form.expectedAt = $event.detail.value"><view class="picker-value">{{ form.expectedAt }}<text>›</text></view></picker></view>
        <view class="form-field"><text class="field-label">采购人</text><input v-model="form.buyer" maxlength="40" /></view>
      </view>
      <view class="form-field"><text class="field-label">采购说明</text><textarea v-model="form.notes" maxlength="300" placeholder="可填写用途或到货要求" /></view>
      <view class="amount-line"><text>预计采购金额</text><text>{{ money(estimatedAmount) }}</text></view>
      <button class="primary-button submit-button" :loading="farmStore.purchaseSubmitting" :disabled="farmStore.purchaseSubmitting" @click="submitPurchase">创建采购单</button>
    </view>

    <view class="status-filter">
      <view v-for="item in filters" :key="item.value" class="filter-item" :class="{ active: statusFilter === item.value }" @click="statusFilter = item.value">{{ item.label }} {{ countByStatus(item.value) }}</view>
    </view>

    <view v-if="farmStore.purchasesLoading && !farmStore.purchases.length" class="loading-state">正在加载采购单...</view>
    <view v-else class="purchase-list">
      <view v-for="order in filteredOrders" :key="order.id" class="surface purchase-card">
        <view class="order-head"><view><text class="order-no">{{ order.orderNo }}</text><text class="supplier">{{ order.supplier }}</text></view><text class="status-badge" :class="order.status === 'received' ? 'is-green' : 'is-amber'">{{ order.status === 'received' ? '已入库' : '待到货' }}</text></view>
        <view class="item-band"><view><text class="item-name">{{ order.itemName }}</text><text class="item-note">{{ order.notes || '常规农资采购' }}</text></view><text class="item-quantity">{{ order.quantity }} {{ order.unit }}</text></view>
        <view class="order-meta"><view><text>采购金额</text><strong>{{ money(order.amount) }}</strong></view><view><text>预计到货</text><strong>{{ order.expectedAt }}</strong></view><view><text>采购人</text><strong>{{ order.buyer }}</strong></view></view>
        <button v-if="order.status === 'pending'" class="receive-button" :loading="farmStore.receivingPurchaseId === order.id" :disabled="farmStore.receivingPurchaseId !== null" @click="confirmReceive(order)">确认到货并入库</button>
        <text v-else class="received-line">入库时间 {{ formatDate(order.receivedAt) }}</text>
      </view>
      <view v-if="!filteredOrders.length" class="surface empty-state">当前状态下暂无采购单</view>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { useAuthStore } from '../../store/auth'
import { useFarmStore } from '../../store/farm'

const authStore = useAuthStore()
const farmStore = useFarmStore()
const showCreate = ref(false)
const statusFilter = ref('all')
const inventoryIndex = ref(0)
const filters = [{ label: '全部', value: 'all' }, { label: '待到货', value: 'pending' }, { label: '已入库', value: 'received' }]
const form = reactive({ inventoryItemId: '', supplier: '', quantity: '1', unitPrice: '0', expectedAt: addDays(7), buyer: operatorName(), notes: '' })
const inventoryLabels = computed(() => farmStore.inventory.map((item) => `${item.name}（${item.quantity} ${item.unit}）`))
const selectedInventory = computed(() => farmStore.inventory.find((item) => item.id === form.inventoryItemId))
const filteredOrders = computed(() => statusFilter.value === 'all' ? farmStore.purchases : farmStore.purchases.filter((item) => item.status === statusFilter.value))
const pendingOrders = computed(() => farmStore.purchases.filter((item) => item.status === 'pending'))
const pendingAmount = computed(() => pendingOrders.value.reduce((sum, item) => sum + Number(item.amount || 0), 0))
const lowStockCount = computed(() => farmStore.inventory.filter((item) => Number(item.quantity) <= Number(item.minimumStock)).length)
const estimatedAmount = computed(() => (Number(form.quantity) || 0) * (Number(form.unitPrice) || 0))

onShow(refresh)
onPullDownRefresh(async () => { await refresh(); uni.stopPullDownRefresh() })

async function refresh() {
  try { await farmStore.loadPurchases() } catch (error) { if (error.name !== 'UnauthorizedError') uni.showToast({ title: error.message || '采购单加载失败', icon: 'none' }) }
}
function operatorName() { const user = authStore.user || {}; return user.name || user.username || '系统管理员' }
function addDays(days) { const date = new Date(); date.setDate(date.getDate() + days); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function money(value) { return `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` }
function formatDate(value) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-' }
function countByStatus(status) { return status === 'all' ? farmStore.purchases.length : farmStore.purchases.filter((item) => item.status === status).length }
async function openCreate() {
  if (!farmStore.inventory.length) await refresh()
  if (!farmStore.inventory.length) return uni.showToast({ title: '暂无可采购农资，请先在桌面端建立农资档案', icon: 'none' })
  inventoryIndex.value = 0
  Object.assign(form, { inventoryItemId: farmStore.inventory[0]?.id || '', supplier: '', quantity: '1', unitPrice: '0', expectedAt: addDays(7), buyer: operatorName(), notes: '' })
  showCreate.value = true
}
function selectInventory(event) { inventoryIndex.value = Number(event.detail.value); form.inventoryItemId = farmStore.inventory[inventoryIndex.value]?.id || '' }
async function submitPurchase() {
  const quantity = Number(form.quantity); const unitPrice = Number(form.unitPrice)
  if (!form.inventoryItemId || !form.supplier.trim() || !form.buyer.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) return uni.showToast({ title: '请完整填写有效的采购信息', icon: 'none' })
  try { await farmStore.createPurchase({ ...form, quantity, unitPrice }); showCreate.value = false; uni.showToast({ title: '采购单已创建', icon: 'success' }) } catch (error) { if (error.name !== 'UnauthorizedError') uni.showToast({ title: error.message || '创建失败', icon: 'none' }) }
}
function confirmReceive(order) {
  uni.showModal({ title: '确认到货', content: `确认 ${order.quantity} ${order.unit}“${order.itemName}”已全部到货并入库？`, confirmColor: '#21613c', success: async ({ confirm }) => {
    if (!confirm) return
    try { await farmStore.receivePurchase(order, operatorName()); uni.showToast({ title: farmStore.purchaseSyncError || '库存已更新', icon: farmStore.purchaseSyncError ? 'none' : 'success' }) } catch (error) { if (error.name !== 'UnauthorizedError') uni.showToast({ title: error.message || '入库失败', icon: 'none' }) }
  } })
}
</script>

<style scoped lang="scss">
.purchase-page { padding-top: 24rpx; }.purchase-summary { display: grid; grid-template-columns: repeat(3, 1fr); padding: 26rpx 12rpx; border-radius: 8rpx; background: #245839; color: #fff; }.purchase-summary > view { min-width: 0; padding: 0 18rpx; border-right: 1rpx solid #557a62; }.purchase-summary > view:last-child { border-right: 0; }.summary-label, .summary-value, .summary-money { display: block; }.summary-label { color: #bed1c3; font-size: 20rpx; }.summary-value { margin-top: 7rpx; font-size: 38rpx; font-weight: 800; }.summary-money { overflow: hidden; margin-top: 12rpx; font-size: 26rpx; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }.summary-unit { font-size: 20rpx; font-weight: 500; }.action-row { display: flex; align-items: center; justify-content: space-between; margin: 32rpx 0 18rpx; }.action-title, .action-caption { display: block; }.action-title { font-size: 32rpx; font-weight: 800; }.action-caption { margin-top: 5rpx; color: #748078; font-size: 21rpx; }.create-button { height: 64rpx; margin: 0; padding: 0 22rpx; border-radius: 6rpx; background: #21613c; color: #fff; font-size: 24rpx; line-height: 64rpx; }.purchase-form { margin-bottom: 20rpx; padding: 24rpx; }.form-heading { display: flex; justify-content: space-between; margin-bottom: 22rpx; font-size: 29rpx; font-weight: 800; }.close-form { color: #8b5e19; font-size: 23rpx; font-weight: 600; }.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18rpx; }.form-field { min-width: 0; margin-bottom: 20rpx; }.field-label { display: block; margin-bottom: 9rpx; color: #657169; font-size: 21rpx; }.form-field input, .picker-value, .form-field textarea { width: 100%; border: 1rpx solid #d8dfd9; border-radius: 6rpx; background: #fbfcfb; font-size: 25rpx; }.form-field input, .picker-value { height: 72rpx; padding: 0 18rpx; line-height: 72rpx; }.picker-value { display: flex; justify-content: space-between; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.form-field textarea { height: 120rpx; padding: 16rpx 18rpx; }.amount-line { display: flex; justify-content: space-between; padding: 17rpx 0; border-top: 1rpx solid #e2e7e3; color: #5f6b63; font-size: 23rpx; }.amount-line text:last-child { color: #235d3a; font-size: 28rpx; font-weight: 800; }.submit-button { margin-top: 10rpx; }.status-filter { display: grid; grid-template-columns: repeat(3, 1fr); margin-bottom: 18rpx; padding: 6rpx; border: 1rpx solid #dce3dd; border-radius: 8rpx; background: #fff; }.filter-item { height: 60rpx; border-radius: 6rpx; color: #657068; font-size: 23rpx; line-height: 60rpx; text-align: center; }.filter-item.active { background: #e6f0e8; color: #205d3a; font-weight: 800; }.purchase-card { margin-bottom: 18rpx; overflow: hidden; }.order-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18rpx; padding: 24rpx; }.order-head > view { min-width: 0; flex: 1; }.order-no, .supplier, .item-name, .item-note { display: block; }.order-no { font-size: 29rpx; font-weight: 800; }.supplier { overflow: hidden; margin-top: 5rpx; color: #758078; font-size: 21rpx; text-overflow: ellipsis; white-space: nowrap; }.item-band { display: flex; align-items: center; justify-content: space-between; gap: 18rpx; padding: 20rpx 24rpx; border-top: 1rpx solid #e4e8e5; border-bottom: 1rpx solid #e4e8e5; background: #f8faf8; }.item-band > view { min-width: 0; }.item-name { font-size: 27rpx; font-weight: 800; }.item-note { max-width: 390rpx; overflow: hidden; margin-top: 5rpx; color: #7b857f; font-size: 20rpx; text-overflow: ellipsis; white-space: nowrap; }.item-quantity { flex: 0 0 auto; color: #245f3b; font-size: 28rpx; font-weight: 800; }.order-meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10rpx; padding: 20rpx 24rpx; }.order-meta view { min-width: 0; }.order-meta text, .order-meta strong { display: block; }.order-meta text { color: #7b857f; font-size: 19rpx; }.order-meta strong { overflow: hidden; margin-top: 5rpx; font-size: 22rpx; text-overflow: ellipsis; white-space: nowrap; }.receive-button { height: 70rpx; margin: 0 24rpx 22rpx; border: 1rpx solid #39764c; border-radius: 6rpx; background: #fff; color: #21613c; font-size: 25rpx; font-weight: 800; line-height: 68rpx; }.received-line { display: block; margin: 0 24rpx 22rpx; color: #557362; font-size: 21rpx; text-align: right; }
</style>
