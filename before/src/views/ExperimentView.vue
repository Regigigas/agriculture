<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { Camera, Droplets, FileUp, Plus, Radar, Sprout } from '@/icons/iconpark'
import ExperimentScene3D, { type TrialKind, type TrialPlot } from '@/components/ExperimentScene3D.vue'

interface TrialKindInfo { key: TrialKind; label: string; description: string; custom?: boolean }
interface CustomTreatment { code: string; label: string; treatment: string; value: number }
interface CustomTrial { id: string; label: string; description: string; unit: string; repetitions: number; treatments: CustomTreatment[] }
interface TrialResult {
  id: string
  trialKey: string
  plotId: string
  metric: 'height' | 'yield' | 'ndvi' | 'coverage' | 'temperature' | 'pestRisk' | 'other'
  metricLabel: string
  value: number
  unit: string
  source: 'manual' | 'drone'
  recordedAt: string
  note: string
}

const storageKey = 'fengyu-agriculture-custom-trials'
const resultStorageKey = 'fengyu-agriculture-trial-results'
const message = useMessage()
const activeKind = ref<TrialKind>('fertilizer')
const activeCustomId = ref('')
const selectedPlotId = ref('f-0')
const showDrone = ref(true)
const droneMode = ref<'scouting' | 'application'>('scouting')
const createVisible = ref(false)
const resultVisible = ref(false)
const droneResultVisible = ref(false)
const customTrials = ref<CustomTrial[]>([])
const results = ref<TrialResult[]>([])
const draft = ref<CustomTrial>(emptyDraft())
const resultDraft = ref({ metric: 'height' as TrialResult['metric'], value: null as number | null, unit: 'cm', recordedAt: localDateKey(), note: '' })
const droneCsv = ref('')

const metricOptions = [
  { label: '株高', value: 'height', unit: 'cm' },
  { label: '实收产量', value: 'yield', unit: 'kg/亩' },
  { label: 'NDVI 长势指数', value: 'ndvi', unit: '' },
  { label: '冠层覆盖率', value: 'coverage', unit: '%' },
  { label: '冠层温度', value: 'temperature', unit: '℃' },
  { label: '病虫风险', value: 'pestRisk', unit: '%' },
  { label: '其他指标', value: 'other', unit: '' },
]

const builtInKinds: TrialKindInfo[] = [
  { key: 'fertilizer', label: '施肥梯度', description: '空白对照与氮肥梯度，比较长势、投入和预估产量' },
  { key: 'shade', label: '遮光强度', description: '按不同遮光率分区，观察冠层、温湿度与生长响应' },
  { key: 'soil', label: '土壤消毒', description: '对照太阳能消毒时长，跟踪土传病虫与杂草压力' },
  { key: 'irrigation', label: '灌溉制度', description: '比较不同灌水量或灌溉间隔下的水分利用效率与产量' },
  { key: 'variety', label: '品种比较', description: '在相同管理条件下比较品种的长势、抗性、成熟期和产量' },
  { key: 'density', label: '种植密度', description: '比较株行距和群体密度对冠层、倒伏及单位面积产量的影响' },
  { key: 'sowing', label: '播期试验', description: '比较早播、常规播期和晚播对物候、风险及成熟度的影响' },
  { key: 'pest', label: '病虫防治', description: '设置未处理对照，比较生物、物理与常规防治的效果和投入' },
  { key: 'mulch', label: '覆盖栽培', description: '比较裸地、秸秆和不同地膜处理的保墒、增温与杂草抑制效果' },
]

function repeatedPlots(prefix: string, unit: string, treatments: Array<Omit<TrialPlot, 'id' | 'unit'>>, repetitions = 2) {
  return Array.from({ length: repetitions }, (_, repeat) => treatments.map((_, position) => {
    const treatmentIndex = (position + repeat) % treatments.length
    const item = treatments[treatmentIndex]
    return {
      ...item,
      id: `${prefix}-${repeat}-${treatmentIndex}`,
      code: repeat ? `${item.code}-R${repeat + 1}` : item.code,
      label: repeat ? `${item.label}·重复${repeat + 1}` : item.label,
      unit,
      growth: Math.max(0.3, Math.min(1, item.growth + (repeat ? ((treatmentIndex * 3) % 5 - 2) / 100 : 0))),
    }
  })).flat()
}

const trialData: Record<Exclude<TrialKind, 'custom'>, TrialPlot[]> = {
  fertilizer: [
    { id: 'f-0', code: 'CK', label: '空白对照', treatment: '不施氮肥', value: 0, unit: 'kg/亩', color: 0x78934f, growth: 0.46 },
    { id: 'f-1', code: 'N1', label: '低量施肥', treatment: '氮肥减量 25%', value: 8, unit: 'kg/亩', color: 0x699348, growth: 0.62 },
    { id: 'f-2', code: 'N2', label: '常规施肥', treatment: '当前标准用量', value: 12, unit: 'kg/亩', color: 0x4f873e, growth: 0.82 },
    { id: 'f-3', code: 'N3', label: '高量施肥', treatment: '标准用量增加 25%', value: 16, unit: 'kg/亩', color: 0x3f7437, growth: 0.88 },
    { id: 'f-4', code: 'CK-R', label: '对照重复', treatment: '不施氮肥重复区', value: 0, unit: 'kg/亩', color: 0x78934f, growth: 0.49 },
    { id: 'f-5', code: 'N1-R', label: '低量重复', treatment: '氮肥减量重复区', value: 8, unit: 'kg/亩', color: 0x699348, growth: 0.65 },
    { id: 'f-6', code: 'N2-R', label: '常规重复', treatment: '标准用量重复区', value: 12, unit: 'kg/亩', color: 0x4f873e, growth: 0.8 },
    { id: 'f-7', code: 'N3-R', label: '高量重复', treatment: '增量施肥重复区', value: 16, unit: 'kg/亩', color: 0x3f7437, growth: 0.84 },
  ],
  shade: [
    { id: 's-0', code: 'CK', label: '自然光对照', treatment: '无遮光网', value: 0, unit: '%', color: 0x6f9447, growth: 0.8 },
    { id: 's-1', code: 'S20', label: '轻度遮光', treatment: '20% 遮光网', value: 20, unit: '%', color: 0x66904b, growth: 0.9 },
    { id: 's-2', code: 'S40', label: '中度遮光', treatment: '40% 遮光网', value: 40, unit: '%', color: 0x587f45, growth: 0.72 },
    { id: 's-3', code: 'S60', label: '重度遮光', treatment: '60% 遮光网', value: 60, unit: '%', color: 0x4c6f43, growth: 0.51 },
    { id: 's-4', code: 'CK-R', label: '自然光重复', treatment: '无遮光网重复区', value: 0, unit: '%', color: 0x6f9447, growth: 0.78 },
    { id: 's-5', code: 'S20-R', label: '轻度重复', treatment: '20% 遮光重复区', value: 20, unit: '%', color: 0x66904b, growth: 0.87 },
    { id: 's-6', code: 'S40-R', label: '中度重复', treatment: '40% 遮光重复区', value: 40, unit: '%', color: 0x587f45, growth: 0.7 },
    { id: 's-7', code: 'S60-R', label: '重度重复', treatment: '60% 遮光重复区', value: 60, unit: '%', color: 0x4c6f43, growth: 0.48 },
  ],
  soil: [
    { id: 't-0', code: 'CK', label: '未处理对照', treatment: '常规整地', value: 0, unit: '天', color: 0x798b4d, growth: 0.48 },
    { id: 't-1', code: 'D15', label: '短期覆膜', treatment: '湿土透明膜覆盖', value: 15, unit: '天', color: 0x6d944d, growth: 0.62 },
    { id: 't-2', code: 'D30', label: '标准消毒', treatment: '太阳能消毒 30 天', value: 30, unit: '天', color: 0x579044, growth: 0.8 },
    { id: 't-3', code: 'D40', label: '强化消毒', treatment: '太阳能消毒 40 天', value: 40, unit: '天', color: 0x44823d, growth: 0.9 },
    { id: 't-4', code: 'CK-R', label: '未处理重复', treatment: '常规整地重复区', value: 0, unit: '天', color: 0x798b4d, growth: 0.5 },
    { id: 't-5', code: 'D15-R', label: '短期重复', treatment: '15 天覆膜重复区', value: 15, unit: '天', color: 0x6d944d, growth: 0.64 },
    { id: 't-6', code: 'D30-R', label: '标准重复', treatment: '30 天消毒重复区', value: 30, unit: '天', color: 0x579044, growth: 0.78 },
    { id: 't-7', code: 'D40-R', label: '强化重复', treatment: '40 天消毒重复区', value: 40, unit: '天', color: 0x44823d, growth: 0.87 },
  ],
  irrigation: repeatedPlots('i', '%', [
    { code: 'I50', label: '节水灌溉', treatment: '需水量的 50%', value: 50, color: 0x77915a, growth: 0.55 },
    { code: 'I75', label: '亏缺灌溉', treatment: '需水量的 75%', value: 75, color: 0x66934e, growth: 0.76 },
    { code: 'CK', label: '常规灌溉', treatment: '需水量的 100%', value: 100, color: 0x4e8a45, growth: 0.88 },
    { code: 'I125', label: '充分灌溉', treatment: '需水量的 125%', value: 125, color: 0x467b42, growth: 0.83 },
  ]),
  variety: repeatedPlots('v', '品种', [
    { code: 'CK', label: '本地主栽', treatment: '本地主栽品种', value: 1, color: 0x78934f, growth: 0.68 },
    { code: 'V2', label: '抗病品种', treatment: '抗病候选品种', value: 2, color: 0x5b9148, growth: 0.86 },
    { code: 'V3', label: '早熟品种', treatment: '早熟候选品种', value: 3, color: 0x789d4d, growth: 0.76 },
    { code: 'V4', label: '高产品种', treatment: '高产候选品种', value: 4, color: 0x43833e, growth: 0.92 },
  ]),
  density: repeatedPlots('d', '株/㎡', [
    { code: 'D1', label: '低密度', treatment: '稀植通风处理', value: 4, color: 0x709452, growth: 0.62 },
    { code: 'CK', label: '常规密度', treatment: '当地标准株行距', value: 6, color: 0x559048, growth: 0.84 },
    { code: 'D2', label: '中高密度', treatment: '标准密度增加 25%', value: 7.5, color: 0x477f41, growth: 0.9 },
    { code: 'D3', label: '高密度', treatment: '标准密度增加 50%', value: 9, color: 0x3f733b, growth: 0.72 },
  ]),
  sowing: repeatedPlots('sd', '天', [
    { code: 'S-14', label: '提前播种', treatment: '标准播期前 14 天', value: -14, color: 0x6f8f52, growth: 0.64 },
    { code: 'S-7', label: '适度早播', treatment: '标准播期前 7 天', value: -7, color: 0x60934a, growth: 0.81 },
    { code: 'CK', label: '常规播期', treatment: '当地推荐播期', value: 0, color: 0x4d8843, growth: 0.88 },
    { code: 'S+7', label: '延后播种', treatment: '标准播期后 7 天', value: 7, color: 0x718b4e, growth: 0.7 },
  ]),
  pest: repeatedPlots('p', '方案', [
    { code: 'CK', label: '未处理对照', treatment: '清水处理，不采取防治', value: 0, color: 0x8a884b, growth: 0.46 },
    { code: 'BIO', label: '生物防治', treatment: '天敌或生物制剂', value: 1, color: 0x60904a, growth: 0.75 },
    { code: 'PHY', label: '物理防治', treatment: '诱捕、隔离或人工清除', value: 2, color: 0x6b944f, growth: 0.7 },
    { code: 'IPM', label: '综合防治', treatment: '监测阈值下的综合防治', value: 3, color: 0x43833e, growth: 0.9 },
  ]),
  mulch: repeatedPlots('m', '类型', [
    { code: 'CK', label: '裸地对照', treatment: '不覆盖', value: 0, color: 0x7c8d50, growth: 0.58 },
    { code: 'ST', label: '秸秆覆盖', treatment: '作物秸秆覆盖', value: 1, color: 0x78964d, growth: 0.76 },
    { code: 'BF', label: '黑色地膜', treatment: '黑色可降解膜', value: 2, color: 0x548843, growth: 0.84 },
    { code: 'TF', label: '透明地膜', treatment: '透明地膜增温', value: 3, color: 0x47813f, growth: 0.88 },
  ]),
}

const activeCustomTrial = computed(() => customTrials.value.find((item) => item.id === activeCustomId.value))
const plots = computed(() => activeKind.value === 'custom' && activeCustomTrial.value
  ? customTrialPlots(activeCustomTrial.value)
  : trialData[activeKind.value as Exclude<TrialKind, 'custom'>])
const selectedPlot = computed(() => plots.value.find((item) => item.id === selectedPlotId.value) || plots.value[0])
const activeKindInfo = computed(() => activeKind.value === 'custom' && activeCustomTrial.value
  ? { key: 'custom' as const, label: activeCustomTrial.value.label, description: activeCustomTrial.value.description, custom: true }
  : builtInKinds.find((item) => item.key === activeKind.value)!)
const controlGrowth = computed(() => {
  const controls = plots.value.filter((item) => item.code.startsWith('CK'))
  return controls.length ? controls.reduce((sum, item) => sum + item.growth, 0) / controls.length : plots.value[0]?.growth || 1
})
const growthDelta = computed(() => Math.round((selectedPlot.value.growth / controlGrowth.value - 1) * 100))
const predictedYield = computed(() => Math.round(390 + selectedPlot.value.growth * 235))
const currentTrialKey = computed(() => activeKind.value === 'custom' ? activeCustomId.value : activeKind.value)
const currentResults = computed(() => results.value.filter((item) => item.trialKey === currentTrialKey.value))
const selectedResults = computed(() => currentResults.value.filter((item) => item.plotId === selectedPlot.value.id).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)))
const latestNdvi = computed(() => selectedResults.value.find((item) => item.metric === 'ndvi'))
const latestYield = computed(() => selectedResults.value.find((item) => item.metric === 'yield'))
const measuredComparison = computed(() => {
  const selected = latestYield.value || latestNdvi.value
  if (!selected) return null
  const controlValues = plots.value.filter((plot) => plot.code.startsWith('CK')).map((plot) =>
    currentResults.value.filter((item) => item.plotId === plot.id && item.metric === selected.metric).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0]?.value,
  ).filter((value): value is number => typeof value === 'number')
  if (!controlValues.length) return null
  const controlAverage = controlValues.reduce((sum, value) => sum + value, 0) / controlValues.length
  return controlAverage ? Math.round((selected.value / controlAverage - 1) * 100) : null
})
const resultCoverage = computed(() => plots.value.length
  ? Math.round(new Set(currentResults.value.map((item) => item.plotId)).size / plots.value.length * 100)
  : 0)

function changeKind(kind: TrialKind, customId = '') {
  activeKind.value = kind
  activeCustomId.value = customId
  selectedPlotId.value = kind === 'custom' && customId
    ? customTrialPlots(customTrials.value.find((item) => item.id === customId)!)[0]?.id || ''
    : trialData[kind as Exclude<TrialKind, 'custom'>][0].id
}

function emptyDraft(): CustomTrial {
  return {
    id: '', label: '', description: '', unit: '%', repetitions: 3,
    treatments: [
      { code: 'CK', label: '对照组', treatment: '常规管理或不处理', value: 0 },
      { code: 'T1', label: '处理一', treatment: '填写具体处理措施', value: 1 },
    ],
  }
}

function customTrialPlots(trial: CustomTrial): TrialPlot[] {
  const palette = [0x78934f, 0x60934a, 0x4f8843, 0x3f773b, 0x80994f, 0x477d52]
  return repeatedPlots(`custom-${trial.id}`, trial.unit, trial.treatments.map((item, index) => ({
    ...item,
    color: palette[index % palette.length],
    growth: Math.min(0.94, 0.58 + index * 0.1),
  })), trial.repetitions)
}

function openCreate() {
  draft.value = emptyDraft()
  createVisible.value = true
}

function openEdit() {
  if (!activeCustomTrial.value) return
  draft.value = JSON.parse(JSON.stringify(activeCustomTrial.value))
  createVisible.value = true
}

function addTreatment() {
  const index = draft.value.treatments.length
  if (index >= 6) return
  draft.value.treatments.push({ code: `T${index}`, label: `处理${index}`, treatment: '', value: index })
}

function saveCustomTrial() {
  const name = draft.value.label.trim()
  const description = draft.value.description.trim()
  if (!name || !description) return message.warning('请填写试验名称和试验目标')
  if (draft.value.treatments.length < 2 || draft.value.treatments.some((item) => !item.code.trim() || !item.label.trim() || !item.treatment.trim())) {
    return message.warning('至少需要完整填写一个对照组和一个处理组')
  }
  const trial: CustomTrial = { ...draft.value, id: draft.value.id || `trial-${Date.now()}`, label: name, description }
  const existingIndex = customTrials.value.findIndex((item) => item.id === trial.id)
  if (existingIndex >= 0) customTrials.value.splice(existingIndex, 1, trial)
  else customTrials.value.push(trial)
  localStorage.setItem(storageKey, JSON.stringify(customTrials.value))
  const validPlotIds = new Set(customTrialPlots(trial).map((plot) => plot.id))
  results.value = results.value.filter((item) => item.trialKey !== trial.id || validPlotIds.has(item.plotId))
  saveResults()
  createVisible.value = false
  changeKind('custom', trial.id)
  message.success(existingIndex >= 0 ? '自定义试验已更新' : '自定义试验已保存到本机')
}

function deleteCustomTrial() {
  const trial = activeCustomTrial.value
  if (!trial) return
  customTrials.value = customTrials.value.filter((item) => item.id !== trial.id)
  results.value = results.value.filter((item) => item.trialKey !== trial.id)
  localStorage.setItem(storageKey, JSON.stringify(customTrials.value))
  saveResults()
  changeKind('fertilizer')
  message.success('自定义试验及其观测记录已删除')
}

function localDateKey() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function openResultEntry() {
  resultDraft.value = { metric: 'height', value: null, unit: 'cm', recordedAt: localDateKey(), note: '' }
  resultVisible.value = true
}

function changeMetric(metric: TrialResult['metric']) {
  resultDraft.value.metric = metric
  resultDraft.value.unit = metricOptions.find((item) => item.value === metric)?.unit || ''
}

function saveResults() {
  localStorage.setItem(resultStorageKey, JSON.stringify(results.value))
}

function saveManualResult() {
  if (resultDraft.value.value === null || !Number.isFinite(resultDraft.value.value)) return message.warning('请填写有效的测量结果')
  const metric = metricOptions.find((item) => item.value === resultDraft.value.metric)!
  results.value.push({
    id: `result-${Date.now()}`,
    trialKey: currentTrialKey.value,
    plotId: selectedPlot.value.id,
    metric: resultDraft.value.metric,
    metricLabel: metric.label,
    value: resultDraft.value.value,
    unit: resultDraft.value.unit.trim(),
    source: 'manual',
    recordedAt: resultDraft.value.recordedAt,
    note: resultDraft.value.note.trim(),
  })
  saveResults()
  resultVisible.value = false
  message.success(`已记录 ${selectedPlot.value.code} 的${metric.label}`)
}

function sampleDroneCsv() {
  droneCsv.value = ['plotCode,ndvi,coverage,temperature,pestRisk', ...plots.value.map((plot, index) => {
    const ndvi = Math.min(0.92, 0.42 + plot.growth * 0.48 + (index % 3) * 0.01).toFixed(2)
    const coverage = Math.round(38 + plot.growth * 58)
    const temperature = (31.8 - plot.growth * 5 + (index % 2) * 0.4).toFixed(1)
    const pestRisk = Math.max(3, Math.round(52 - plot.growth * 48))
    return `${plot.code},${ndvi},${coverage},${temperature},${pestRisk}`
  })].join('\n')
}

function loadDroneFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { droneCsv.value = String(reader.result || '') }
  reader.readAsText(file, 'utf-8')
  input.value = ''
}

function importDroneResults() {
  const rows = droneCsv.value.trim().split(/\r?\n/).filter(Boolean)
  if (rows.length < 2) return message.warning('请选择 CSV 文件或粘贴巡检结果')
  const header = rows[0].split(',').map((item) => item.trim())
  const required = ['plotCode', 'ndvi', 'coverage', 'temperature', 'pestRisk']
  if (required.some((item) => !header.includes(item))) return message.error('CSV 表头必须包含 plotCode、ndvi、coverage、temperature、pestRisk')
  let imported = 0
  const today = localDateKey()
  const metricMap: Array<{ key: string; metric: TrialResult['metric']; label: string; unit: string }> = [
    { key: 'ndvi', metric: 'ndvi', label: 'NDVI 长势指数', unit: '' },
    { key: 'coverage', metric: 'coverage', label: '冠层覆盖率', unit: '%' },
    { key: 'temperature', metric: 'temperature', label: '冠层温度', unit: '℃' },
    { key: 'pestRisk', metric: 'pestRisk', label: '病虫风险', unit: '%' },
  ]
  rows.slice(1).forEach((line, rowIndex) => {
    const values = line.split(',').map((item) => item.trim())
    const row = Object.fromEntries(header.map((key, index) => [key, values[index]]))
    const plot = plots.value.find((item) => item.code === row.plotCode)
    if (!plot) return
    metricMap.forEach((item) => {
      const value = Number(row[item.key])
      if (!Number.isFinite(value)) return
      results.value.push({ id: `drone-${Date.now()}-${rowIndex}-${item.metric}`, trialKey: currentTrialKey.value, plotId: plot.id, metric: item.metric, metricLabel: item.label, value, unit: item.unit, source: 'drone', recordedAt: today, note: '无人机巡检 CSV 导入' })
      imported += 1
    })
  })
  if (!imported) return message.error('没有找到可匹配的样方编号或有效数值')
  saveResults()
  droneResultVisible.value = false
  message.success(`已导入 ${imported} 条无人机巡检指标`)
}

onMounted(() => {
  try { customTrials.value = JSON.parse(localStorage.getItem(storageKey) || '[]') }
  catch { customTrials.value = [] }
  try { results.value = JSON.parse(localStorage.getItem(resultStorageKey) || '[]') }
  catch { results.value = [] }
})
</script>

<template>
  <div class="experiment-page">
    <section class="experiment-workspace">
      <ExperimentScene3D
        :plots="plots"
        :kind="activeKind"
        :selected-plot-id="selectedPlot.id"
        :show-drone="showDrone"
        :drone-mode="droneMode"
        @select="selectedPlotId = $event"
      />

      <div class="experiment-toolbar">
        <div class="kind-picker">
          <n-select
            :value="activeKind === 'custom' ? activeCustomId : activeKind"
            :options="[
              { type: 'group', label: '内置试验模板', key: 'built-in', children: builtInKinds.map((item) => ({ label: item.label, value: item.key })) },
              ...(customTrials.length ? [{ type: 'group', label: '我的自定义试验', key: 'custom', children: customTrials.map((item) => ({ label: item.label, value: item.id })) }] : []),
            ]"
            aria-label="切换对照试验类型"
            @update:value="(value: string) => builtInKinds.some((item) => item.key === value) ? changeKind(value as TrialKind) : changeKind('custom', value)"
          />
          <n-button secondary @click="openCreate"><template #icon><Plus /></template>新建试验</n-button>
        </div>
        <div class="drone-controls">
          <n-switch v-model:value="showDrone" size="small" /><span>无人机</span>
          <n-select v-model:value="droneMode" size="small" :disabled="!showDrone" :options="[{ label: '巡测采集', value: 'scouting' }, { label: '精准作业', value: 'application' }]" />
        </div>
      </div>

      <aside class="experiment-panel">
        <div class="panel-heading"><div><small>田间对照试验</small><h2>{{ activeKindInfo.label }}</h2></div><span>RCBD · {{ activeCustomTrial?.repetitions || 2 }} 次重复</span></div>
        <p>{{ activeKindInfo.description }}</p>
        <div v-if="activeKind === 'custom'" class="custom-actions">
          <n-button size="tiny" secondary @click="openEdit">编辑试验</n-button>
          <n-popconfirm positive-text="删除" negative-text="取消" @positive-click="deleteCustomTrial">
            <template #trigger><n-button size="tiny" quaternary type="error">删除试验</n-button></template>
            删除后，该试验的全部样方观测记录也会一并删除。
          </n-popconfirm>
        </div>
        <div class="result-actions">
          <n-button type="primary" size="small" @click="openResultEntry"><template #icon><Plus /></template>录入当前样方结果</n-button>
          <n-button size="small" @click="droneResultVisible = true"><template #icon><FileUp /></template>导入无人机结果</n-button>
        </div>
        <div class="plot-list">
          <button v-for="plot in plots" :key="plot.id" :class="{ active: plot.id === selectedPlot.id }" @click="selectedPlotId = plot.id">
            <i :style="{ background: `#${plot.color.toString(16).padStart(6, '0')}` }" />
            <span><strong>{{ plot.code }} · {{ plot.label }}</strong><small>{{ plot.treatment }}</small></span>
            <b><em v-if="currentResults.some((item) => item.plotId === plot.id)">{{ currentResults.filter((item) => item.plotId === plot.id).length }} 项结果</em>{{ plot.value }}{{ plot.unit }}</b>
          </button>
        </div>
      </aside>

      <section class="trial-readout">
        <div><small>当前样方</small><strong>{{ selectedPlot.code }}</strong><span>{{ selectedPlot.treatment }}</span></div>
        <div><Sprout /><small>{{ measuredComparison !== null ? '较对照实测变化' : '较对照模拟长势' }}</small><strong>{{ measuredComparison !== null ? `${measuredComparison >= 0 ? '+' : ''}${measuredComparison}%` : `${growthDelta >= 0 ? '+' : ''}${growthDelta}%` }}</strong></div>
        <div><Droplets /><small>{{ latestYield ? '实收亩产' : '预估亩产' }}</small><strong>{{ latestYield?.value ?? predictedYield }} kg</strong></div>
        <div><Radar /><small>样方记录覆盖</small><strong>{{ resultCoverage }}%</strong></div>
        <div class="drone-status"><Camera /><span><small>{{ showDrone ? (droneMode === 'scouting' ? '多光谱巡测中' : '变量作业待执行') : '无人机未启用' }}</small><strong>{{ showDrone ? `航线覆盖 ${plots.length}/${plots.length} 样方` : '—' }}</strong></span></div>
      </section>
    </section>

    <n-modal v-model:show="createVisible" preset="card" :title="draft.id ? '编辑自定义对照试验' : '新建自定义对照试验'" :style="{ width: 'min(760px, calc(100vw - 28px))' }">
      <n-form label-placement="top">
        <div class="form-grid">
          <n-form-item label="试验名称" required><n-input v-model:value="draft.label" maxlength="30" placeholder="例如：有机肥配比试验" /></n-form-item>
          <n-form-item label="数值单位" required><n-input v-model:value="draft.unit" maxlength="10" placeholder="kg/亩、%、天等" /></n-form-item>
          <n-form-item label="试验目标" required class="wide"><n-input v-model:value="draft.description" type="textarea" :rows="2" maxlength="120" placeholder="本次试验要验证什么问题？其他管理条件应保持一致。" /></n-form-item>
          <n-form-item label="重复次数"><n-input-number v-model:value="draft.repetitions" :min="2" :max="4" /></n-form-item>
        </div>
        <div class="treatment-heading"><div><strong>处理组设置</strong><small>第一组作为对照组；每个处理会按重复次数生成独立样方</small></div><n-button size="small" :disabled="draft.treatments.length >= 6" @click="addTreatment"><template #icon><Plus /></template>添加处理</n-button></div>
        <div class="treatment-editor">
          <div v-for="(item, index) in draft.treatments" :key="index" class="treatment-row">
            <span :class="{ control: index === 0 }">{{ index === 0 ? '对照' : `处理 ${index}` }}</span>
            <n-input v-model:value="item.code" maxlength="8" placeholder="编号" />
            <n-input v-model:value="item.label" maxlength="16" placeholder="名称" />
            <n-input v-model:value="item.treatment" maxlength="40" placeholder="具体措施" />
            <n-input-number v-model:value="item.value" placeholder="数值" />
            <n-button v-if="index > 1" quaternary type="error" @click="draft.treatments.splice(index, 1)">移除</n-button>
          </div>
        </div>
      </n-form>
      <template #footer><div class="modal-actions"><n-button @click="createVisible = false">取消</n-button><n-button type="primary" @click="saveCustomTrial">{{ draft.id ? '保存修改' : '保存并进入试验' }}</n-button></div></template>
    </n-modal>

    <n-modal v-model:show="resultVisible" preset="card" :title="`录入 ${selectedPlot.code} 样方结果`" :style="{ width: 'min(560px, calc(100vw - 28px))' }">
      <n-form label-placement="top">
        <div class="result-form-grid">
          <n-form-item label="观测指标" required><n-select :value="resultDraft.metric" :options="metricOptions" @update:value="changeMetric" /></n-form-item>
          <n-form-item label="测量日期" required><n-date-picker v-model:formatted-value="resultDraft.recordedAt" value-format="yyyy-MM-dd" type="date" /></n-form-item>
          <n-form-item label="测量结果" required><n-input-number v-model:value="resultDraft.value" placeholder="输入实测数值" /></n-form-item>
          <n-form-item label="单位"><n-input v-model:value="resultDraft.unit" maxlength="12" placeholder="例如 cm、kg/亩" /></n-form-item>
          <n-form-item label="备注" class="wide"><n-input v-model:value="resultDraft.note" type="textarea" :rows="2" maxlength="100" placeholder="记录测量方法、天气或异常情况" /></n-form-item>
        </div>
        <div v-if="selectedResults.length" class="recent-results">
          <strong>该样方最近记录</strong>
          <span v-for="item in selectedResults.slice(0, 4)" :key="item.id">{{ item.recordedAt }} · {{ item.metricLabel }} {{ item.value }}{{ item.unit }} · {{ item.source === 'drone' ? '无人机' : '人工' }}</span>
        </div>
      </n-form>
      <template #footer><div class="modal-actions"><n-button @click="resultVisible = false">取消</n-button><n-button type="primary" @click="saveManualResult">保存结果</n-button></div></template>
    </n-modal>

    <n-modal v-model:show="droneResultVisible" preset="card" title="导入无人机巡检结果" :style="{ width: 'min(720px, calc(100vw - 28px))' }">
      <div class="drone-import-guide">
        <Camera />
        <div><strong>无人机通过 CSV 回传样方指标</strong><p>飞行任务完成后，从无人机平台导出 CSV。系统按样方编号匹配 NDVI、冠层覆盖率、冠层温度和病虫风险。</p></div>
      </div>
      <div class="import-actions">
        <label class="file-button"><FileUp />选择 CSV 文件<input type="file" accept=".csv,text/csv" @change="loadDroneFile" /></label>
        <n-button secondary @click="sampleDroneCsv">填入示例数据</n-button>
      </div>
      <n-input v-model:value="droneCsv" type="textarea" :rows="10" placeholder="plotCode,ndvi,coverage,temperature,pestRisk&#10;CK,0.72,81,26.4,12" />
      <p class="csv-tip">表头必须为：plotCode, ndvi, coverage, temperature, pestRisk。样方编号需与左侧列表一致。</p>
      <template #footer><div class="modal-actions"><n-button @click="droneResultVisible = false">取消</n-button><n-button type="primary" @click="importDroneResults">校验并导入</n-button></div></template>
    </n-modal>
  </div>
</template>

<style scoped>
.experiment-page { min-height: calc(100vh - 144px); margin: -26px -30px -40px; }
.experiment-workspace { position: relative; height: calc(100vh - 78px); min-height: 680px; overflow: hidden; background: #c9d5d4; }
.experiment-toolbar { position: absolute; z-index: 2; top: 18px; left: 20px; right: 20px; min-height: 50px; padding: 7px; display: flex; align-items: center; justify-content: space-between; gap: 14px; border: 1px solid rgba(255,255,255,.65); border-radius: 9px; background: rgba(249,251,249,.93); box-shadow: 0 8px 28px rgba(37,50,43,.12); backdrop-filter: blur(10px); }
.kind-picker { min-width: 390px; display: grid; grid-template-columns: minmax(210px, 280px) auto; align-items: center; gap: 8px; }
.drone-controls { display: grid; grid-template-columns: auto auto 126px; align-items: center; gap: 7px; color: #55645c; font-size: 11px; }
.experiment-panel { position: absolute; z-index: 2; top: 86px; left: 20px; width: 330px; max-height: calc(100% - 210px); padding: 17px; overflow: auto; border: 1px solid rgba(255,255,255,.6); border-radius: 9px; background: rgba(248,250,248,.94); box-shadow: 0 12px 32px rgba(39,52,45,.14); backdrop-filter: blur(10px); }
.panel-heading { display: flex; justify-content: space-between; gap: 12px; }.panel-heading small { color: #8a9690; font-size: 9px; letter-spacing: .12em; }.panel-heading h2 { margin: 3px 0 0; color: #304239; font-size: 20px; }.panel-heading > span { height: 24px; padding: 5px 7px; border-radius: 4px; background: #e5eee8; color: #41634f; font-size: 9px; }.experiment-panel > p { margin: 9px 0 12px; color: #77847d; font-size: 11px; line-height: 1.55; }
.custom-actions { margin: -4px 0 10px; display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
.result-actions { margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }.result-actions :deep(.n-button__content) { font-size: 10px; }
.plot-list { display: grid; gap: 5px; }.plot-list button { width: 100%; min-height: 52px; padding: 8px; border: 1px solid #e4e9e6; border-radius: 6px; background: #fff; display: grid; grid-template-columns: 5px minmax(0,1fr) auto; align-items: center; gap: 9px; text-align: left; cursor: pointer; }.plot-list button:hover, .plot-list button.active { border-color: #789985; background: #f4f8f5; }.plot-list button.active { box-shadow: inset 3px 0 #3f7655; }.plot-list i { width: 5px; height: 30px; border-radius: 4px; }.plot-list strong, .plot-list small { display: block; }.plot-list strong { color: #35453d; font-size: 11px; }.plot-list small { margin-top: 3px; color: #85908b; font-size: 9px; }.plot-list b { color: #4c6557; font-size: 10px; }
.plot-list b em { margin-bottom: 3px; display: block; color: #3e7654; font-size: 8px; font-style: normal; }
.trial-readout { position: absolute; z-index: 2; left: 370px; right: 20px; bottom: 20px; min-height: 88px; padding: 14px 16px; display: grid; grid-template-columns: 1.3fr repeat(3, .85fr) 1.35fr; align-items: center; gap: 10px; border-left: 4px solid #d8ae57; background: rgba(42,55,49,.93); color: #fff; backdrop-filter: blur(9px); }.trial-readout > div { min-width: 0; padding: 0 12px; border-right: 1px solid rgba(255,255,255,.13); }.trial-readout > div:last-child { border: 0; }.trial-readout small, .trial-readout span { display: block; color: #b9c6bf; font-size: 9px; }.trial-readout strong { display: block; margin-top: 4px; color: #f0c76f; font-size: 17px; }.trial-readout > div:first-child strong { font-size: 21px; }.trial-readout > div:first-child span { margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }.trial-readout svg { width: 16px; color: #d7b76d; }.drone-status { display: flex; align-items: center; gap: 9px; }.drone-status strong { color: #e7ece9; font-size: 11px; }
.form-grid { display: grid; grid-template-columns: 1fr 180px; gap: 0 14px; }.form-grid .wide { grid-column: 1 / -1; }.treatment-heading { margin: 4px 0 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }.treatment-heading strong, .treatment-heading small { display: block; }.treatment-heading strong { color: #34453c; }.treatment-heading small { margin-top: 3px; color: #87928c; font-size: 11px; }.treatment-editor { display: grid; gap: 7px; }.treatment-row { display: grid; grid-template-columns: 52px 76px 112px minmax(150px, 1fr) 110px 50px; align-items: center; gap: 7px; }.treatment-row > span { padding: 5px; border-radius: 4px; background: #edf1ee; color: #68766f; font-size: 10px; text-align: center; }.treatment-row > span.control { background: #e4eee7; color: #346247; font-weight: 600; }.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.result-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }.result-form-grid .wide { grid-column: 1 / -1; }.recent-results { padding: 12px; border-radius: 6px; background: #f4f7f5; display: grid; gap: 5px; }.recent-results strong { color: #3b4c43; font-size: 12px; }.recent-results span { color: #75817b; font-size: 10px; }.drone-import-guide { margin-bottom: 14px; padding: 13px; border-radius: 7px; background: #edf4ef; display: grid; grid-template-columns: 34px 1fr; gap: 10px; }.drone-import-guide svg { width: 23px; color: #3f7053; }.drone-import-guide strong { color: #33483c; font-size: 13px; }.drone-import-guide p { margin: 4px 0 0; color: #718078; font-size: 11px; line-height: 1.6; }.import-actions { margin-bottom: 10px; display: flex; gap: 8px; }.file-button { height: 34px; padding: 0 13px; border-radius: 4px; background: #315d43; display: flex; align-items: center; gap: 6px; color: #fff; font-size: 12px; cursor: pointer; }.file-button svg { width: 15px; }.file-button input { display: none; }.csv-tip { margin: 8px 0 0; color: #849089; font-size: 10px; }
@media (max-width: 900px) { .experiment-page { margin: -18px -16px -30px; }.experiment-workspace { min-height: 760px; }.experiment-toolbar { left: 12px; right: 12px; flex-wrap: wrap; }.kind-picker { width: 100%; min-width: 0; grid-template-columns: minmax(0, 1fr) auto; }.experiment-panel { top: 126px; left: 12px; width: min(320px, calc(100% - 24px)); max-height: 410px; }.trial-readout { left: 12px; right: 12px; bottom: 12px; grid-template-columns: repeat(2, 1fr); }.trial-readout > div { border: 0; }.trial-readout > div:first-child, .drone-status { grid-column: 1 / -1; }.drone-controls { margin-left: auto; }.form-grid { grid-template-columns: 1fr; }.form-grid .wide { grid-column: auto; }.treatment-row { grid-template-columns: 48px 68px 1fr; }.treatment-row :deep(.n-input:nth-of-type(3)), .treatment-row :deep(.n-input-number) { grid-column: span 2; } }
</style>
