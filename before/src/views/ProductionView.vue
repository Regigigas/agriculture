<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import { CalendarRange, Check, CircleX, ClipboardList, History, Play, Plus, Wheat } from '@lucide/vue'
import { useFarmStore } from '@/stores/farm'
import { useProductionStore } from '@/stores/production'
import type { CropCycle, CropCycleStatus, OperationType, ProductionPlan, ProductionPlanStatus } from '@/types'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import TableActions from '@/components/TableActions.vue'
import type { TableAction } from '@/components/table-actions'

const farm = useFarmStore()
const production = useProductionStore()
const message = useMessage()
const dialog = useDialog()
const showCycle = ref(false)
const showPlan = ref(false)
const showLog = ref(false)
const today = localDateKey()
const cycleForm = reactive({ fieldId: '', crop: '', variety: '', seasonYear: new Date().getFullYear(), plannedStart: today, plannedHarvest: addDays(today, 120), targetYield: 10000, budget: 10000, manager: '', notes: '' })
const planForm = reactive({ cycleId: '', title: '', operationType: 'scouting' as OperationType, plannedDate: today, assignee: '', plannedCost: 0, plannedMaterial: '', notes: '' })
const logForm = reactive({ cycleId: '', planId: null as string | null, inventoryItemId: null as string | null, operationType: 'scouting' as OperationType, occurredAt: `${today} 09:00:00`, executor: '', result: '', laborHours: 1, cost: 0, materialQuantity: 0, weather: '', notes: '' })

const operationLabels: Record<OperationType, string> = { tillage: '耕整地', sowing: '播种移栽', irrigation: '灌溉', fertilizing: '施肥', pesticide: '植保用药', scouting: '巡田观察', harvest: '采收', other: '其他' }
const cycleLabels: Record<CropCycleStatus, string> = { planned: '待开季', in_progress: '生产中', harvesting: '采收中', completed: '已结季', cancelled: '已取消' }
const cycleTypes: Record<CropCycleStatus, 'default' | 'info' | 'warning' | 'success' | 'error'> = { planned: 'default', in_progress: 'info', harvesting: 'warning', completed: 'success', cancelled: 'error' }
const planLabels: Record<ProductionPlanStatus, string> = { planned: '待执行', in_progress: '执行中', completed: '已完成', cancelled: '已取消' }
const fieldOptions = computed(() => farm.fields.map((item) => ({ label: item.name, value: item.id })))
const cycleOptions = computed(() => production.cycles.filter((item) => ['planned', 'in_progress'].includes(item.status)).map((item) => ({ label: `${item.code} · ${fieldName(item.fieldId)} · ${item.crop}`, value: item.id })))
const logCycleOptions = computed(() => production.cycles.filter((item) => ['in_progress', 'harvesting'].includes(item.status)).map((item) => ({ label: `${item.code} · ${item.crop}`, value: item.id })))
const planOptions = computed(() => production.plans.filter((item) => item.cycleId === logForm.cycleId && !['completed', 'cancelled'].includes(item.status)).map((item) => ({ label: item.title, value: item.id })))
const inventoryOptions = computed(() => farm.inventory.map((item) => ({ label: `${item.name}（可用 ${item.quantity} ${item.unit}）`, value: String(item.id), disabled: item.quantity <= 0 })))
const selectedInventory = computed(() => farm.inventory.find((item) => String(item.id) === logForm.inventoryItemId))
const activeCycles = computed(() => production.cycles.filter((item) => ['planned', 'in_progress', 'harvesting'].includes(item.status)).length)
const plannedBudget = computed(() => production.cycles.filter((item) => item.status !== 'cancelled').reduce((sum, item) => sum + item.budget, 0))
const actualCost = computed(() => production.logs.reduce((sum, item) => sum + item.cost, 0))
const fieldName = (id: string | number) => farm.fields.find((item) => item.id === id)?.name || '未知地块'
const cycleName = (id: string) => production.cycles.find((item) => item.id === id)?.code || '未知种植季'
const canExecutePlan = (item: ProductionPlan) => ['in_progress', 'harvesting'].includes(production.cycles.find((cycle) => cycle.id === item.cycleId)?.status || '')

function localDateKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function addDays(date: string, days: number) { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function money(value: number) { return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(value) }

async function createCycle() {
  if (!cycleForm.fieldId || !cycleForm.crop.trim() || !cycleForm.manager.trim()) return message.warning('请选择地块并填写作物和负责人')
  try { await production.createCycle({ ...cycleForm }); showCycle.value = false; message.success('种植季已建立') } catch { message.error(production.errors.cycleMutation) }
}
async function createPlan() {
  if (!planForm.cycleId || !planForm.title.trim() || !planForm.assignee.trim()) return message.warning('请选择种植季并填写计划和负责人')
  try { await production.createPlan({ ...planForm }); showPlan.value = false; message.success('生产计划已建立') } catch { message.error(production.errors.planMutation) }
}
async function createLog() {
  if (!logForm.cycleId || !logForm.executor.trim() || !logForm.result.trim()) return message.warning('请选择种植季并填写执行人和结果')
  if (logForm.inventoryItemId && logForm.materialQuantity <= 0) return message.warning('请填写有效的农资领用数量')
  try {
    await production.createLog({ ...logForm, materialQuantity: logForm.inventoryItemId ? logForm.materialQuantity : 0 })
    if (logForm.inventoryItemId) await farm.loadInventory().catch(() => undefined)
    showLog.value = false
    message.success(logForm.inventoryItemId ? '实绩已登记，关联计划和库存已同步更新' : '农事实绩已登记，关联计划已自动完成')
  } catch { message.error(production.errors.logMutation) }
}
async function cycleStatus(item: CropCycle, status: CropCycleStatus) {
  try { await production.updateCycleStatus(item.id, status); message.success('种植季状态已更新') } catch { message.error(production.errors.cycleMutation) }
}
function finishCycle(item: CropCycle) {
  dialog.success({ title: '确认完成结季', content: `确认“${item.code} ${item.crop}”已经完成采收并结季？`, positiveText: '完成结季', negativeText: '取消', onPositiveClick: () => cycleStatus(item, 'completed') })
}
function cancelCycle(item: CropCycle) {
  dialog.warning({ title: '确认取消种植季', content: `取消“${item.code} ${item.crop}”后，其未结束计划也会一并取消，且不能恢复。`, positiveText: '确认取消', negativeText: '返回', onPositiveClick: () => cycleStatus(item, 'cancelled') })
}
async function planStatus(item: ProductionPlan, status: ProductionPlanStatus) {
  try { await production.updatePlanStatus(item.id, status); message.success('生产计划状态已更新') } catch { message.error(production.errors.planMutation) }
}
function cancelPlan(item: ProductionPlan) {
  dialog.warning({ title: '确认取消计划', content: `确认不再执行“${item.title}”？取消后不能恢复。`, positiveText: '确认取消', negativeText: '返回', onPositiveClick: () => planStatus(item, 'cancelled') })
}
function openLog(item?: ProductionPlan) {
  Object.assign(logForm, { cycleId: item?.cycleId || production.cycles.find((cycle) => ['in_progress', 'harvesting'].includes(cycle.status))?.id || '', planId: item?.id || null, inventoryItemId: null, operationType: item?.operationType || 'scouting', occurredAt: `${today} 09:00:00`, executor: item?.assignee || '', result: '', laborHours: 1, cost: 0, materialQuantity: 0, weather: '', notes: '' })
  showLog.value = true
}

function cycleActions(item: CropCycle): TableAction[] {
  const actions: TableAction[] = []
  if (item.status === 'planned') actions.push({ key: 'start', label: '开季', icon: Play, type: 'primary', onClick: () => cycleStatus(item, 'in_progress') })
  if (item.status === 'in_progress') actions.push({ key: 'harvest', label: '进入采收', type: 'warning', onClick: () => cycleStatus(item, 'harvesting') })
  if (item.status === 'harvesting') actions.push({ key: 'finish', label: '完成结季', icon: Check, type: 'success', onClick: () => finishCycle(item) })
  if (['planned', 'in_progress'].includes(item.status)) actions.push({ key: 'cancel', label: '取消', icon: CircleX, type: 'error', quaternary: true, onClick: () => cancelCycle(item) })
  return actions
}

function planActions(item: ProductionPlan): TableAction[] {
  const actions: TableAction[] = []
  if (item.status === 'planned' && canExecutePlan(item)) actions.push({ key: 'start', label: '开始', secondary: true, onClick: () => planStatus(item, 'in_progress') })
  if (['planned', 'in_progress'].includes(item.status) && canExecutePlan(item)) actions.push({ key: 'log', label: '登记实绩', type: 'primary', onClick: () => openLog(item) })
  if (['planned', 'in_progress'].includes(item.status)) actions.push({ key: 'cancel', label: '取消', type: 'error', quaternary: true, onClick: () => cancelPlan(item) })
  return actions
}

onMounted(() => Promise.all([farm.loadFields(), farm.loadInventory(), production.loadProduction()]).catch(() => undefined))
</script>

<template>
  <page-header title="种植季与生产执行" description="按地块建立种植季，将计划与实际执行记录分开管理">
    <n-button secondary @click="showCycle = true"><template #icon><Plus /></template>新建种植季</n-button><n-button secondary @click="showPlan = true"><template #icon><ClipboardList /></template>新增计划</n-button><n-button type="primary" @click="openLog()"><template #icon><Plus /></template>登记实绩</n-button>
  </page-header>
  <div class="domain-kpis"><div><span class="domain-kpi-icon"><Wheat /></span><small>活跃种植季</small><strong>{{ activeCycles }}</strong><em>个</em></div><div><span class="domain-kpi-icon blue"><CalendarRange /></span><small>生产预算</small><strong>{{ money(plannedBudget) }}</strong><em>全部非取消季</em></div><div><span class="domain-kpi-icon amber"><History /></span><small>已登记成本</small><strong>{{ money(actualCost) }}</strong><em>{{ production.logs.length }} 条实绩</em></div></div>

  <state-panel :loading="production.loading.cycles || production.loading.plans || production.loading.logs" :error="production.errors.cycles || production.errors.plans || production.errors.logs" @retry="production.loadProduction">
    <n-tabs type="line" animated>
      <n-tab-pane name="cycles" tab="种植季">
        <div class="table-wrap production-table action-table"><n-table :single-line="false"><thead><tr><th>种植季</th><th>地块</th><th>计划周期</th><th>目标产量</th><th>预算</th><th>负责人</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="item in production.cycles" :key="item.id"><td><strong>{{ item.code }} · {{ item.crop }}</strong><small class="cell-detail">{{ item.variety || '未填写品种' }} · {{ item.notes || '无说明' }}</small></td><td>{{ fieldName(item.fieldId) }}</td><td>{{ item.plannedStart }} 至 {{ item.plannedHarvest }}</td><td>{{ item.targetYield.toLocaleString() }} kg</td><td>{{ money(item.budget) }}</td><td>{{ item.manager }}</td><td><n-tag size="small" :type="cycleTypes[item.status]">{{ cycleLabels[item.status] }}</n-tag></td><td><table-actions :actions="cycleActions(item)" /></td></tr></tbody></n-table></div>
      </n-tab-pane>
      <n-tab-pane name="plans" tab="生产计划">
        <div class="table-wrap production-table action-table"><n-table :single-line="false"><thead><tr><th>计划</th><th>种植季</th><th>类型</th><th>计划日期</th><th>负责人</th><th>预计成本/物料</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="item in production.plans" :key="item.id"><td><strong>{{ item.title }}</strong><small class="cell-detail">{{ item.notes || '无补充说明' }}</small></td><td>{{ cycleName(item.cycleId) }}</td><td>{{ operationLabels[item.operationType] }}</td><td>{{ item.plannedDate }}</td><td>{{ item.assignee }}</td><td>{{ money(item.plannedCost) }}<small class="cell-detail">{{ item.plannedMaterial || '未指定物料' }}</small></td><td><n-tag size="small" :type="item.status === 'completed' ? 'success' : item.status === 'in_progress' ? 'info' : item.status === 'cancelled' ? 'error' : 'warning'">{{ planLabels[item.status] }}</n-tag></td><td><table-actions :actions="planActions(item)" :note="['planned','in_progress'].includes(item.status) && !canExecutePlan(item) ? '等待开季' : ''" /></td></tr></tbody></n-table></div>
      </n-tab-pane>
      <n-tab-pane name="logs" tab="农事实绩">
        <div class="operation-timeline"><article v-for="item in production.logs" :key="item.id"><span class="timeline-dot" /><div class="timeline-date">{{ new Date(item.occurredAt).toLocaleString('zh-CN', { hour12: false }) }}</div><div class="timeline-body"><div><strong>{{ operationLabels[item.operationType] }} · {{ cycleName(item.cycleId) }}</strong><n-tag size="tiny" :bordered="false">{{ fieldName(item.fieldId) }}</n-tag></div><p>{{ item.result }}</p><small>执行：{{ item.executor }} · 工时 {{ item.laborHours }}h · 成本 {{ money(item.cost) }}<template v-if="item.materialName"> · {{ item.materialName }} {{ item.materialQuantity }}{{ item.materialUnit }}</template><template v-if="item.weather"> · {{ item.weather }}</template></small></div></article></div>
      </n-tab-pane>
    </n-tabs>
  </state-panel>

  <n-modal v-model:show="showCycle" preset="card" title="新建种植季" class="form-modal" :bordered="false"><n-form :model="cycleForm" label-placement="top"><div class="form-grid"><n-form-item label="生产地块" required><n-select v-model:value="cycleForm.fieldId" :options="fieldOptions" /></n-form-item><n-form-item label="作物" required><n-input v-model:value="cycleForm.crop" /></n-form-item><n-form-item label="品种"><n-input v-model:value="cycleForm.variety" /></n-form-item><n-form-item label="季节年度"><n-input-number v-model:value="cycleForm.seasonYear" :min="2000" :max="2100" /></n-form-item><n-form-item label="计划开始"><n-date-picker v-model:formatted-value="cycleForm.plannedStart" value-format="yyyy-MM-dd" type="date" /></n-form-item><n-form-item label="计划采收"><n-date-picker v-model:formatted-value="cycleForm.plannedHarvest" value-format="yyyy-MM-dd" type="date" /></n-form-item><n-form-item label="目标产量（kg）"><n-input-number v-model:value="cycleForm.targetYield" :min="0" /></n-form-item><n-form-item label="预算（元）"><n-input-number v-model:value="cycleForm.budget" :min="0" /></n-form-item><n-form-item label="负责人" required><n-input v-model:value="cycleForm.manager" /></n-form-item></div><n-form-item label="生产说明"><n-input v-model:value="cycleForm.notes" type="textarea" :rows="3" /></n-form-item><div class="modal-actions"><n-button @click="showCycle = false">取消</n-button><n-button type="primary" :loading="production.loading.cycleMutation" @click="createCycle">建立种植季</n-button></div></n-form></n-modal>
  <n-modal v-model:show="showPlan" preset="card" title="新增生产计划" class="form-modal" :bordered="false"><n-form :model="planForm" label-placement="top"><div class="form-grid"><n-form-item label="种植季" required><n-select v-model:value="planForm.cycleId" :options="cycleOptions" /></n-form-item><n-form-item label="计划名称" required><n-input v-model:value="planForm.title" /></n-form-item><n-form-item label="农事类型"><n-select v-model:value="planForm.operationType" :options="Object.entries(operationLabels).map(([value,label]) => ({value,label}))" /></n-form-item><n-form-item label="计划日期"><n-date-picker v-model:formatted-value="planForm.plannedDate" value-format="yyyy-MM-dd" type="date" /></n-form-item><n-form-item label="负责人" required><n-input v-model:value="planForm.assignee" /></n-form-item><n-form-item label="预计成本"><n-input-number v-model:value="planForm.plannedCost" :min="0" /></n-form-item></div><n-form-item label="预计物料"><n-input v-model:value="planForm.plannedMaterial" /></n-form-item><n-form-item label="说明"><n-input v-model:value="planForm.notes" type="textarea" :rows="3" /></n-form-item><div class="modal-actions"><n-button @click="showPlan = false">取消</n-button><n-button type="primary" :loading="production.loading.planMutation" @click="createPlan">保存计划</n-button></div></n-form></n-modal>
  <n-modal v-model:show="showLog" preset="card" title="登记农事实绩" class="form-modal wide-modal" :bordered="false"><n-form :model="logForm" label-placement="top"><div class="form-grid"><n-form-item label="种植季" required><n-select v-model:value="logForm.cycleId" :options="logCycleOptions" /></n-form-item><n-form-item label="关联计划"><n-select v-model:value="logForm.planId" clearable :options="planOptions" /></n-form-item><n-form-item label="农事类型"><n-select v-model:value="logForm.operationType" :options="Object.entries(operationLabels).map(([value,label]) => ({value,label}))" /></n-form-item><n-form-item label="执行时间"><n-date-picker v-model:formatted-value="logForm.occurredAt" value-format="yyyy-MM-dd HH:mm:ss" type="datetime" /></n-form-item><n-form-item label="执行人" required><n-input v-model:value="logForm.executor" /></n-form-item><n-form-item label="工时"><n-input-number v-model:value="logForm.laborHours" :min="0" /></n-form-item><n-form-item label="实际成本"><n-input-number v-model:value="logForm.cost" :min="0" /></n-form-item><n-form-item label="天气/环境"><n-input v-model:value="logForm.weather" /></n-form-item><n-form-item label="库存农资"><n-select v-model:value="logForm.inventoryItemId" clearable filterable :options="inventoryOptions" placeholder="未使用库存农资可不选" /></n-form-item><n-form-item :label="selectedInventory ? `领用数量（${selectedInventory.unit}）` : '领用数量'"><n-input-number v-model:value="logForm.materialQuantity" :min="0" :max="selectedInventory ? selectedInventory.quantity : 100000000" :disabled="!logForm.inventoryItemId" /></n-form-item></div><n-alert v-if="logForm.inventoryItemId" type="info" :bordered="false">保存后将同步扣减库存并写入该地块的生产领用流水。</n-alert><n-form-item label="执行结果" required><n-input v-model:value="logForm.result" type="textarea" :rows="3" /></n-form-item><n-form-item label="备注"><n-input v-model:value="logForm.notes" /></n-form-item><div class="modal-actions"><n-button @click="showLog = false">取消</n-button><n-button type="primary" :loading="production.loading.logMutation" @click="createLog">保存实绩</n-button></div></n-form></n-modal>
</template>

<style scoped>
.production-table .n-table { min-width: 1120px; }
.operation-timeline { padding: 10px 4px; }.operation-timeline article { min-height: 94px; display: grid; grid-template-columns: 18px 155px minmax(0, 1fr); gap: 12px; position: relative; }.operation-timeline article::before { content: ''; position: absolute; left: 7px; top: 17px; bottom: -1px; width: 1px; background: #dce4df; }.operation-timeline article:last-child::before { display: none; }.timeline-dot { width: 15px; height: 15px; margin-top: 4px; z-index: 1; border: 4px solid #dfe9e2; border-radius: 50%; background: #4e765c; }.timeline-date { padding-top: 2px; color: #7c8983; font-size: 11px; }.timeline-body { padding: 0 0 20px; border-bottom: 1px solid #edf0ee; }.timeline-body > div { display: flex; align-items: center; gap: 8px; }.timeline-body p { margin: 7px 0; color: #55635c; font-size: 13px; }.timeline-body small { color: #84908a; font-size: 11px; }
.wide-modal { width: min(720px, calc(100vw - 32px)); }
@media (max-width: 700px) { .operation-timeline article { grid-template-columns: 18px 1fr; }.timeline-date { grid-column: 2; }.timeline-body { grid-column: 2; } }
</style>
