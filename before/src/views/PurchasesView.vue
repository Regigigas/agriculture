<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDialog, useMessage } from 'naive-ui'
import { CircleDollarSign, FileClock, PackageCheck, Plus, ShoppingCart, Truck } from '@/icons/iconpark'
import { useAuthStore } from '@/stores/auth'
import { useFarmStore } from '@/stores/farm'
import { useProductionStore } from '@/stores/production'
import type { CreatePurchaseInput, PurchaseOrder, PurchaseStatus } from '@/types'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import TableActions from '@/components/TableActions.vue'
import type { TableAction } from '@/components/table-actions'
import { formatCents, multiplyToCents, yuanToCents } from '@/types/money'

const farm = useFarmStore()
const production = useProductionStore()
const router = useRouter()
const auth = useAuthStore()
const dialog = useDialog()
const message = useMessage()
const showCreate = ref(false)
const statusFilter = ref<'all' | PurchaseStatus>('all')
const form = reactive<Omit<CreatePurchaseInput, 'quantity' | 'unitPrice'> & { quantity: number | null; unitPrice: number | null }>({ inventoryItemId: '', quantity: 1, unitPrice: 0, supplier: '', expectedAt: addDays(7), buyer: operatorName(), notes: '' })
const inventoryOptions = computed(() => farm.inventory.map((item) => ({ label: `${item.name}（库存 ${item.quantity} ${item.unit}）`, value: item.id })))
const selectedItem = computed(() => farm.inventory.find((item) => item.id === form.inventoryItemId))
const filtered = computed(() => statusFilter.value === 'all' ? farm.purchases : farm.purchases.filter((item) => item.status === statusFilter.value))
const pending = computed(() => farm.purchases.filter((item) => item.status === 'pending'))
const pendingAmount = computed(() => pending.value.reduce((sum, item) => sum + item.amount, 0))
const receivedAmount = computed(() => farm.purchases.filter((item) => item.status === 'received').reduce((sum, item) => sum + item.amount, 0))
const estimatedAmount = computed(() => multiplyToCents(form.quantity || 0, yuanToCents(form.unitPrice || 0)))

function operatorName() { return auth.user?.name || auth.user?.username || '系统管理员' }
function addDays(days: number) { const date = new Date(); date.setDate(date.getDate() + days); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
const money = (value: number) => formatCents(value)
async function openCreate() { if (!farm.inventory.length) { try { await farm.loadInventory() } catch { return message.error(farm.errors.inventory) } }; Object.assign(form, { inventoryItemId: '', quantity: 1, unitPrice: 0, supplier: '', expectedAt: addDays(7), buyer: operatorName(), notes: '' }); showCreate.value = true }
async function createPurchase() {
  const quantity = form.quantity; const unitPrice = form.unitPrice
  if (!form.inventoryItemId || !form.supplier.trim() || !form.buyer.trim() || !form.expectedAt || quantity === null || !Number.isFinite(quantity) || quantity <= 0 || unitPrice === null || !Number.isFinite(unitPrice) || unitPrice < 0) return message.warning('请完整填写有效的采购信息')
  try { await farm.createPurchase({ ...form, quantity, unitPrice: yuanToCents(unitPrice) }); showCreate.value = false; message.success('采购单已创建') } catch { message.error(farm.errors.purchaseMutation) }
}
function receive(item: PurchaseOrder) {
  dialog.warning({ title: '确认到货入库', content: `确认 ${item.orderNo} 的 ${item.quantity} ${item.unit}“${item.itemName}”已全部到货？确认后将增加库存。`, positiveText: '确认入库', negativeText: '取消', onPositiveClick: async () => {
    try { await farm.receivePurchase(item.id, operatorName()); if (farm.errors.inventory || farm.errors.inventoryTransactions) message.warning('到货已确认，但库存数据刷新失败，请稍后重试'); else message.success('到货已确认，库存已更新') } catch { message.error(farm.errors.purchaseMutation) }
  } })
}
function purchaseActions(item: PurchaseOrder): TableAction[] {
  const hasInvoice = production.invoices.some((invoice) => invoice.sourceType === 'purchase' && invoice.sourceId === String(item.id) && invoice.status !== 'voided')
  const actions: TableAction[] = [{ key: 'invoice', label: hasInvoice ? '查看发票' : '收票', icon: FileClock, secondary: true, onClick: () => router.push({ path: '/invoices', query: { sourceType: 'purchase', sourceId: String(item.id) } }) }]
  if (item.status === 'pending') actions.unshift({ key: 'receive', label: '确认到货', icon: PackageCheck, type: 'primary', loading: farm.loading.purchaseMutation, onClick: () => receive(item) })
  return actions
}
onMounted(() => Promise.allSettled([farm.loadPurchases(), farm.loadInventory(), production.loadInvoices()]))
</script>

<template>
  <page-header title="采购管理" description="建立农资采购单，跟踪供应商、金额、到货和库存入账"><n-button type="primary" @click="openCreate"><template #icon><Plus /></template>新建采购单</n-button></page-header>
  <div class="domain-kpis"><div><span class="domain-kpi-icon amber"><Truck /></span><small>待到货</small><strong>{{ pending.length }}</strong><em>张采购单</em></div><div><span class="domain-kpi-icon blue"><CircleDollarSign /></span><small>待到货金额</small><strong>{{ money(pendingAmount) }}</strong><em>采购在途</em></div><div><span class="domain-kpi-icon"><PackageCheck /></span><small>累计到货金额</small><strong>{{ money(receivedAmount) }}</strong><em>已确认入库</em></div></div>
  <div class="filter-bar purchase-filter"><n-input value="" readonly placeholder="采购单按创建时间倒序展示"><template #prefix><ShoppingCart :size="17" /></template></n-input><n-select v-model:value="statusFilter" :options="[{label:'全部状态',value:'all'},{label:'待到货',value:'pending'},{label:'已入库',value:'received'}]" /></div>
  <state-panel :loading="farm.loading.purchases" :error="farm.errors.purchases" :empty="!filtered.length" empty-text="当前没有采购单" @retry="farm.loadPurchases">
    <div class="table-wrap purchase-table action-table"><n-table :single-line="false"><thead><tr><th>采购单</th><th>供应商</th><th>采购农资</th><th>数量</th><th>单价 / 金额</th><th>预计到货</th><th>采购人</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="item in filtered" :key="item.id"><td><strong>{{ item.orderNo }}</strong><small class="cell-detail">{{ new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</small></td><td>{{ item.supplier }}<small class="cell-detail">{{ item.notes || '无备注' }}</small></td><td>{{ item.itemName }}</td><td>{{ item.quantity }} {{ item.unit }}</td><td>{{ money(item.unitPrice) }}<small class="cell-detail">合计 {{ money(item.amount) }}</small></td><td>{{ item.expectedAt }}</td><td>{{ item.buyer }}</td><td><n-tag size="small" :type="item.status === 'received' ? 'success' : 'warning'">{{ item.status === 'received' ? '已入库' : '待到货' }}</n-tag></td><td><table-actions :actions="purchaseActions(item)" :empty-text="item.receivedAt ? new Date(item.receivedAt).toLocaleDateString('zh-CN') : '-'" /></td></tr></tbody></n-table></div>
  </state-panel>
  <n-modal v-model:show="showCreate" preset="card" title="新建采购单" class="form-modal purchase-modal" :bordered="false"><n-form :model="form" label-placement="top"><div class="form-grid"><n-form-item label="采购农资" required><n-select v-model:value="form.inventoryItemId" filterable :options="inventoryOptions" placeholder="选择库存农资" /></n-form-item><n-form-item label="供应商" required><n-input v-model:value="form.supplier" maxlength="100" placeholder="输入供应商名称" /></n-form-item><n-form-item :label="selectedItem ? `采购数量（${selectedItem.unit}）` : '采购数量'" required><n-input-number v-model:value="form.quantity" :min="0.01" :max="1000000" :precision="2" /></n-form-item><n-form-item label="含税单价"><n-input-number v-model:value="form.unitPrice" :min="0" :max="1000000" :precision="2" /></n-form-item><n-form-item label="预计到货日期" required><n-date-picker v-model:formatted-value="form.expectedAt" value-format="yyyy-MM-dd" type="date" /></n-form-item><n-form-item label="采购人" required><n-input v-model:value="form.buyer" maxlength="40" /></n-form-item></div><n-alert type="info" :bordered="false">预计采购金额：{{ money(estimatedAmount) }}</n-alert><n-form-item class="purchase-notes" label="采购说明"><n-input v-model:value="form.notes" type="textarea" :rows="3" maxlength="300" /></n-form-item><div class="modal-actions"><n-button @click="showCreate = false">取消</n-button><n-button type="primary" :loading="farm.loading.purchaseMutation" @click="createPurchase">创建采购单</n-button></div></n-form></n-modal>
</template>

<style scoped>
.purchase-table .n-table { min-width: 1120px; }.purchase-modal { width: min(680px, calc(100vw - 32px)); }.purchase-notes { margin-top: 14px; }
</style>
