<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { EChartsOption } from 'echarts'
import { useDialog, useMessage } from 'naive-ui'
import { CircleDollarSign, Coins, Warehouse } from '@/icons/iconpark'
import { useProductionStore } from '@/stores/production'
import { useOperationsStore } from '@/stores/operations'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import EChart from '@/components/EChart.vue'
import MoneyUppercase from '@/components/MoneyUppercase.vue'
import { formatCents, multiplyToCents, yuanToCents } from '@/types/money'

const production = useProductionStore()
const operations = useOperationsStore()
const dialog = useDialog()
const message = useMessage()
const chartCycleId = ref('')
const showChart = ref(false)
const showAdjustment = ref(false)
const adjustmentForm = ref({ cycleId: '', type: 'supplement' as 'supplement' | 'reversal', amount: 0, occurredAt: new Date().toLocaleDateString('en-CA'), evidenceNo: '', reason: '' })
const money = (value: number) => formatCents(value)
const batchById = (id: string) => production.harvests.find((item) => item.id === id)
const cycleRevenue = (cycleId: string) => {
  const batchIds = new Set(production.harvests.filter((item) => item.cycleId === cycleId).map((item) => item.id))
  return production.sales.filter((item) => batchIds.has(item.harvestBatchId)).reduce((sum, item) => sum + item.amount, 0)
}
const processCost = (cycleId: string) => production.logs.filter((item) => item.cycleId === cycleId).reduce((sum, item) => sum + item.cost, 0) + production.costAdjustments.filter((item) => item.cycleId === cycleId).reduce((sum, item) => sum + (item.type === 'supplement' ? item.amount : -item.amount), 0)
const cycleRows = computed(() => production.cycles.map((cycle) => {
  const revenue = cycleRevenue(cycle.id)
  const operationCost = processCost(cycle.id)
  const totalCost = cycle.budget + operationCost
  const cycleBatches = production.harvests.filter((item) => item.cycleId === cycle.id && item.qualityStatus === 'passed')
  const batchIds = new Set(cycleBatches.map((item) => item.id))
  const cycleSales = production.sales.filter((sale) => batchIds.has(sale.harvestBatchId))
  const sellableQuantity = cycleBatches.reduce((sum, item) => sum + item.quantity, 0)
  const soldQuantity = cycleSales.reduce((sum, item) => sum + item.quantity, 0)
  const latestPrice = cycleSales[0]?.unitPrice || 0
  const actualProfit = revenue ? revenue - totalCost : null
  const projectedRevenue = revenue ? revenue + multiplyToCents(Math.max(0, sellableQuantity - soldQuantity), latestPrice) : 0
  const projectedProfit = revenue ? projectedRevenue - totalCost : null
  return { ...cycle, revenue, projectedRevenue, operationCost, totalCost, actualProfit, projectedProfit, latestPrice, logCount: production.logs.filter((item) => item.cycleId === cycle.id).length, adjustmentCount: production.costAdjustments.filter((item) => item.cycleId === cycle.id).length, orderCount: cycleSales.length }
}))
const settledRows = computed(() => cycleRows.value.filter((item) => item.revenue > 0))
const totalRevenue = computed(() => settledRows.value.reduce((sum, item) => sum + item.revenue, 0))
const totalCost = computed(() => settledRows.value.reduce((sum, item) => sum + item.totalCost, 0))
const totalProfit = computed(() => totalRevenue.value - totalCost.value)
const totalProjectedProfit = computed(() => settledRows.value.reduce((sum, item) => sum + (item.projectedProfit || 0), 0))
const settlementRecords = computed(() => production.sales)
const chartCycle = computed(() => cycleRows.value.find((item) => item.id === chartCycleId.value))
const comparisonOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value) => money(Number(value)) },
  grid: { left: 18, right: 18, top: 28, bottom: 16, containLabel: true },
  xAxis: { type: 'category', data: ['初始成本', '过程成本', '总成本', '实际收入', '预估收入', '真实利润', '预估利润'], axisLabel: { interval: 0, rotate: 20 } },
  yAxis: { type: 'value', axisLabel: { formatter: (value: number) => `${Math.round(value / 100000)}k` } },
  series: [{ type: 'bar', barMaxWidth: 42, data: chartCycle.value ? [
    { value: chartCycle.value.budget, itemStyle: { color: '#d39b3b' } },
    { value: chartCycle.value.operationCost, itemStyle: { color: '#b9873c' } },
    { value: chartCycle.value.totalCost, itemStyle: { color: '#9a6254' } },
    { value: chartCycle.value.revenue, itemStyle: { color: '#567c91' } },
    { value: chartCycle.value.projectedRevenue, itemStyle: { color: '#7899a8' } },
    { value: chartCycle.value.actualProfit || 0, itemStyle: { color: (chartCycle.value.actualProfit || 0) < 0 ? '#bd5d4f' : '#3f6b50' } },
    { value: chartCycle.value.projectedProfit || 0, itemStyle: { color: (chartCycle.value.projectedProfit || 0) < 0 ? '#d07a6d' : '#6c9278' } },
  ] : [] }],
}))
function openComparison(cycleId: string) { chartCycleId.value = cycleId; showChart.value = true }
function openAdjustment(cycleId: string) {
  adjustmentForm.value = { cycleId, type: 'supplement', amount: 0, occurredAt: new Date().toLocaleDateString('en-CA'), evidenceNo: '', reason: '' }
  showAdjustment.value = true
}
function submitAdjustment() {
  const cycle = production.cycles.find((item) => item.id === adjustmentForm.value.cycleId)
  if (!cycle) return
  if (adjustmentForm.value.amount <= 0) return message.warning('金额必须大于 0')
  if (!adjustmentForm.value.evidenceNo.trim()) return message.warning('请填写发票、收据或内部单据编号')
  if (adjustmentForm.value.reason.trim().length < 4) return message.warning('请填写至少 4 个字符的依据或原因')
  const input = { ...adjustmentForm.value, amount: yuanToCents(adjustmentForm.value.amount), evidenceNo: adjustmentForm.value.evidenceNo.trim(), reason: adjustmentForm.value.reason.trim() }
  dialog.warning({
    title: input.type === 'supplement' ? '确认补录成本' : '确认冲正成本',
    content: `确认对“${cycle.code} ${cycle.crop}”${input.type === 'supplement' ? '补录' : '冲正'} ${money(input.amount)}？此操作不会覆盖原始记录，将新增一条可追溯凭证并同步重算利润。`,
    positiveText: '确认新增凭证', negativeText: '返回检查',
    onPositiveClick: async () => {
      try { await production.createCostAdjustment(input); await operations.loadSummary().catch(() => undefined); showAdjustment.value = false; message.success('成本凭证已新增，利润已同步重算') }
      catch { message.error(production.errors.costAdjustmentMutation || '保存失败'); return false }
    },
  })
}
function thumbnailBars(item: { budget: number; operationCost: number; revenue: number; projectedRevenue: number; actualProfit: number | null; projectedProfit: number | null }) {
  const values = [item.budget, item.operationCost, item.revenue, item.projectedRevenue, item.actualProfit || 0, item.projectedProfit || 0]
  const max = Math.max(...values.map((value) => Math.abs(value)), 1)
  return values.map((value) => ({ height: Math.max(3, Math.round(Math.abs(value) / max * 20)), negative: value < 0 }))
}

onMounted(() => production.loadTraceability().catch(() => undefined))
</script>

<template>
  <page-header title="利润核算" description="出售时按种植季汇总实际收入、初始成本和农事过程成本，利润允许为负数"><money-uppercase :value="totalProfit" /></page-header>
  <div class="profit-source-row"><n-alert type="info" :bordered="false" class="source-notice"><strong>数据来源：</strong>初始成本来自种植季建账且不可修改；过程成本来自农事实绩及追加的补录/冲正凭证；销售收入来自确认后的销售订单；预估利润使用剩余可售数量和最近一次实际售价。利润均由系统计算，不接受手工覆盖。</n-alert></div>
  <div class="domain-kpis profit-kpis">
    <div><span class="domain-kpi-icon blue"><Coins /></span><small>累计销售收入</small><strong>{{ money(totalRevenue) }}</strong><em>{{ production.sales.length }} 张销售订单</em></div>
    <div><span class="domain-kpi-icon amber"><Warehouse /></span><small>已结算总成本</small><strong>{{ money(totalCost) }}</strong><em>初始成本 + 过程成本</em></div>
    <div><span class="domain-kpi-icon"><CircleDollarSign /></span><small>真实利润</small><strong :class="{ negative: totalProfit < 0 }">{{ money(totalProfit) }}</strong><em>按已出售收入核算</em></div>
    <div><span class="domain-kpi-icon"><CircleDollarSign /></span><small>预估利润</small><strong :class="{ negative: totalProjectedProfit < 0 }">{{ money(totalProjectedProfit) }}</strong><em>剩余产品按最近售价估算</em></div>
  </div>

  <state-panel :loading="production.loading.harvests || production.loading.sales || production.loading.cycles || production.loading.logs" :error="production.errors.harvests || production.errors.sales || production.errors.cycles || production.errors.logs" @retry="production.loadTraceability">
    <n-tabs type="line" animated>
      <n-tab-pane name="cycles" tab="种植季利润">
        <div class="table-wrap profit-table"><n-table :single-line="false"><thead><tr><th>种植季</th><th>成本构成</th><th>销售收入</th><th>真实利润</th><th>预估利润</th><th>数据来源</th><th>核算状态</th><th>统计图</th><th>凭证</th></tr></thead><tbody><tr v-for="item in cycleRows" :key="item.id"><td><strong>{{ item.code }} · {{ item.crop }}</strong><small class="cell-detail">{{ item.variety || '未填写品种' }}</small></td><td>合计 {{ money(item.totalCost) }}<small class="cell-detail">初始 {{ money(item.budget) }} · 过程 {{ money(item.operationCost) }}</small></td><td>{{ money(item.revenue) }}<small class="cell-detail">{{ item.orderCount }} 张已确认订单</small></td><td><strong v-if="item.actualProfit !== null" :class="{ negative: item.actualProfit < 0 }">{{ money(item.actualProfit) }}</strong><small class="cell-detail">按实际销售收入</small></td><td><strong v-if="item.projectedProfit !== null" :class="{ negative: item.projectedProfit < 0 }">{{ money(item.projectedProfit) }}</strong><small v-if="item.latestPrice" class="cell-detail">按最近售价 {{ money(item.latestPrice) }}</small><span v-else>—</span></td><td><small class="source-cell">建账 1 条<br>农事实绩 {{ item.logCount }} 条<br>补录/冲正 {{ item.adjustmentCount }} 条<br>销售订单 {{ item.orderCount }} 条</small></td><td><n-tag size="small" :type="item.actualProfit === null ? 'default' : item.actualProfit < 0 ? 'error' : 'success'">{{ item.actualProfit === null ? '待出售' : item.actualProfit < 0 ? '亏损' : '盈利' }}</n-tag></td><td><button class="chart-thumbnail" type="button" :aria-label="`查看 ${item.code} 利润对比图`" @click="openComparison(item.id)"><i class="zero-line" /><span v-for="(bar, index) in thumbnailBars(item)" :key="index" :class="{ negative: bar.negative }" :style="{ height: `${bar.height}px` }" /></button></td><td><n-button size="small" secondary :disabled="item.status === 'cancelled'" @click="openAdjustment(item.id)">补录/冲正</n-button></td></tr></tbody></n-table></div>
      </n-tab-pane>
      <n-tab-pane name="records" :tab="`出售结算记录 ${settlementRecords.length}`">
        <div class="table-wrap settlement-table"><n-table :single-line="false"><thead><tr><th>订单</th><th>批次</th><th>本次收入</th><th>累计收入</th><th>初始成本</th><th>过程成本</th><th>出售时真实利润</th><th>出售时预估利润</th><th>日期</th></tr></thead><tbody><tr v-for="item in settlementRecords" :key="item.id"><td><strong>{{ item.orderNo }}</strong><small class="cell-detail">{{ item.customer }}</small></td><td>{{ batchById(item.harvestBatchId)?.batchCode || '未知批次' }}</td><td>{{ money(item.amount) }}</td><template v-if="item.actualProfit !== undefined"><td>{{ money(item.cumulativeRevenue || 0) }}</td><td>{{ money(item.initialCost || 0) }}</td><td>{{ money(item.processCost || 0) }}</td><td><strong :class="{ negative: (item.actualProfit || 0) < 0 }">{{ money(item.actualProfit || 0) }}</strong></td><td><strong :class="{ negative: (item.projectedProfit || 0) < 0 }">{{ money(item.projectedProfit || 0) }}</strong></td></template><td v-else colspan="5"><span class="muted">历史订单无结算快照，请以种植季利润表当前核算结果为准</span></td><td>{{ item.soldAt }}</td></tr><tr v-if="!settlementRecords.length"><td colspan="9" class="empty-cell">暂无出售结算记录</td></tr></tbody></n-table></div>
      </n-tab-pane>
      <n-tab-pane name="adjustments" :tab="`成本补录与冲正 ${production.costAdjustments.length}`">
        <div class="table-wrap adjustment-table"><n-table :single-line="false"><thead><tr><th>日期</th><th>种植季</th><th>类型</th><th>金额</th><th>凭证编号</th><th>依据/原因</th><th>操作人</th><th>记录时间</th></tr></thead><tbody><tr v-for="item in production.costAdjustments" :key="item.id"><td>{{ item.occurredAt }}</td><td>{{ production.cycles.find((cycle) => cycle.id === item.cycleId)?.code || item.cycleId }}</td><td><n-tag size="small" :type="item.type === 'supplement' ? 'warning' : 'info'">{{ item.type === 'supplement' ? '成本补录' : '成本冲正' }}</n-tag></td><td :class="{ 'negative': item.type === 'reversal' }">{{ item.type === 'reversal' ? '−' : '+' }}{{ money(item.amount) }}</td><td>{{ item.evidenceNo }}</td><td>{{ item.reason }}</td><td>{{ item.operator }}</td><td>{{ new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</td></tr><tr v-if="!production.costAdjustments.length"><td colspan="8" class="empty-cell">暂无补录或冲正凭证</td></tr></tbody></n-table></div>
      </n-tab-pane>
    </n-tabs>
  </state-panel>
  <n-modal v-model:show="showAdjustment" preset="card" class="cost-voucher-modal profit-modal-card" :style="{ width: 'min(620px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 32px)', overflow: 'hidden' }" :bordered="false" :block-scroll="false">
    <template #header><span class="profit-modal-title">新增成本凭证</span></template>
    <div class="modal-scroll-content">
      <n-alert type="warning" :bordered="false">本操作不会修改或删除已有数据，只会新增一条补录/冲正凭证，并同步重新计算利润。</n-alert>
      <n-form label-placement="top" class="cost-voucher-form">
        <div class="form-grid"><n-form-item label="凭证类型" required><n-select v-model:value="adjustmentForm.type" :options="[{label:'成本补录（增加成本）',value:'supplement'},{label:'成本冲正（减少成本）',value:'reversal'}]" /></n-form-item><n-form-item label="发生日期" required><n-date-picker v-model:formatted-value="adjustmentForm.occurredAt" value-format="yyyy-MM-dd" type="date" /></n-form-item><n-form-item label="金额（元）" required><n-input-number v-model:value="adjustmentForm.amount" :min="0.01" :precision="2" /></n-form-item><n-form-item label="凭证编号" required><n-input v-model:value="adjustmentForm.evidenceNo" placeholder="发票、收据或内部单据编号" /></n-form-item></div>
        <n-form-item label="依据或原因" required><n-input v-model:value="adjustmentForm.reason" type="textarea" :rows="3" placeholder="填写发票、单据或错误记录依据" /></n-form-item>
        <div class="modal-actions"><n-button @click="showAdjustment = false">取消</n-button><n-button type="primary" :loading="production.loading.costAdjustmentMutation" @click="submitAdjustment">提交凭证</n-button></div>
      </n-form>
    </div>
  </n-modal>
  <n-modal v-model:show="showChart" preset="card" class="profit-chart-modal profit-modal-card" :style="{ width: 'min(900px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 32px)', overflow: 'hidden' }" :bordered="false" :block-scroll="false">
    <template #header><span class="profit-modal-title">{{ chartCycle ? `${chartCycle.code} · ${chartCycle.crop} 利润对比` : '利润对比' }}</span></template>
    <div class="modal-scroll-content chart-modal-content">
      <div v-if="chartCycle" class="chart-summary"><span>真实利润 <strong :class="{ negative: (chartCycle.actualProfit || 0) < 0 }">{{ chartCycle.actualProfit === null ? '待出售' : money(chartCycle.actualProfit) }}</strong></span><span>预估利润 <strong :class="{ negative: (chartCycle.projectedProfit || 0) < 0 }">{{ chartCycle.projectedProfit === null ? '待出售' : money(chartCycle.projectedProfit) }}</strong></span></div>
      <div class="profit-chart-scroll"><e-chart :option="comparisonOption" class="profit-chart" /></div>
    </div>
  </n-modal>
</template>

<style scoped>
.profit-kpis strong.negative, .profit-table strong.negative, .settlement-table strong.negative, .adjustment-table .negative { color: #ad5145; }
.profit-source-row { margin-bottom: 16px; }.source-notice { width: 100%; }.source-cell { color: #718079; line-height: 1.7; }.adjustment-table .n-table { min-width: 980px; }
.profit-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); }.profit-table .n-table { min-width: 1260px; }.settlement-table .n-table { min-width: 1240px; }.chart-thumbnail { width: 92px; height: 46px; padding: 4px 7px; position: relative; border: 1px solid #dce4df; border-radius: 6px; background: #f8faf9; display: flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; }.chart-thumbnail:hover { border-color: #7d9b87; background: #f1f6f2; }.chart-thumbnail .zero-line { position: absolute; left: 5px; right: 5px; top: 50%; height: 1px; background: #d7dfda; }.chart-thumbnail span { width: 8px; z-index: 1; align-self: center; border-radius: 2px 2px 0 0; background: #5f846b; transform: translateY(-50%); }.chart-thumbnail span:nth-of-type(2), .chart-thumbnail span:nth-of-type(3) { background: #c28a37; }.chart-thumbnail span:nth-of-type(4), .chart-thumbnail span:nth-of-type(5) { background: #5f8190; }.chart-thumbnail span.negative { border-radius: 0 0 2px 2px; background: #bd5d4f; transform: translateY(50%); }.profit-chart-modal { width: min(900px, calc(100vw - 32px)); }.profit-modal-title { display: block; width: 100%; max-width: calc(100vw - 106px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.modal-scroll-content { max-height: calc(100dvh - 126px); padding-right: 4px; overflow-x: hidden; overflow-y: auto; }.cost-voucher-form { margin-top: 16px; }.cost-voucher-form .form-grid > * { min-width: 0; }.profit-chart-scroll { width: 100%; overflow-x: auto; overflow-y: hidden; }.profit-chart { min-width: 680px; height: 440px; }.chart-summary { display: flex; flex-wrap: wrap; gap: 8px 24px; padding: 0 4px 12px; color: #718079; font-size: 12px; }.chart-summary strong { margin-left: 6px; color: #3f6b50; font-size: 17px; }.chart-summary strong.negative { color: #ad5145; }
@media (max-width: 760px) { .profit-kpis { grid-template-columns: 1fr; }.chart-summary { gap: 6px 16px; }.profit-chart { height: 320px; }.modal-scroll-content { max-height: calc(100dvh - 112px); }.cost-voucher-form .modal-actions { position: sticky; bottom: 0; padding-top: 12px; background: #fff; } }
</style>
