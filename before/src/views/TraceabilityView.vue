<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { BadgeCheck, CircleDollarSign, PackageCheck, Plus, QrCode, Search, Truck, Warehouse } from '@/icons/iconpark'
import { useFarmStore } from '@/stores/farm'
import { useProductionStore } from '@/stores/production'
import type { HarvestBatch } from '@/types'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import TableActions from '@/components/TableActions.vue'
import type { TableAction } from '@/components/table-actions'

const farm = useFarmStore()
const production = useProductionStore()
const message = useMessage()
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
const harvestTotal = computed(() => production.harvests.reduce((sum, item) => sum + item.quantity, 0))
const salesRevenue = computed(() => production.sales.reduce((sum, item) => sum + item.amount, 0))
const receivables = computed(() => production.sales.filter((item) => item.paymentStatus !== 'paid').reduce((sum, item) => sum + item.amount, 0))
const fieldName = (id: string | number) => farm.fields.find((item) => item.id === id)?.name || '未知地块'
const cycleName = (id: string) => production.cycles.find((item) => item.id === id)?.code || '未知种植季'
const batchName = (id: string) => production.harvests.find((item) => item.id === id)?.batchCode || '未知批次'
function localDateKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function money(value: number) { return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value) }

async function createHarvest() {
  if (!harvestForm.cycleId || !harvestForm.warehouse.trim()) return message.warning('请选择种植季并填写入库仓位')
  try { await production.createHarvest({ ...harvestForm }); showHarvest.value = false; message.success('采收批次已建立并生成追溯码') } catch { message.error(production.errors.harvestMutation) }
}
function openQuality(item: HarvestBatch) { qualityBatch.value = item; Object.assign(qualityForm, { qualityStatus: 'passed', inspector: '', notes: '' }); showQuality.value = true }
async function submitQuality() {
  if (!qualityBatch.value || !qualityForm.inspector.trim()) return message.warning('请填写质检人员')
  try { await production.updateHarvestQuality(qualityBatch.value.id, qualityForm.qualityStatus, qualityForm.inspector, qualityForm.notes); showQuality.value = false; message.success('质检结果已登记') } catch { message.error(production.errors.harvestMutation) }
}
async function createSale() {
  if (!saleForm.harvestBatchId || !saleForm.customer.trim()) return message.warning('请选择合格批次并填写客户')
  if (selectedBatchRemaining.value <= 0 || saleForm.quantity > selectedBatchRemaining.value) return message.warning('销售数量不能超过批次可售余量')
  try { await production.createSale({ ...saleForm }); showSale.value = false; resetSaleForm(); message.success('销售订单已建立') } catch { message.error(production.errors.saleMutation) }
}
function resetSaleForm() { Object.assign(saleForm, { harvestBatchId: '', customer: '', quantity: 1000, unitPrice: 2.5, soldAt: today, notes: '' }) }
function openSale() { resetSaleForm(); showSale.value = true }
async function updateSale(id: string, input: { paymentStatus?: 'paid'; deliveryStatus?: 'delivered' }) {
  try { await production.updateSaleStatus(id, input); message.success('订单状态已更新') } catch { message.error(production.errors.saleMutation) }
}
async function queryTrace() {
  if (!traceCode.value.trim()) return message.warning('请输入追溯码或批次号')
  try { await production.queryTrace(traceCode.value.trim()) } catch { message.error(production.errors.trace) }
}

function saleActions(item: typeof production.sales[number]): TableAction[] {
  const actions: TableAction[] = []
  if (item.deliveryStatus === 'pending') actions.push({ key: 'delivery', label: '确认交付', icon: Truck, secondary: true, onClick: () => updateSale(item.id, { deliveryStatus: 'delivered' }) })
  if (item.paymentStatus !== 'paid') actions.push({ key: 'payment', label: '确认收款', icon: CircleDollarSign, type: 'primary', onClick: () => updateSale(item.id, { paymentStatus: 'paid' }) })
  return actions
}

onMounted(() => Promise.all([farm.loadFields(), production.loadTraceability()]).then(queryTrace).catch(() => undefined))
</script>

<template>
  <page-header title="采收、销售与追溯" description="从种植季农事实绩追踪到采收质检、销售和交付状态"><n-button secondary @click="showHarvest = true"><template #icon><Plus /></template>新建采收批次</n-button><n-button type="primary" @click="openSale"><template #icon><Plus /></template>新增销售</n-button></page-header>
  <div class="domain-kpis"><div><span class="domain-kpi-icon"><Warehouse /></span><small>累计采收</small><strong>{{ harvestTotal.toLocaleString() }}</strong><em>kg/各批次合计</em></div><div><span class="domain-kpi-icon blue"><CircleDollarSign /></span><small>销售金额</small><strong>{{ money(salesRevenue) }}</strong><em>{{ production.sales.length }} 张订单</em></div><div><span class="domain-kpi-icon amber"><CircleDollarSign /></span><small>待收金额</small><strong>{{ money(receivables) }}</strong><em>未完成收款</em></div></div>

  <state-panel :loading="production.loading.harvests || production.loading.sales" :error="production.errors.harvests || production.errors.sales" @retry="production.loadTraceability">
    <n-tabs type="line" animated>
      <n-tab-pane name="harvest" tab="采收批次">
        <div class="trace-card-grid"><article v-for="item in production.harvests" :key="item.id" class="trace-batch-card"><div class="batch-head"><span><PackageCheck /></span><n-tag size="small" :type="item.qualityStatus === 'passed' ? 'success' : item.qualityStatus === 'rejected' ? 'error' : 'warning'">{{ item.qualityStatus === 'passed' ? '质检合格' : item.qualityStatus === 'rejected' ? '质检不合格' : '待质检' }}</n-tag></div><h3>{{ item.batchCode }} · {{ item.product }}</h3><p>{{ cycleName(item.cycleId) }} · {{ fieldName(item.fieldId) }}</p><div class="batch-quantity"><strong>{{ item.quantity.toLocaleString() }}</strong><span>{{ item.unit }} · {{ item.grade || '未定级' }}</span></div><dl><div><dt>采收日期</dt><dd>{{ item.harvestedAt }}</dd></div><div><dt>入库仓位</dt><dd>{{ item.warehouse }}</dd></div><div><dt>追溯码</dt><dd><code>{{ item.traceCode }}</code></dd></div></dl><n-button v-if="item.qualityStatus === 'pending'" size="small" type="primary" secondary block @click="openQuality(item)"><template #icon><BadgeCheck /></template>登记质检</n-button></article></div>
      </n-tab-pane>
      <n-tab-pane name="sales" tab="销售订单">
        <div class="table-wrap sales-table action-table"><n-table :single-line="false"><thead><tr><th>订单</th><th>采收批次</th><th>客户</th><th>数量</th><th>单价/金额</th><th>日期</th><th>收款</th><th>交付</th><th>操作</th></tr></thead><tbody><tr v-for="item in production.sales" :key="item.id"><td><strong>{{ item.orderNo }}</strong></td><td>{{ batchName(item.harvestBatchId) }}</td><td>{{ item.customer }}</td><td>{{ item.quantity }} {{ item.unit }}</td><td>{{ item.unitPrice }}/{{ item.unit }}<small class="cell-detail">{{ money(item.amount) }}</small></td><td>{{ item.soldAt }}</td><td><n-tag size="small" :type="item.paymentStatus === 'paid' ? 'success' : 'warning'">{{ item.paymentStatus === 'paid' ? '已收款' : item.paymentStatus === 'partial' ? '部分收款' : '待收款' }}</n-tag></td><td><n-tag size="small" :type="item.deliveryStatus === 'delivered' ? 'success' : 'info'">{{ item.deliveryStatus === 'delivered' ? '已交付' : '待交付' }}</n-tag></td><td><table-actions :actions="saleActions(item)" /></td></tr></tbody></n-table></div>
      </n-tab-pane>
      <n-tab-pane name="trace" tab="全链追溯">
        <div class="trace-query"><n-input v-model:value="traceCode" placeholder="输入 TRACE 追溯码或 HB 批次号" @keyup.enter="queryTrace"><template #prefix><QrCode /></template></n-input><n-button type="primary" :loading="production.loading.trace" @click="queryTrace"><template #icon><Search /></template>查询</n-button></div>
        <div v-if="production.traceResult" class="trace-result"><header><div><span class="trace-ok"><BadgeCheck /></span><div><h2>{{ production.traceResult.batch.product }} · {{ production.traceResult.batch.batchCode }}</h2><p>{{ production.traceResult.batch.traceCode }} · 质检{{ production.traceResult.batch.qualityStatus === 'passed' ? '合格' : '状态待确认' }}</p></div></div><strong>{{ production.traceResult.batch.quantity }} {{ production.traceResult.batch.unit }}</strong></header><div class="trace-chain"><div><small>生产来源</small><strong>{{ production.traceResult.cycle.code }} · {{ fieldName(production.traceResult.batch.fieldId) }}</strong><span>{{ production.traceResult.cycle.crop }} / {{ production.traceResult.cycle.variety }}</span></div><div><small>农事过程</small><strong>{{ production.traceResult.operations.length }} 条实绩</strong><span>{{ production.traceResult.operations.map(x => x.executor).filter((x,i,a) => a.indexOf(x) === i).join('、') }}</span></div><div><small>采收质检</small><strong>{{ production.traceResult.batch.harvestedAt }}</strong><span>{{ production.traceResult.batch.inspector || '待质检' }} · {{ production.traceResult.batch.warehouse }}</span></div><div><small>销售去向</small><strong>{{ production.traceResult.sales.length }} 张订单</strong><span>{{ production.traceResult.sales.map(x => x.customer).join('、') || '尚未销售' }}</span></div></div></div>
      </n-tab-pane>
    </n-tabs>
  </state-panel>

  <n-modal v-model:show="showHarvest" preset="card" title="新建采收批次" class="form-modal" :bordered="false"><n-form :model="harvestForm" label-placement="top"><div class="form-grid"><n-form-item label="种植季" required><n-select v-model:value="harvestForm.cycleId" :options="cycleOptions" /></n-form-item><n-form-item label="产品等级"><n-input v-model:value="harvestForm.grade" /></n-form-item><n-form-item label="采收数量"><n-input-number v-model:value="harvestForm.quantity" :min="0.01" /></n-form-item><n-form-item label="单位"><n-input v-model:value="harvestForm.unit" /></n-form-item><n-form-item label="采收日期"><n-date-picker v-model:formatted-value="harvestForm.harvestedAt" value-format="yyyy-MM-dd" type="date" /></n-form-item><n-form-item label="入库仓位" required><n-input v-model:value="harvestForm.warehouse" /></n-form-item></div><n-form-item label="备注"><n-input v-model:value="harvestForm.notes" type="textarea" /></n-form-item><div class="modal-actions"><n-button @click="showHarvest = false">取消</n-button><n-button type="primary" :loading="production.loading.harvestMutation" @click="createHarvest">建立批次</n-button></div></n-form></n-modal>
  <n-modal v-model:show="showQuality" preset="card" title="采收批次质检" class="form-modal" :bordered="false"><n-form :model="qualityForm" label-placement="top"><n-form-item label="质检结论"><n-select v-model:value="qualityForm.qualityStatus" :options="[{label:'检验合格',value:'passed'},{label:'检验不合格',value:'rejected'}]" /></n-form-item><n-form-item label="质检人员" required><n-input v-model:value="qualityForm.inspector" /></n-form-item><n-form-item label="检测说明"><n-input v-model:value="qualityForm.notes" type="textarea" :rows="4" /></n-form-item><div class="modal-actions"><n-button @click="showQuality = false">取消</n-button><n-button type="primary" :loading="production.loading.harvestMutation" @click="submitQuality">保存结论</n-button></div></n-form></n-modal>
  <n-modal v-model:show="showSale" preset="card" title="新增销售订单" class="form-modal" :bordered="false"><n-form :model="saleForm" label-placement="top"><div class="form-grid"><n-form-item label="合格采收批次" required><n-select v-model:value="saleForm.harvestBatchId" :options="batchOptions" /></n-form-item><n-form-item label="客户" required><n-input v-model:value="saleForm.customer" /></n-form-item><n-form-item :label="saleForm.harvestBatchId ? `销售数量（可售 ${selectedBatchRemaining}）` : '销售数量'"><n-input-number v-model:value="saleForm.quantity" :min="0.01" :max="saleForm.harvestBatchId ? selectedBatchRemaining : undefined" /></n-form-item><n-form-item label="含税单价"><n-input-number v-model:value="saleForm.unitPrice" :min="0" :precision="2" /></n-form-item><n-form-item label="销售日期"><n-date-picker v-model:formatted-value="saleForm.soldAt" value-format="yyyy-MM-dd" type="date" /></n-form-item></div><n-form-item label="备注"><n-input v-model:value="saleForm.notes" /></n-form-item><div class="modal-actions"><n-button @click="showSale = false">取消</n-button><n-button type="primary" :loading="production.loading.saleMutation" @click="createSale">建立订单</n-button></div></n-form></n-modal>
</template>

<style scoped>
.trace-card-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }.trace-batch-card { padding: 18px; border: 1px solid #e0e5e2; border-radius: 8px; background: #fff; }.batch-head { display: flex; align-items: center; justify-content: space-between; }.batch-head > span { width: 38px; height: 38px; display: grid; place-items: center; color: #4b7259; background: #e8f0ea; border-radius: 7px; }.batch-head svg { width: 19px; }.trace-batch-card h3 { margin: 14px 0 4px; font-size: 15px; }.trace-batch-card > p { margin: 0; color: #7c8882; font-size: 11px; }.batch-quantity { margin: 15px 0; }.batch-quantity strong { display: block; font-size: 25px; }.batch-quantity span { color: #7b8781; font-size: 11px; }.trace-batch-card dl { padding: 11px 0; border-top: 1px solid #edf0ee; display: grid; gap: 7px; }.trace-batch-card dl div { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; }.trace-batch-card dt { color: #88938e; }.trace-batch-card dd { margin: 0; color: #4d5c54; text-align: right; }.trace-batch-card code { font-size: 10px; }
.sales-table .n-table { min-width: 1160px; }
.trace-query { width: min(680px, 100%); margin: 12px auto 20px; display: grid; grid-template-columns: 1fr auto; gap: 10px; }.trace-query svg { width: 17px; }.trace-result { border: 1px solid #dce4df; border-radius: 8px; background: #fff; overflow: hidden; }.trace-result > header { padding: 18px 20px; display: flex; align-items: center; justify-content: space-between; color: #fff; background: #30433c; }.trace-result header > div { display: flex; align-items: center; gap: 12px; }.trace-result h2 { margin: 0; font-size: 16px; }.trace-result header p { margin: 4px 0 0; color: #b9c6c0; font-size: 10px; }.trace-result header > strong { color: #ecc36d; font-size: 20px; }.trace-ok { width: 38px; height: 38px; display: grid; place-items: center; color: #30433c; background: #d7a64a; border-radius: 7px; }.trace-ok svg { width: 20px; }.trace-chain { padding: 20px; display: grid; grid-template-columns: repeat(4, 1fr); }.trace-chain > div { min-height: 90px; padding: 8px 18px; border-right: 1px solid #e8ecea; }.trace-chain > div:last-child { border: 0; }.trace-chain small, .trace-chain span { display: block; }.trace-chain small { color: #87928d; font-size: 10px; }.trace-chain strong { display: block; margin: 8px 0 5px; color: #314039; font-size: 13px; }.trace-chain span { color: #718079; font-size: 11px; }
@media (max-width: 1050px) { .trace-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.trace-chain { grid-template-columns: 1fr 1fr; }.trace-chain > div:nth-child(2) { border-right: 0; } }
@media (max-width: 650px) { .trace-card-grid, .trace-chain { grid-template-columns: 1fr; }.trace-chain > div { border-right: 0; border-bottom: 1px solid #e8ecea; }.trace-query { grid-template-columns: 1fr; }.trace-result > header { align-items: flex-start; gap: 12px; }.trace-result header > strong { font-size: 15px; } }
</style>
