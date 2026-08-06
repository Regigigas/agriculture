<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useMessage, type FormInst, type FormRules } from 'naive-ui'
import { CheckCircle2, CircleDot, ClipboardCheck, RefreshCw, Send, ShieldAlert, Wrench } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import { useFarmStore } from '@/stores/farm'
import type { Correction, CorrectionCategory, CorrectionStatus, CreateCorrectionInput, TaskPriority } from '@/types'

const auth = useAuthStore()
const farm = useFarmStore()
const message = useMessage()
const formRef = ref<FormInst | null>(null)
const statusFilter = ref<CorrectionStatus | null>(null)
const showResolve = ref(false)
const resolving = ref<Correction | null>(null)
const resolution = ref('')
const contextRoute = ref('桌面应用')
let removeContextListener: (() => void) | undefined

const form = reactive<CreateCorrectionInput>({
  category: 'data',
  priority: 'medium',
  title: '',
  description: '',
  expectedValue: '',
  route: contextRoute.value,
  createdBy: auth.user?.name || auth.user?.username || '系统管理员',
})
const rules: FormRules = {
  title: { required: true, message: '请输入问题标题', trigger: 'blur' },
  description: { required: true, message: '请说明实际情况', trigger: 'blur' },
}
const categoryOptions: Array<{ label: string; value: CorrectionCategory }> = [
  { label: '数据错误', value: 'data' },
  { label: '系统异常', value: 'system' },
  { label: '流程问题', value: 'workflow' },
  { label: '改进建议', value: 'suggestion' },
]
const categoryMap = Object.fromEntries(categoryOptions.map((item) => [item.value, item.label])) as Record<CorrectionCategory, string>
const statusMap: Record<CorrectionStatus, { label: string; type: 'warning' | 'info' | 'success' }> = {
  open: { label: '待处理', type: 'warning' },
  processing: { label: '处理中', type: 'info' },
  resolved: { label: '已解决', type: 'success' },
}
const priorityMap: Record<TaskPriority, string> = { low: '普通', medium: '重要', high: '紧急' }
const filtered = computed(() => farm.corrections.filter((item) => !statusFilter.value || item.status === statusFilter.value))
const openCount = computed(() => farm.corrections.filter((item) => item.status !== 'resolved').length)

function resetForm() {
  Object.assign(form, {
    category: 'data',
    priority: 'medium',
    title: '',
    description: '',
    expectedValue: '',
    route: contextRoute.value,
    createdBy: auth.user?.name || auth.user?.username || '系统管理员',
  })
}

async function submit() {
  await formRef.value?.validate()
  try {
    const created = await farm.createCorrection({ ...form, route: contextRoute.value })
    resetForm()
    message.success(`已提交 ${created.code}`)
  } catch {
    message.error(farm.errors.correctionMutation)
  }
}

async function startProcessing(item: Correction) {
  try {
    await farm.updateCorrectionStatus(item.id, 'processing')
    message.success('工单已进入处理队列')
  } catch {
    message.error(farm.errors.correctionMutation)
  }
}

function openResolve(item: Correction) {
  resolving.value = item
  resolution.value = item.resolution
  showResolve.value = true
}

async function resolveCorrection() {
  if (!resolving.value || !resolution.value.trim()) {
    message.warning('请填写处理说明')
    return
  }
  try {
    await farm.updateCorrectionStatus(resolving.value.id, 'resolved', resolution.value.trim())
    showResolve.value = false
    resolving.value = null
    resolution.value = ''
    message.success('纠错工单已解决')
  } catch {
    message.error(farm.errors.correctionMutation)
  }
}

onMounted(() => {
  removeContextListener = window.agricultureDesktop?.onCorrectionContext((route) => {
    if (!route) return
    contextRoute.value = route
    form.route = route
  })
  farm.loadCorrections().catch(() => undefined)
})
onBeforeUnmount(() => removeContextListener?.())
</script>

<template>
  <div class="correction-window">
    <header class="correction-header">
      <div class="correction-brand"><span><ShieldAlert /></span><div><h1>纠错中心</h1><p>丰域农业 · 本地问题处理队列</p></div></div>
      <div class="queue-count"><strong>{{ openCount }}</strong><span>条待解决</span></div>
    </header>

    <main class="correction-content">
      <section class="correction-form-section">
        <div class="tool-heading"><div><h2>提交问题</h2><p>记录事实与期望结果，系统自动保留当前功能位置</p></div><n-tag size="small" :bordered="false">{{ contextRoute }}</n-tag></div>
        <n-form ref="formRef" :model="form" :rules="rules" label-placement="top" size="medium">
          <div class="correction-form-grid">
            <n-form-item label="类别"><n-select v-model:value="form.category" :options="categoryOptions" /></n-form-item>
            <n-form-item label="优先级"><n-select v-model:value="form.priority" :options="[{label:'普通',value:'low'},{label:'重要',value:'medium'},{label:'紧急',value:'high'}]" /></n-form-item>
          </div>
          <n-form-item label="标题" path="title"><n-input v-model:value="form.title" maxlength="100" placeholder="简要说明哪里不对" /></n-form-item>
          <n-form-item label="实际情况" path="description"><n-input v-model:value="form.description" type="textarea" :rows="3" maxlength="1500" show-count placeholder="说明看到的数据、操作过程或异常结果" /></n-form-item>
          <n-form-item label="期望结果"><n-input v-model:value="form.expectedValue" type="textarea" :rows="2" maxlength="800" placeholder="说明正确数据或预期行为" /></n-form-item>
          <div class="submit-row"><span>提交人：{{ form.createdBy }}</span><n-button type="primary" :loading="farm.loading.correctionMutation" @click="submit"><template #icon><Send /></template>提交纠错</n-button></div>
        </n-form>
      </section>

      <section class="correction-queue-section">
        <div class="tool-heading"><div><h2>处理队列</h2><p>本机 SQLite 持久保存，不依赖公网</p></div><div class="queue-tools"><n-select v-model:value="statusFilter" clearable size="small" placeholder="全部状态" :options="Object.entries(statusMap).map(([value, item]) => ({ value, label: item.label }))" /><n-button quaternary circle title="刷新队列" :loading="farm.loading.corrections" @click="farm.loadCorrections"><template #icon><RefreshCw /></template></n-button></div></div>
        <div v-if="farm.loading.corrections" class="queue-empty"><n-spin size="small" /><span>正在加载处理队列</span></div>
        <div v-else-if="farm.errors.corrections" class="queue-error">{{ farm.errors.corrections }}<n-button text type="primary" @click="farm.loadCorrections">重试</n-button></div>
        <div v-else-if="!filtered.length" class="queue-empty"><CheckCircle2 /><strong>当前没有纠错工单</strong><span>新提交的问题会显示在这里</span></div>
        <div v-else class="correction-list">
          <article v-for="item in filtered" :key="item.id" class="correction-item">
            <div class="ticket-line"><code>{{ item.code }}</code><span :class="['ticket-priority', item.priority]">{{ priorityMap[item.priority] }}</span><n-tag size="tiny" :type="statusMap[item.status].type">{{ statusMap[item.status].label }}</n-tag><time>{{ new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</time></div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
            <div class="ticket-meta"><span>{{ categoryMap[item.category] }}</span><span>{{ item.createdBy }}</span><span>{{ item.route || '未记录位置' }}</span></div>
            <div v-if="item.resolution" class="ticket-resolution"><ClipboardCheck />{{ item.resolution }}</div>
            <div v-if="item.status !== 'resolved'" class="ticket-actions">
              <n-button v-if="item.status === 'open'" size="tiny" secondary :loading="farm.loading.correctionMutation" @click="startProcessing(item)"><template #icon><CircleDot /></template>开始处理</n-button>
              <n-button v-if="item.status === 'processing'" size="tiny" type="primary" :loading="farm.loading.correctionMutation" @click="openResolve(item)"><template #icon><Wrench /></template>填写结果并解决</n-button>
            </div>
          </article>
        </div>
      </section>
    </main>

    <n-modal v-model:show="showResolve" preset="card" title="解决纠错工单" class="resolve-correction-modal" :bordered="false">
      <p>记录修正内容或核查结论，便于后续追溯。</p>
      <n-input v-model:value="resolution" type="textarea" :rows="5" maxlength="1000" show-count placeholder="例如：已核对地块档案并修正面积数据" />
      <div class="modal-actions"><n-button @click="showResolve = false">取消</n-button><n-button type="primary" :loading="farm.loading.correctionMutation" @click="resolveCorrection">确认解决</n-button></div>
    </n-modal>
  </div>
</template>

<style scoped>
.correction-window { min-height: 100vh; background: #f3f5f3; }
.correction-header { height: 78px; padding: 0 24px; display: flex; align-items: center; justify-content: space-between; color: #fff; background: #293937; border-bottom: 3px solid #d2a044; }
.correction-brand { display: flex; align-items: center; gap: 12px; }
.correction-brand > span { width: 38px; height: 38px; display: grid; place-items: center; color: #293937; background: #d9a441; border-radius: 7px; }
.correction-brand svg { width: 20px; height: 20px; }
.correction-brand h1 { margin: 0; font-size: 18px; letter-spacing: 0; }
.correction-brand p { margin: 3px 0 0; color: #adbbb6; font-size: 10px; }
.queue-count { display: flex; align-items: baseline; gap: 6px; }
.queue-count strong { color: #efc66f; font-size: 23px; }
.queue-count span { color: #b9c5c0; font-size: 11px; }
.correction-content { width: min(100%, 760px); margin: 0 auto; padding: 20px; display: grid; gap: 16px; }
.correction-form-section, .correction-queue-section { padding: 20px; background: #fff; border: 1px solid #e0e5e2; border-radius: 8px; }
.tool-heading { margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.tool-heading h2 { margin: 0; color: #293730; font-size: 16px; }
.tool-heading p { margin: 4px 0 0; color: #7b8781; font-size: 11px; }
.correction-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.submit-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.submit-row > span { color: #7d8983; font-size: 11px; }
.queue-tools { display: flex; align-items: center; gap: 5px; }
.queue-tools .n-select { width: 124px; }
.queue-error { min-height: 100px; display: flex; align-items: center; justify-content: center; gap: 10px; color: #a65246; font-size: 12px; }
.queue-empty { min-height: 150px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #84908a; }
.queue-empty svg { width: 26px; height: 26px; margin-bottom: 8px; color: #6d9078; }
.queue-empty strong { color: #536159; font-size: 13px; }
.queue-empty span { margin-top: 4px; font-size: 11px; }
.correction-list { display: grid; gap: 10px; }
.correction-item { padding: 14px; border: 1px solid #e4e8e6; border-left: 3px solid #759080; border-radius: 5px; }
.ticket-line { display: flex; align-items: center; gap: 8px; }
.ticket-line code { color: #53645b; font-size: 11px; }
.ticket-line time { margin-left: auto; color: #8b9691; font-size: 10px; }
.ticket-priority { padding-left: 8px; position: relative; color: #75817b; font-size: 10px; }
.ticket-priority::before { content: ''; position: absolute; left: 0; top: 4px; width: 5px; height: 5px; border-radius: 50%; background: #89938e; }
.ticket-priority.medium::before { background: #cf993c; }
.ticket-priority.high::before { background: #b95548; }
.correction-item h3 { margin: 10px 0 5px; color: #293730; font-size: 14px; }
.correction-item > p { margin: 0; color: #68756f; font-size: 12px; line-height: 1.6; white-space: pre-wrap; }
.ticket-meta { margin-top: 8px; display: flex; gap: 12px; flex-wrap: wrap; color: #88938e; font-size: 10px; }
.ticket-resolution { margin-top: 10px; padding: 9px 10px; display: flex; align-items: flex-start; gap: 7px; color: #536e5d; background: #f1f5f2; font-size: 11px; line-height: 1.55; }
.ticket-resolution svg { width: 14px; height: 14px; flex: 0 0 auto; }
.ticket-actions { margin-top: 11px; display: flex; justify-content: flex-end; gap: 8px; }
.resolve-correction-modal { width: min(520px, calc(100vw - 32px)); }
.resolve-correction-modal p { margin: -4px 0 14px; color: #75817b; font-size: 12px; }
.resolve-correction-modal .modal-actions { margin-top: 16px; }
@media (max-width: 600px) { .correction-header { padding: 0 16px; }.correction-content { padding: 14px; }.correction-form-section, .correction-queue-section { padding: 16px; }.tool-heading { align-items: flex-start; }.correction-form-grid { grid-template-columns: 1fr; }.ticket-line time { display: none; } }
</style>
