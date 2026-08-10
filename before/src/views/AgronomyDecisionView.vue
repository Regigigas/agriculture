<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, Beaker, CalendarClock, CheckCircle2, CloudSun, Coins, Droplets, FileSearch, LineChart, PackageCheck, Radar, Sprout, TriangleAlert } from '@/icons/iconpark'
import { useFarmStore } from '@/stores/farm'
import { useOperationsStore } from '@/stores/operations'
import { useProductionStore } from '@/stores/production'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'

type GapStatus = 'done' | 'partial' | 'missing'

interface GapItem {
  title: string
  status: GapStatus
  evidence: string
  nextStep: string
}

interface ActionItem {
  title: string
  detail: string
  route: string
  severity: 'critical' | 'warning' | 'info'
}

const router = useRouter()
const farm = useFarmStore()
const production = useProductionStore()
const operations = useOperationsStore()

const today = computed(() => localDateKey(new Date()))
const loading = computed(() => farm.loading.fields || farm.loading.devices || farm.loading.tasks || farm.loading.inventory || farm.loading.issues || production.loading.cycles || production.loading.plans || production.loading.harvests || production.loading.sales || operations.loading.risks || operations.loading.summary)
const error = computed(() => farm.errors.fields || farm.errors.devices || farm.errors.tasks || farm.errors.inventory || farm.errors.issues || production.errors.cycles || production.errors.plans || production.errors.harvests || production.errors.sales || operations.errors.risks || operations.errors.summary)
const activeCycles = computed(() => production.cycles.filter((item) => ['planned', 'in_progress', 'harvesting'].includes(item.status)))
const cycleFieldIds = computed(() => new Set(activeCycles.value.map((item) => String(item.fieldId))))
const fieldsWithoutCycle = computed(() => farm.fields.filter((item) => item.status !== 'fallow' && !cycleFieldIds.value.has(String(item.id))))
const upcomingPlans = computed(() => production.plans.filter((item) => ['planned', 'in_progress'].includes(item.status)).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate)))
const overduePlans = computed(() => upcomingPlans.value.filter((item) => item.plannedDate < today.value))
const pendingQuality = computed(() => production.harvests.filter((item) => item.qualityStatus === 'pending'))
const failedQuality = computed(() => production.harvests.filter((item) => item.qualityStatus === 'rejected'))
const unpaidSales = computed(() => production.sales.filter((item) => item.paymentStatus !== 'paid'))
const activeIssues = computed(() => farm.issues.filter((item) => item.status !== 'closed'))
const lowStock = computed(() => farm.inventory.filter((item) => item.quantity <= item.minimumStock))
const offlineDevices = computed(() => farm.devices.filter((item) => item.status !== 'online'))
const irrigationAlerts = computed(() => farm.devices.filter((item) => item.telemetry.soilMoisture < 45 || item.telemetry.temperature > 32))

const plannedBudget = computed(() => production.cycles.filter((item) => item.status !== 'cancelled').reduce((sum, item) => sum + item.budget, 0))
const actualCost = computed(() => production.logs.reduce((sum, item) => sum + item.cost, 0))
const salesRevenue = computed(() => production.sales.reduce((sum, item) => sum + item.amount, 0))
const grossMargin = computed(() => salesRevenue.value - actualCost.value)
const traceCoverage = computed(() => {
  if (!production.harvests.length) return 0
  const withTrace = production.harvests.filter((item) => item.traceCode && item.batchCode).length
  return Math.round((withTrace / production.harvests.length) * 100)
})
const planCoverage = computed(() => {
  const productiveFields = farm.fields.filter((item) => item.status !== 'fallow').length
  if (!productiveFields) return 0
  return Math.round(((productiveFields - fieldsWithoutCycle.value.length) / productiveFields) * 100)
})

const gapItems = computed<GapItem[]>(() => [
  {
    title: '种植计划与轮作',
    status: fieldsWithoutCycle.value.length ? 'partial' : 'done',
    evidence: `${planCoverage.value}% 生产地块已关联种植季`,
    nextStep: fieldsWithoutCycle.value.length ? `为 ${fieldsWithoutCycle.value.length} 块地建立本季种植计划` : '继续按季节复盘产量和成本',
  },
  {
    title: '气象农情与灌溉建议',
    status: farm.devices.length ? (offlineDevices.value.length || irrigationAlerts.value.length ? 'partial' : 'done') : 'missing',
    evidence: `${farm.devices.length} 台设备，${offlineDevices.value.length} 台离线或维护`,
    nextStep: irrigationAlerts.value.length ? '优先检查低墒情或高温地块的水肥计划' : '补充区域天气预报和极端天气阈值',
  },
  {
    title: '病虫害巡检闭环',
    status: activeIssues.value.length ? 'partial' : 'done',
    evidence: `${activeIssues.value.length} 条巡田问题未关闭`,
    nextStep: activeIssues.value.length ? '把未关闭问题转为复查任务并记录处置结果' : '保持巡检、处置、复查三段记录',
  },
  {
    title: '质量检测与采收追溯',
    status: pendingQuality.value.length || failedQuality.value.length ? 'partial' : (production.harvests.length ? 'done' : 'missing'),
    evidence: `${traceCoverage.value}% 批次具备追溯码，${pendingQuality.value.length} 批待质检`,
    nextStep: pendingQuality.value.length ? '完成待质检批次，避免未检先售' : '为新采收批次同步质检记录',
  },
  {
    title: '成本收益核算',
    status: production.sales.length || actualCost.value ? 'partial' : 'missing',
    evidence: `收入 ${money(salesRevenue.value)}，成本 ${money(actualCost.value)}`,
    nextStep: '把农事人工、物料、销售回款纳入单季毛利看板',
  },
  {
    title: '农资安全库存',
    status: lowStock.value.length ? 'partial' : 'done',
    evidence: `${lowStock.value.length} 项农资低于安全库存`,
    nextStep: lowStock.value.length ? '生成采购单并跟踪到货入库' : '按作物阶段滚动维护最低库存',
  },
  {
    title: '对照试验与无人机巡测',
    status: 'done',
    evidence: '已覆盖施肥、遮光和土壤消毒 3 类对照试验及无人机巡测/作业',
    nextStep: '按实际地块导入样方边界、重复组和多光谱结果',
  },
])

const score = computed(() => {
  if (!gapItems.value.length) return 0
  const points = gapItems.value.reduce((sum, item) => sum + (item.status === 'done' ? 100 : item.status === 'partial' ? 60 : 20), 0)
  return Math.round(points / gapItems.value.length)
})

const actionItems = computed<ActionItem[]>(() => {
  const actions: ActionItem[] = []
  if (irrigationAlerts.value.length) actions.push({ title: '处理墒情或高温异常', detail: `${irrigationAlerts.value.length} 个地块传感器触发水分/温度关注`, route: '/devices', severity: 'critical' })
  if (overduePlans.value.length) actions.push({ title: '补登记逾期农事计划', detail: `${overduePlans.value.length} 项生产计划已过计划日期`, route: '/production', severity: 'critical' })
  if (pendingQuality.value.length) actions.push({ title: '完成采收批次质检', detail: `${pendingQuality.value.length} 批产品仍处于待检状态`, route: '/traceability', severity: 'warning' })
  if (fieldsWithoutCycle.value.length) actions.push({ title: '补齐地块种植季', detail: `${fieldsWithoutCycle.value.length} 块生产地没有本季种植计划`, route: '/production', severity: 'warning' })
  if (lowStock.value.length) actions.push({ title: '安排低库存采购', detail: `${lowStock.value.length} 项农资低于安全库存`, route: '/purchases', severity: 'warning' })
  if (unpaidSales.value.length) actions.push({ title: '跟进销售回款', detail: `${unpaidSales.value.length} 笔销售订单尚未结清`, route: '/traceability', severity: 'info' })
  return actions.slice(0, 6)
})

const scoreTone = computed(() => score.value >= 80 ? 'good' : score.value >= 60 ? 'watch' : 'risk')
const statusLabels: Record<GapStatus, string> = { done: '已覆盖', partial: '需完善', missing: '待建设' }
const statusTypes: Record<GapStatus, 'success' | 'warning' | 'error'> = { done: 'success', partial: 'warning', missing: 'error' }

function money(value: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(value)
}

function localDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function loadData() {
  return Promise.allSettled([
    farm.loadFields(),
    farm.loadDevices(),
    farm.loadTasks(),
    farm.loadInventory(),
    farm.loadIssues(),
    production.loadProduction(),
    production.loadTraceability(),
    operations.loadOperations(),
  ])
}

onMounted(() => { loadData() })
</script>

<template>
  <page-header title="农情决策中心" description="对照智慧农业常见能力，集中检查计划、农情、质检、追溯和经营缺口">
    <n-button secondary @click="loadData"><template #icon><Radar /></template>刷新评估</n-button>
  </page-header>

  <state-panel :loading="loading" :error="error" @retry="loadData">
    <section class="decision-hero">
      <div>
        <span class="hero-icon"><LineChart /></span>
        <small>系统完整度</small>
        <strong :class="scoreTone">{{ score }}</strong>
        <p>分数来自 7 个智慧农业核心能力的覆盖情况，帮助判断下一步先补哪里。</p>
      </div>
      <div class="hero-metrics">
        <button @click="router.push('/production')"><CalendarClock /><span>计划覆盖</span><strong>{{ planCoverage }}%</strong></button>
        <button @click="router.push('/devices')"><CloudSun /><span>农情异常</span><strong>{{ irrigationAlerts.length }}</strong></button>
        <button @click="router.push('/traceability')"><PackageCheck /><span>追溯覆盖</span><strong>{{ traceCoverage }}%</strong></button>
        <button @click="router.push('/operations')"><Coins /><span>经营毛利</span><strong>{{ money(grossMargin) }}</strong></button>
      </div>
    </section>

    <div class="decision-grid">
      <section class="gap-panel">
        <div class="section-heading"><div><h2>功能补齐清单</h2><p>按同类智慧农业系统常见模块逐项对照</p></div></div>
        <article v-for="item in gapItems" :key="item.title" class="gap-row">
          <span :class="['gap-dot', item.status]" />
          <div>
            <div><strong>{{ item.title }}</strong><n-tag size="small" :type="statusTypes[item.status]">{{ statusLabels[item.status] }}</n-tag></div>
            <p>{{ item.evidence }}</p>
            <small>{{ item.nextStep }}</small>
          </div>
        </article>
      </section>

      <section class="action-panel">
        <div class="section-heading"><div><h2>优先行动</h2><p>从现有数据自动推导今天最该处理的事项</p></div></div>
        <button v-for="item in actionItems" :key="item.title" :class="['action-row', item.severity]" @click="router.push(item.route)">
          <TriangleAlert v-if="item.severity !== 'info'" />
          <CheckCircle2 v-else />
          <span><strong>{{ item.title }}</strong><small>{{ item.detail }}</small></span>
        </button>
        <div v-if="!actionItems.length" class="empty-inline">当前没有需要立即处理的决策项</div>
      </section>
    </div>

    <section class="section-block">
      <div class="section-heading"><div><h2>专题雷达</h2><p>把种植、设备、质检和收益拆成可跟进指标</p></div></div>
      <div class="radar-grid">
        <article><Sprout /><span>活跃种植季</span><strong>{{ activeCycles.length }}</strong><small>{{ fieldsWithoutCycle.length }} 块地待建计划</small></article>
        <article><Droplets /><span>水肥关注</span><strong>{{ irrigationAlerts.length }}</strong><small>{{ offlineDevices.length }} 台设备离线或维护</small></article>
        <article><Beaker /><span>质检风险</span><strong>{{ pendingQuality.length + failedQuality.length }}</strong><small>{{ failedQuality.length }} 批未通过</small></article>
        <article><FileSearch /><span>开放风险</span><strong>{{ operations.summary.openRisks }}</strong><small>{{ operations.summary.criticalRisks }} 项严重风险</small></article>
        <article><AlertTriangle /><span>巡田问题</span><strong>{{ activeIssues.length }}</strong><small>病虫害、灌溉和设备闭环</small></article>
        <article><Coins /><span>预算消耗</span><strong>{{ plannedBudget ? Math.round((actualCost / plannedBudget) * 100) : 0 }}%</strong><small>已记成本 {{ money(actualCost) }}</small></article>
      </div>
    </section>
  </state-panel>
</template>

<style scoped>
.decision-hero { min-height: 190px; padding: 22px; display: grid; grid-template-columns: minmax(260px, .8fr) minmax(420px, 1.2fr); gap: 18px; border: 1px solid #dfe5df; border-radius: 8px; background: #fff; }
.decision-hero > div:first-child { display: grid; grid-template-columns: 52px minmax(0, 1fr); grid-template-rows: auto auto auto; align-items: center; column-gap: 14px; }
.hero-icon { grid-row: 1/4; width: 52px; height: 52px; display: grid; place-items: center; border-radius: 8px; color: #466f55; background: #e8f0ea; }
.hero-icon svg { width: 24px; height: 24px; }
.decision-hero small { color: #7c8983; font-size: 12px; }
.decision-hero strong { color: #2e3c35; font-size: 44px; line-height: 1; font-weight: 700; }
.decision-hero strong.good { color: #3f6b50; }.decision-hero strong.watch { color: #a56c1d; }.decision-hero strong.risk { color: #a95346; }
.decision-hero p { margin: 2px 0 0; color: #6f7c76; font-size: 13px; line-height: 1.7; }
.hero-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.hero-metrics button { min-height: 124px; padding: 13px; border: 1px solid #e3e8e5; border-radius: 8px; background: #fbfcfb; display: flex; flex-direction: column; align-items: flex-start; justify-content: space-between; color: #35423c; cursor: pointer; text-align: left; }
.hero-metrics button:hover { border-color: #bfcfc5; background: #fff; }
.hero-metrics svg { width: 20px; height: 20px; color: #557568; }
.hero-metrics span { color: #78847f; font-size: 12px; }
.hero-metrics strong { max-width: 100%; overflow: hidden; font-size: 20px; text-overflow: ellipsis; white-space: nowrap; }
.decision-grid { margin-top: 16px; display: grid; grid-template-columns: minmax(430px, 1.2fr) minmax(320px, .8fr); gap: 16px; }
.gap-panel, .action-panel { padding: 18px; border: 1px solid #e0e5e2; border-radius: 8px; background: #fff; }
.gap-row { min-height: 82px; display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 12px; padding: 13px 0; border-bottom: 1px solid #edf0ee; }
.gap-row:last-child { border-bottom: 0; }
.gap-dot { width: 10px; height: 10px; margin-top: 5px; border-radius: 50%; background: #d39b3b; box-shadow: 0 0 0 4px rgba(211,155,59,.15); }
.gap-dot.done { background: #69a878; box-shadow: 0 0 0 4px rgba(105,168,120,.15); }.gap-dot.missing { background: #bd5d4f; box-shadow: 0 0 0 4px rgba(189,93,79,.15); }
.gap-row div div { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.gap-row strong { color: #2f3d36; font-size: 14px; }
.gap-row p { margin: 5px 0 3px; color: #68756f; font-size: 13px; }
.gap-row small { color: #8a9590; font-size: 12px; }
.action-panel { align-self: start; }
.action-row { width: 100%; min-height: 70px; padding: 12px 4px; border: 0; border-bottom: 1px solid #edf0ee; background: transparent; display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: center; gap: 10px; text-align: left; cursor: pointer; }
.action-row:hover { background: #f7f9f8; }
.action-row svg { width: 19px; height: 19px; color: #4e7587; }
.action-row.critical svg { color: #a95346; }.action-row.warning svg { color: #a76b19; }
.action-row strong, .action-row small { display: block; }
.action-row strong { color: #33413a; font-size: 13px; }
.action-row small { margin-top: 4px; color: #7f8b85; font-size: 11px; }
.radar-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
.radar-grid article { min-height: 132px; padding: 15px; border: 1px solid #e0e5e2; border-radius: 8px; background: #fff; display: flex; flex-direction: column; gap: 7px; }
.radar-grid svg { width: 19px; height: 19px; color: #557568; }
.radar-grid span { color: #75817b; font-size: 12px; }
.radar-grid strong { color: #2f3d36; font-size: 24px; line-height: 1.1; }
.radar-grid small { margin-top: auto; color: #8a9590; font-size: 11px; line-height: 1.5; }
@media (max-width: 1180px) { .decision-hero, .decision-grid { grid-template-columns: 1fr; }.radar-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 760px) { .decision-hero { padding: 16px; }.hero-metrics { grid-template-columns: 1fr 1fr; }.decision-grid { gap: 12px; }.gap-panel, .action-panel { padding: 14px; }.radar-grid { grid-template-columns: 1fr 1fr; gap: 10px; } }
@media (max-width: 440px) { .hero-metrics, .radar-grid { grid-template-columns: 1fr; }.decision-hero > div:first-child { grid-template-columns: 44px minmax(0, 1fr); }.hero-icon { width: 44px; height: 44px; }.decision-hero strong { font-size: 36px; } }
</style>
