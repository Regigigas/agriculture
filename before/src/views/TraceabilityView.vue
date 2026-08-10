<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDialog, useMessage } from 'naive-ui'
import { BadgeCheck, CircleDollarSign, FileClock, PackageCheck, Plus, QrCode, Search, Truck, Warehouse } from '@/icons/iconpark'
import { useFarmStore } from '@/stores/farm'
import { useProductionStore } from '@/stores/production'
import type { HarvestBatch } from '@/types'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import TableActions from '@/components/TableActions.vue'
import type { TableAction } from '@/components/table-actions'
import { formatCents, multiplyToCents, yuanToCents } from '@/types/money'

const farm = useFarmStore()
const production = useProductionStore()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const showHarvest = ref(false)
const showSale = ref(false)
const showQuality = ref(false)
const qualityBatch = ref<HarvestBatch | null>(null)
const qualityForm = reactive({ qualityStatus: 'passed' as 'passed' | 'rejected', inspector: '', notes: '' })
const today = localDateKey()
const harvestForm = reactive({ cycleId: '', grade: '', quantity: 1000, unit: 'kg', harvestedAt: today, warehouse: '', notes: '' })
const saleForm = reactive({ harvestBatchId: '', customer: '', quantity: 1000, unitPrice: 2.5, soldAt: today, notes: '' })
const traceCode = ref('TRACE-2026-WHEAT-001')
const cycleOptions = computed(() => production.cycles.filter((item) => ['in_progress', 'harvesting'].includes(item.status)).map((item) => ({ label: `${item.code} · ${item.crop} · ${fieldName(item.fieldId)}`, value: item.id })))
const soldQuantity = (batchId: string) => production.sales.filter((item) => item.harvestBatchId === batchId).reduce((sum, item) => sum + item.quantity, 0)
const remainingQuantity = (item: HarvestBatch) => Math.max(0, Math.round((item.quantity - soldQuantity(item.id)) * 10000) / 10000)
const batchOptions = computed(() => production.harvests.filter((item) => item.qualityStatus === 'passed' && remainingQuantity(item) > 0).map((item) => ({ label: `${item.batchCode} · ${item.product} · 可售 ${remainingQuantity(item)}${item.unit}`, value: item.id })))
const selectedBatchRemaining = computed(() => remainingQuantity(production.harvests.find((item) => item.id === saleForm.harvestBatchId) || { id: '', quantity: 0 } as HarvestBatch))
const selectedBatch = computed(() => production.harvests.find((item) => item.id === saleForm.harvestBatchId))
const saleUnitPriceCents = computed(() => yuanToCents(saleForm.unitPrice))
const saleAmount = computed(() => multiplyToCents(saleForm.quantity, saleUnitPriceCents.value))
const selectedCycle = computed(() => production.cycles.find((item) => item.id === selectedBatch.value?.cycleId))
const selectedInitialCost = computed(() => selectedCycle.value?.budget || 0)
const selectedProcessCost = computed(() => selectedCycle.value ? cycleProcessCost(selectedCycle.value.id) : 0)
const previousCycleRevenue = computed(() => selectedCycle.value ? cycleRevenue(selectedCycle.value.id) : 0)
const cumulativeRevenueAfterSale = computed(() => previousCycleRevenue.value + saleAmount.value)
const actualProfitAfterSale = computed(() => cumulativeRevenueAfterSale.value - selectedInitialCost.value - selectedProcessCost.value)
const remainingCycleQuantityAfterSale = computed(() => {
  if (!selectedCycle.value) return 0
  const batchIds = new Set(production.harvests.filter((item) => item.cycleId === selectedCycle.value?.id && item.qualityStatus === 'passed').map((item) => item.id))
  const sellable = production.harvests.filter((item) => batchIds.has(item.id)).reduce((sum, item) => sum + item.quantity, 0)
  const sold = production.sales.filter((item) => batchIds.has(item.harvestBatchId)).reduce((sum, item) => sum + item.quantity, 0)
  return Math.max(0, sellable - sold - saleForm.quantity)
})
const projectedProfitAfterSale = computed(() => cumulativeRevenueAfterSale.value + multiplyToCents(remainingCycleQuantityAfterSale.value, saleUnitPriceCents.value) - selectedInitialCost.value - selectedProcessCost.value)
const harvestTotal = computed(() => production.harvests.reduce((sum, item) => sum + item.quantity, 0))
const salesRevenue = computed(() => production.sales.reduce((sum, item) => sum + item.amount, 0))
const receivables = computed(() => production.sales.filter((item) => item.paymentStatus !== 'paid').reduce((sum, item) => sum + item.amount, 0))
const settledCycleIds = computed(() => new Set(production.sales.map((sale) => production.harvests.find((batch) => batch.id === sale.harvestBatchId)?.cycleId).filter(Boolean)))
const settledCosts = computed(() => production.cycles.filter((cycle) => settledCycleIds.value.has(cycle.id)).reduce((sum, cycle) => sum + cycle.budget + cycleProcessCost(cycle.id), 0))
const realizedProfit = computed(() => salesRevenue.value - settledCosts.value)
const fieldName = (id: string | number) => farm.fields.find((item) => item.id === id)?.name || '未知地块'
const cycleName = (id: string) => production.cycles.find((item) => item.id === id)?.code || '未知种植季'
const batchName = (id: string) => production.harvests.find((item) => item.id === id)?.batchCode || '未知批次'
function cycleProcessCost(cycleId: string) { return production.logs.filter((item) => item.cycleId === cycleId).reduce((sum, item) => sum + item.cost, 0) + production.costAdjustments.filter((item) => item.cycleId === cycleId).reduce((sum, item) => sum + (item.type === 'supplement' ? item.amount : -item.amount), 0) }
function cycleRevenue(cycleId: string) {
  const batchIds = new Set(production.harvests.filter((item) => item.cycleId === cycleId).map((item) => item.id))
  return production.sales.filter((item) => batchIds.has(item.harvestBatchId)).reduce((sum, item) => sum + item.amount, 0)
}
function localDateKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const money = (value: number) => formatCents(value)

async function createHarvest() {
  if (!harvestForm.cycleId || !harvestForm.warehouse.trim()) return message.warning('请选择种植季并填写入库仓位')
  try { await production.createHarvest({ ...harvestForm }); showHarvest.value = false; message.success('采收批次已建立并生成追溯码') } catch { message.error(production.errors.harvestMutation) }
}
function openQuality(item: HarvestBatch) { qualityBatch.value = item; Object.assign(qualityForm, { qualityStatus: 'passed', inspector: '', notes: '' }); showQuality.value = true }
async function submitQuality() {
  if (!qualityBatch.value || !qualityForm.inspector.trim()) return message.warning('请填写质检人员')
  try { await production.updateHarvestQuality(qualityBatch.value.id, qualityForm.qualityStatus, qualityForm.inspector, qualityForm.notes); showQuality.value = false; message.success('质检结果已登记') } catch { message.error(production.errors.harvestMutation) }
}
function createSale() {
  if (!saleForm.harvestBatchId || !saleForm.customer.trim()) return message.warning('请选择合格批次并填写客户')
  if (saleForm.quantity <= 0 || selectedBatchRemaining.value <= 0 || saleForm.quantity > selectedBatchRemaining.value) return message.warning('销售数量必须大于 0 且不能超过批次可售余量')
  if (saleForm.unitPrice < 0) return message.warning('销售单价不能小于 0')
  const snapshot = { ...saleForm, unitPrice: saleUnitPriceCents.value }
  dialog.warning({
    title: '确认出售',
    content: `确认将 ${selectedBatch.value?.batchCode || '该批次'} 的 ${snapshot.quantity} ${selectedBatch.value?.unit || 'kg'} 出售给“${snapshot.customer}”？本单 ${money(saleAmount.value)}；扣除初始成本和过程成本后，真实利润 ${money(actualProfitAfterSale.value)}，剩余产品按本次售价估算的预估利润 ${money(projectedProfitAfterSale.value)}。`,
    positiveText: '确认出售并生成记录',
    negativeText: '返回修改',
    onPositiveClick: async () => {
      try { await production.createSale(snapshot); showSale.value = false; resetSaleForm(); message.success('出售成功，销售订单记录已生成') } catch { message.error(production.errors.saleMutation); return false }
    },
  })
}
function resetSaleForm() { Object.assign(saleForm, { harvestBatchId: '', customer: '', quantity: 1000, unitPrice: 2.5, soldAt: today, notes: '' }) }
function openSale(item?: HarvestBatch) {
  resetSaleForm()
  if (item) {
    saleForm.harvestBatchId = item.id
    saleForm.quantity = Math.min(remainingQuantity(item), 1000)
    saleForm.unitPrice = 2.5
  }
  showSale.value = true
}
async function updateSale(id: string, input: { paymentStatus?: 'paid'; deliveryStatus?: 'delivered' }) {
  try { await production.updateSaleStatus(id, input); message.success('订单状态已更新') } catch { message.error(production.errors.saleMutation) }
}
async function queryTrace() {
  if (!traceCode.value.trim()) return message.warning('请输入追溯码或批次号')
  try { await production.queryTrace(traceCode.value.trim()) } catch { message.error(production.errors.trace) }
}

function saleActions(item: typeof production.sales[number]): TableAction[] {
  const hasInvoice = production.invoices.some((invoice) => invoice.sourceType === 'sales_order' && invoice.sourceId === item.id && invoice.status !== 'voided')
  const actions: TableAction[] = [{ key: 'invoice', label: hasInvoice ? '查看发票' : '开票', icon: FileClock, secondary: true, onClick: () => router.push({ path: '/invoices', query: { sourceType: 'sales_order', sourceId: item.id } }) }]
  if (item.deliveryStatus === 'pending') actions.push({ key: 'delivery', label: '确认交付', icon: Truck, secondary: true, onClick: () => updateSale(item.id, { deliveryStatus: 'delivered' }) })
  if (item.paymentStatus !== 'paid') actions.push({ key: 'payment', label: '确认收款', icon: CircleDollarSign, type: 'primary', onClick: () => updateSale(item.id, { paymentStatus: 'paid' }) })
  return actions
}

onMounted(() => Promise.all([farm.loadFields(), production.loadTraceability(), production.loadInvoices()]).then(queryTrace).catch(() => undefined))
</script>

<template>
  <page-header title="采收、销售与追溯" description="从种植季农事实绩追踪到采收质检、销售和交付状态"><n-button secondary @click="showHarvest = true"><template #icon><Plus /></template>新建采收批次</n-button><n-button type="primary" @click="openSale"><template #icon><Plus /></template>新增销售</n-button></page-header>
  <div class="domain-kpis traceability-kpis"><div><span class="domain-kpi-icon"><Warehouse /></span><small>累计采收</small><strong>{{ harvestTotal.toLocaleString() }}</strong><em>kg/各批次合计</em></div><div><span class="domain-kpi-icon blue"><CircleDollarSign /></span><small>销售金额</small><strong>{{ money(salesRevenue) }}</strong><em>{{ production.sales.length }} 张订单</em></div><div><span class="domain-kpi-icon amber"><CircleDollarSign /></span><small>已结算成本</small><strong>{{ money(settledCosts) }}</strong><em>初始成本 + 过程成本</em></div><div><span class="domain-kpi-icon" :class="{ red: realizedProfit < 0 }"><CircleDollarSign /></span><small>累计利润</small><strong :class="{ 'negative-profit': realizedProfit < 0 }">{{ money(realizedProfit) }}</strong><em>待收 {{ money(receivables) }}</em></div></div>

  <state-panel :loading="production.loading.harvests || production.loading.sales" :error="production.errors.harvests || production.errors.sales" @retry="production.loadTraceability">
    <n-tabs type="line" animated>
      <n-tab-pane name="harvest" tab="采收批次">
        <div class="trace-card-grid"><article v-for="item in production.harvests" :key="item.id" class="trace-batch-card"><div class="batch-head"><span><PackageCheck /></span><n-tag size="small" :type="item.qualityStatus === 'passed' ? 'success' : item.qualityStatus === 'rejected' ? 'error' : 'warning'">{{ item.qualityStatus === 'passed' ? '质检合格' : item.qualityStatus === 'rejected' ? '质检不合格' : '待质检' }}</n-tag></div><h3>{{ item.batchCode }} · {{ item.product }}</h3><p>{{ cycleName(item.cycleId) }} · {{ fieldName(item.fieldId) }}</p><div class="batch-quantity"><strong>{{ item.quantity.toLocaleString() }}</strong><span>{{ item.unit }} · {{ item.grade || '未定级' }}</span></div><dl><div><dt>采收日期</dt><dd>{{ item.harvestedAt }}</dd></div><div><dt>可售余量</dt><dd>{{ remainingQuantity(item).toLocaleString() }} {{ item.unit }}</dd></div><div><dt>入库仓位</dt><dd>{{ item.warehouse }}</dd></div><div><dt>追溯码</dt><dd><code>{{ item.traceCode }}</code></dd></div></dl><n-button v-if="item.qualityStatus === 'pending'" size="small" type="primary" secondary block @click="openQuality(item)"><template #icon><BadgeCheck /></template>登记质检</n-button><n-button v-else-if="item.qualityStatus === 'passed' && remainingQuantity(item) > 0" size="small" type="primary" block @click="openSale(item)"><template #icon><CircleDollarSign /></template>出售</n-button><n-tag v-else-if="item.qualityStatus === 'passed'" size="small" type="default">已全部出售</n-tag></article></div>
      </n-tab-pane>
      <n-tab-pane name="sales" tab="销售订单">
        <div class="table-wrap sales-table action-table"><n-table :single-line="false"><thead><tr><th>订单</th><th>采收批次</th><th>客户</th><th>数量</th><th>单价/金额</th><th>成本结算</th><th>真实利润</th><th>预估利润</th><th>日期</th><th>收款</th><th>交付</th><th>操作</th></tr></thead><tbody><tr v-for="item in production.sales" :key="item.id"><td><strong>{{ item.orderNo }}</strong></td><td>{{ batchName(item.harvestBatchId) }}</td><td>{{ item.customer }}</td><td>{{ item.quantity }} {{ item.unit }}</td><td>{{ money(item.unitPrice) }}/{{ item.unit }}<small class="cell-detail">{{ money(item.amount) }}</small></td><td><template v-if="item.initialCost !== undefined">初始 {{ money(item.initialCost) }}<small class="cell-detail">过程 {{ money(item.processCost || 0) }}</small></template><span v-else class="muted">历史订单未结算</span></td><td><strong v-if="item.actualProfit !== undefined" :class="{ 'negative-profit': item.actualProfit < 0 }">{{ money(item.actualProfit) }}</strong><span v-else>—</span></td><td><strong v-if="item.projectedProfit !== undefined" :class="{ 'negative-profit': item.projectedProfit < 0 }">{{ money(item.projectedProfit) }}</strong><span v-else>—</span></td><td>{{ item.soldAt }}</td><td><n-tag size="small" :type="item.paymentStatus === 'paid' ? 'success' : 'warning'">{{ item.paymentStatus === 'paid' ? '已收款' : item.paymentStatus === 'partial' ? '部分收款' : '待收款' }}</n-tag></td><td><n-tag size="small" :type="item.deliveryStatus === 'delivered' ? 'success' : 'info'">{{ item.deliveryStatus === 'delivered' ? '已交付' : '待交付' }}</n-tag></td><td><table-actions :actions="saleActions(item)" /></td></tr></tbody></n-table></div>
      </n-tab-pane>
      <n-tab-pane name="trace" tab="全链追溯">
        <div class="trace-query"><n-input v-model:value="traceCode" placeholder="输入 TRACE 追溯码或 HB 批次号" @keyup.enter="queryTrace"><template #prefix><QrCode /></template></n-input><n-button type="primary" :loading="production.loading.trace" @click="queryTrace"><template #icon><Search /></template>查询</n-button></div>
        <div v-if="production.traceResult" class="trace-result"><header><div><span class="trace-ok"><BadgeCheck /></span><div><h2>{{ production.traceResult.batch.product }} · {{ production.traceResult.batch.batchCode }}</h2><p>{{ production.traceResult.batch.traceCode }} · 质检{{ production.traceResult.batch.qualityStatus === 'passed' ? '合格' : '状态待确认' }}</p></div></div><strong>{{ production.traceResult.batch.quantity }} {{ production.traceResult.batch.unit }}</strong></header><div class="trace-chain"><div><small>生产来源</small><strong>{{ production.traceResult.cycle.code }} · {{ fieldName(production.traceResult.batch.fieldId) }}</strong><span>{{ production.traceResult.cycle.crop }} / {{ production.traceResult.cycle.variety }}</span></div><div><small>农事过程</small><strong>{{ production.traceResult.operations.length }} 条实绩</strong><span>{{ production.traceResult.operations.map(x => x.executor).filter((x,i,a) => a.indexOf(x) === i).join('、') }}</span></div><div><small>采收质检</small><strong>{{ production.traceResult.batch.harvestedAt }}</strong><span>{{ production.traceResult.batch.inspector || '待质检' }} · {{ production.traceResult.batch.warehouse }}</span></div><div><small>销售去向</small><strong>{{ production.traceResult.sales.length }} 张订单</strong><span>{{ production.traceResult.sales.map(x => x.customer).join('、') || '尚未销售' }}</span></div></div></div>
      </n-tab-pane>
    </n-tabs>
  </state-panel>

  <n-modal v-model:show="showHarvest" preset="card" title="新建采收批次" class="form-modal" :bordered="false"><n-form :model="harvestForm" label-placement="top"><div class="form-grid"><n-form-item label="种植季" required><n-select v-model:value="harvestForm.cycleId" :options="cycleOptions" /></n-form-item><n-form-item label="产品等级"><n-input v-model:value="harvestForm.grade" /></n-form-item><n-form-item label="采收数量"><n-input-number v-model:value="harvestForm.quantity" :min="0.01" /></n-form-item><n-form-item label="单位"><n-input v-model:value="harvestForm.unit" /></n-form-item><n-form-item label="采收日期"><n-date-picker v-model:formatted-value="harvestForm.harvestedAt" value-format="yyyy-MM-dd" type="date" /></n-form-item><n-form-item label="入库仓位" required><n-input v-model:value="harvestForm.warehouse" /></n-form-item></div><n-form-item label="备注"><n-input v-model:value="harvestForm.notes" type="textarea" /></n-form-item><div class="modal-actions"><n-button @click="showHarvest = false">取消</n-button><n-button type="primary" :loading="production.loading.harvestMutation" @click="createHarvest">建立批次</n-button></div></n-form></n-modal>
  <n-modal v-model:show="showQuality" preset="card" title="采收批次质检" class="form-modal" :bordered="false"><n-form :model="qualityForm" label-placement="top"><n-form-item label="质检结论"><n-select v-model:value="qualityForm.qualityStatus" :options="[{label:'检验合格',value:'passed'},{label:'检验不合格',value:'rejected'}]" /></n-form-item><n-form-item label="质检人员" required><n-input v-model:value="qualityForm.inspector" /></n-form-item><n-form-item label="检测说明"><n-input v-model:value="qualityForm.notes" type="textarea" :rows="4" /></n-form-item><div class="modal-actions"><n-button @click="showQuality = false">取消</n-button><n-button type="primary" :loading="production.loading.harvestMutation" @click="submitQuality">保存结论</n-button></div></n-form></n-modal>
  <n-modal v-model:show="showSale" preset="card" title="出售农产品" class="form-modal" :bordered="false"><n-form :model="saleForm" label-placement="top"><div class="form-grid"><n-form-item label="合格采收批次" required><n-select v-model:value="saleForm.harvestBatchId" :options="batchOptions" /></n-form-item><n-form-item label="客户" required><n-input v-model:value="saleForm.customer" /></n-form-item><n-form-item :label="saleForm.harvestBatchId ? `销售数量（可售 ${selectedBatchRemaining}）` : '销售数量'"><n-input-number v-model:value="saleForm.quantity" :min="0.01" :max="saleForm.harvestBatchId ? selectedBatchRemaining : undefined" /></n-form-item><n-form-item label="实际售价（元/单位）"><n-input-number v-model:value="saleForm.unitPrice" :min="0" :precision="2" /></n-form-item><n-form-item label="销售日期"><n-date-picker v-model:formatted-value="saleForm.soldAt" value-format="yyyy-MM-dd" type="date" /></n-form-item></div><div v-if="saleForm.harvestBatchId" class="sale-settlement"><div><small>本次收入</small><strong>{{ money(saleAmount) }}</strong></div><div><small>累计收入</small><strong>{{ money(cumulativeRevenueAfterSale) }}</strong></div><div><small>初始成本</small><strong>{{ money(selectedInitialCost) }}</strong></div><div><small>过程成本</small><strong>{{ money(selectedProcessCost) }}</strong></div><div class="profit"><small>真实利润</small><strong :class="{ negative: actualProfitAfterSale < 0 }">{{ money(actualProfitAfterSale) }}</strong></div><div class="profit"><small>预估利润</small><strong :class="{ negative: projectedProfitAfterSale < 0 }">{{ money(projectedProfitAfterSale) }}</strong></div><p>真实利润按已售收入计算；预估利润将剩余可售产品按本次售价估算。两者都已扣除初始成本和全部过程成本。</p></div><n-form-item label="备注"><n-input v-model:value="saleForm.notes" /></n-form-item><div class="modal-actions"><n-button @click="showSale = false">取消</n-button><n-button type="primary" :loading="production.loading.saleMutation" @click="createSale">出售并结算</n-button></div></n-form></n-modal>
</template>

<style scoped>
.trace-card-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }.trace-batch-card { padding: 18px; border: 1px solid #e0e5e2; border-radius: 8px; background: #fff; }.batch-head { display: flex; align-items: center; justify-content: space-between; }.batch-head > span { width: 38px; height: 38px; display: grid; place-items: center; color: #4b7259; background: #e8f0ea; border-radius: 7px; }.batch-head svg { width: 19px; }.trace-batch-card h3 { margin: 14px 0 4px; font-size: 15px; }.trace-batch-card > p { margin: 0; color: #7c8882; font-size: 11px; }.batch-quantity { margin: 15px 0; }.batch-quantity strong { display: block; font-size: 25px; }.batch-quantity span { color: #7b8781; font-size: 11px; }.trace-batch-card dl { padding: 11px 0; border-top: 1px solid #edf0ee; display: grid; gap: 7px; }.trace-batch-card dl div { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; }.trace-batch-card dt { color: #88938e; }.trace-batch-card dd { margin: 0; color: #4d5c54; text-align: right; }.trace-batch-card code { font-size: 10px; }
.traceability-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); }.domain-kpi-icon.red { color: #a95447; background: #f5e8e5; }.negative-profit { color: #ad5145 !important; }
.sales-table .n-table { min-width: 1480px; }
.sale-settlement { margin-bottom: 18px; padding: 14px; border: 1px solid #dfe6e2; border-radius: 8px; background: #f8faf9; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }.sale-settlement div { padding-right: 10px; border-right: 1px solid #e1e7e4; }.sale-settlement small, .sale-settlement strong { display: block; }.sale-settlement small { color: #7c8983; font-size: 10px; }.sale-settlement strong { margin-top: 3px; color: #33423b; font-size: 15px; }.sale-settlement .profit { grid-column: 1 / -1; padding-top: 10px; border-top: 1px solid #e1e7e4; border-right: 0; }.sale-settlement .profit strong { color: #3f6b50; font-size: 20px; }.sale-settlement .profit strong.negative { color: #ad5145; }.sale-settlement p { grid-column: 1 / -1; margin: 0; color: #7c8983; font-size: 10px; }
.trace-query { width: min(680px, 100%); margin: 12px auto 20px; display: grid; grid-template-columns: 1fr auto; gap: 10px; }.trace-query svg { width: 17px; }.trace-result { border: 1px solid #dce4df; border-radius: 8px; background: #fff; overflow: hidden; }.trace-result > header { padding: 18px 20px; display: flex; align-items: center; justify-content: space-between; color: #fff; background: #30433c; }.trace-result header > div { display: flex; align-items: center; gap: 12px; }.trace-result h2 { margin: 0; font-size: 16px; }.trace-result header p { margin: 4px 0 0; color: #b9c6c0; font-size: 10px; }.trace-result header > strong { color: #ecc36d; font-size: 20px; }.trace-ok { width: 38px; height: 38px; display: grid; place-items: center; color: #30433c; background: #d7a64a; border-radius: 7px; }.trace-ok svg { width: 20px; }.trace-chain { padding: 20px; display: grid; grid-template-columns: repeat(4, 1fr); }.trace-chain > div { min-height: 90px; padding: 8px 18px; border-right: 1px solid #e8ecea; }.trace-chain > div:last-child { border: 0; }.trace-chain small, .trace-chain span { display: block; }.trace-chain small { color: #87928d; font-size: 10px; }.trace-chain strong { display: block; margin: 8px 0 5px; color: #314039; font-size: 13px; }.trace-chain span { color: #718079; font-size: 11px; }
@media (max-width: 1050px) { .trace-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.trace-chain { grid-template-columns: 1fr 1fr; }.trace-chain > div:nth-child(2) { border-right: 0; } }
@media (max-width: 1050px) { .traceability-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 650px) { .trace-card-grid, .trace-chain, .traceability-kpis { grid-template-columns: 1fr; }.sale-settlement { grid-template-columns: 1fr 1fr; }.trace-chain > div { border-right: 0; border-bottom: 1px solid #e8ecea; }.trace-query { grid-template-columns: 1fr; }.trace-result > header { align-items: flex-start; gap: 12px; }.trace-result header > strong { font-size: 15px; } }
</style>
