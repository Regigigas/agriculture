<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useDialog, useMessage, type FormInst, type FormRules } from 'naive-ui'
import { CheckCircle2, ClipboardCheck, Play, Plus, RotateCcw, Search, ShieldAlert } from '@/icons/iconpark'
import { useFarmStore } from '@/stores/farm'
import type { CreateIssueInput, FieldIssue, IssueCategory, IssueSeverity, IssueStatus } from '@/types'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'

const farm = useFarmStore()
const message = useMessage()
const dialog = useDialog()
const formRef = ref<FormInst | null>(null)
const showCreate = ref(false)
const showResolution = ref(false)
const keyword = ref('')
const statusFilter = ref<IssueStatus | null>(null)
const severityFilter = ref<IssueSeverity | null>(null)
const resolvingIssue = ref<FieldIssue | null>(null)
const resolution = ref('')

function localDateKey(value = new Date()) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const today = localDateKey()
const form = reactive<CreateIssueInput>({
  title: '',
  fieldId: '',
  category: 'irrigation',
  severity: 'medium',
  description: '',
  reporter: '',
  assignee: '',
  observedAt: today,
  reviewDueDate: '',
})
const rules: FormRules = {
  title: { required: true, message: '请输入问题标题', trigger: 'blur' },
  fieldId: { required: true, message: '请选择地块', trigger: 'change' },
  description: { required: true, message: '请描述现场现象', trigger: 'blur' },
  reporter: { required: true, message: '请输入发现人', trigger: 'blur' },
  assignee: { required: true, message: '请输入处理人', trigger: 'blur' },
  observedAt: { required: true, message: '请选择发现日期', trigger: 'change' },
}

const categoryOptions: Array<{ label: string; value: IssueCategory }> = [
  { label: '虫害', value: 'pest' },
  { label: '病害', value: 'disease' },
  { label: '灌溉', value: 'irrigation' },
  { label: '设备', value: 'equipment' },
  { label: '品质', value: 'quality' },
  { label: '其他', value: 'other' },
]
const categoryMap = Object.fromEntries(categoryOptions.map((item) => [item.value, item.label])) as Record<IssueCategory, string>
const severityMap: Record<IssueSeverity, { label: string; type: 'default' | 'info' | 'warning' | 'error' }> = {
  low: { label: '低', type: 'default' },
  medium: { label: '中', type: 'info' },
  high: { label: '高', type: 'warning' },
  critical: { label: '紧急', type: 'error' },
}
const statusMap: Record<IssueStatus, { label: string; type: 'default' | 'info' | 'warning' | 'success' }> = {
  open: { label: '待处理', type: 'warning' },
  in_progress: { label: '处理中', type: 'info' },
  review: { label: '待复查', type: 'default' },
  closed: { label: '已关闭', type: 'success' },
}
const fieldOptions = computed(() => farm.fields.map((field) => ({ label: field.name, value: field.id })))
const fieldName = (fieldId: string | number) => farm.fields.find((field) => field.id === fieldId)?.name || '未知地块'
const activeCount = computed(() => farm.issues.filter((issue) => issue.status !== 'closed').length)
const reviewCount = computed(() => farm.issues.filter((issue) => issue.status === 'review').length)
const filtered = computed(() => farm.issues.filter((issue) => {
  const matchesKeyword = !keyword.value || `${issue.title}${issue.description}${issue.assignee}${fieldName(issue.fieldId)}`.toLowerCase().includes(keyword.value.toLowerCase())
  return matchesKeyword && (!statusFilter.value || issue.status === statusFilter.value) && (!severityFilter.value || issue.severity === severityFilter.value)
}))

function resetForm() {
  Object.assign(form, { title: '', fieldId: '', category: 'irrigation', severity: 'medium', description: '', reporter: '', assignee: '', observedAt: today, reviewDueDate: '' })
}

async function createIssue() {
  await formRef.value?.validate()
  try {
    await farm.createIssue({ ...form, reviewDueDate: form.reviewDueDate || undefined })
    showCreate.value = false
    resetForm()
    message.success('巡田问题已登记')
  } catch {
    message.error(farm.errors.issueMutation)
  }
}

async function updateStatus(issue: FieldIssue, status: IssueStatus, result = ''): Promise<boolean> {
  try {
    await farm.updateIssueStatus(issue.id, status, result)
    message.success(status === 'closed' ? '复查通过，问题已关闭' : '问题状态已更新')
    return true
  } catch {
    message.error(farm.errors.issueMutation)
    return false
  }
}

function start(issue: FieldIssue) {
  dialog.info({
    title: '开始处理',
    content: `确认由 ${issue.assignee} 开始处理“${issue.title}”？`,
    positiveText: '开始处理',
    negativeText: '取消',
    onPositiveClick: () => updateStatus(issue, 'in_progress'),
  })
}

function openResolution(issue: FieldIssue) {
  resolvingIssue.value = issue
  resolution.value = issue.resolution
  showResolution.value = true
}

async function submitResolution() {
  if (!resolvingIssue.value || !resolution.value.trim()) {
    message.warning('请填写处理结果')
    return
  }
  const succeeded = await updateStatus(resolvingIssue.value, 'review', resolution.value.trim())
  if (!succeeded) return
  showResolution.value = false
  resolvingIssue.value = null
  resolution.value = ''
}

function closeIssue(issue: FieldIssue) {
  dialog.success({
    title: '确认复查结果',
    content: `确认“${issue.title}”已处理有效并关闭？`,
    positiveText: '通过并关闭',
    negativeText: '取消',
    onPositiveClick: () => updateStatus(issue, 'closed'),
  })
}

onMounted(() => Promise.all([farm.loadIssues(), farm.loadFields()]).catch(() => undefined))
</script>

<template>
  <page-header title="巡田问题" description="记录现场异常，跟踪处理责任与复查结果">
    <div class="page-actions">
      <span class="issue-summary">{{ activeCount }} 条处理中 · {{ reviewCount }} 条待复查</span>
      <n-button type="primary" @click="showCreate = true"><template #icon><Plus /></template>登记问题</n-button>
    </div>
  </page-header>

  <div class="issue-filter">
    <n-input v-model:value="keyword" clearable placeholder="搜索问题、地块或处理人"><template #prefix><Search :size="17" /></template></n-input>
    <n-select v-model:value="statusFilter" clearable placeholder="全部状态" :options="Object.entries(statusMap).map(([value, item]) => ({ value, label: item.label }))" />
    <n-select v-model:value="severityFilter" clearable placeholder="全部等级" :options="Object.entries(severityMap).map(([value, item]) => ({ value, label: item.label }))" />
  </div>

  <state-panel :loading="farm.loading.issues" :error="farm.errors.issues" :empty="!filtered.length" empty-text="没有符合条件的巡田问题" @retry="farm.loadIssues">
    <div class="issue-list">
      <article v-for="issue in filtered" :key="issue.id" class="issue-row">
        <span :class="['issue-marker', issue.severity]"><ShieldAlert /></span>
        <div class="issue-main">
          <div class="issue-title"><strong>{{ issue.title }}</strong><n-tag size="small" :type="severityMap[issue.severity].type">{{ severityMap[issue.severity].label }}风险</n-tag><n-tag size="small" :type="statusMap[issue.status].type">{{ statusMap[issue.status].label }}</n-tag></div>
          <p>{{ issue.description }}</p>
          <div class="issue-meta"><span>{{ fieldName(issue.fieldId) }}</span><span>{{ categoryMap[issue.category] }}</span><span>发现：{{ issue.reporter }}</span><span>处理：{{ issue.assignee }}</span><span>发现日期：{{ issue.observedAt }}</span><span v-if="issue.reviewDueDate">复查期限：{{ issue.reviewDueDate }}</span></div>
          <div v-if="issue.resolution" class="resolution"><ClipboardCheck />{{ issue.resolution }}</div>
        </div>
        <div class="issue-actions">
          <n-button v-if="issue.status === 'open'" size="small" type="primary" secondary :loading="farm.loading.issueMutation" @click="start(issue)"><template #icon><Play /></template>开始处理</n-button>
          <n-button v-if="issue.status === 'in_progress'" size="small" type="primary" :loading="farm.loading.issueMutation" @click="openResolution(issue)"><template #icon><ClipboardCheck /></template>提交复查</n-button>
          <template v-if="issue.status === 'review'">
            <n-button size="small" type="success" :loading="farm.loading.issueMutation" @click="closeIssue(issue)"><template #icon><CheckCircle2 /></template>复查通过</n-button>
            <n-button size="small" secondary :loading="farm.loading.issueMutation" @click="updateStatus(issue, 'in_progress')"><template #icon><RotateCcw /></template>退回处理</n-button>
          </template>
          <span v-if="issue.status === 'closed'" class="closed-label"><CheckCircle2 />已闭环</span>
        </div>
      </article>
    </div>
  </state-panel>

  <n-modal v-model:show="showCreate" preset="card" title="登记巡田问题" class="form-modal" :bordered="false">
    <n-form ref="formRef" :model="form" :rules="rules" label-placement="top">
      <n-form-item label="问题标题" path="title"><n-input v-model:value="form.title" maxlength="80" placeholder="例如：温室东侧滴灌压力偏低" /></n-form-item>
      <div class="form-grid">
        <n-form-item label="关联地块" path="fieldId"><n-select v-model:value="form.fieldId" :options="fieldOptions" placeholder="选择地块" /></n-form-item>
        <n-form-item label="问题类别"><n-select v-model:value="form.category" :options="categoryOptions" /></n-form-item>
        <n-form-item label="风险等级"><n-select v-model:value="form.severity" :options="[{label:'低',value:'low'},{label:'中',value:'medium'},{label:'高',value:'high'},{label:'紧急',value:'critical'}]" /></n-form-item>
        <n-form-item label="发现日期" path="observedAt"><n-date-picker v-model:formatted-value="form.observedAt" value-format="yyyy-MM-dd" type="date" clearable /></n-form-item>
        <n-form-item label="发现人" path="reporter"><n-input v-model:value="form.reporter" maxlength="40" /></n-form-item>
        <n-form-item label="处理负责人" path="assignee"><n-input v-model:value="form.assignee" maxlength="40" /></n-form-item>
        <n-form-item label="计划复查日期"><n-date-picker v-model:formatted-value="form.reviewDueDate" value-format="yyyy-MM-dd" type="date" clearable /></n-form-item>
      </div>
      <n-form-item label="现场现象" path="description"><n-input v-model:value="form.description" type="textarea" :rows="4" maxlength="800" show-count /></n-form-item>
      <div class="modal-actions"><n-button @click="showCreate = false">取消</n-button><n-button type="primary" :loading="farm.loading.issueMutation" @click="createIssue">登记并分派</n-button></div>
    </n-form>
  </n-modal>

  <n-modal v-model:show="showResolution" preset="card" title="提交处理结果" class="resolution-modal" :bordered="false">
    <p class="modal-hint">处理结果提交后进入复查队列，复查人可关闭问题或退回继续处理。</p>
    <n-input v-model:value="resolution" type="textarea" :rows="5" maxlength="1000" show-count placeholder="记录采取的措施、现场结果和复查要点" />
    <div class="modal-actions"><n-button @click="showResolution = false">取消</n-button><n-button type="primary" :loading="farm.loading.issueMutation" @click="submitResolution">提交复查</n-button></div>
  </n-modal>
</template>

<style scoped>
.issue-summary { color: #69766f; font-size: 12px; white-space: nowrap; }
.issue-filter { margin-bottom: 16px; display: grid; grid-template-columns: minmax(260px, 1fr) 160px 160px; gap: 12px; }
.issue-list { overflow: hidden; border: 1px solid #e0e5e2; border-radius: 8px; background: #fff; }
.issue-row { min-height: 150px; padding: 18px; display: grid; grid-template-columns: 40px minmax(0, 1fr) 132px; align-items: start; gap: 14px; border-bottom: 1px solid #e9edeb; }
.issue-row:last-child { border-bottom: 0; }
.issue-marker { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 7px; color: #6b7771; background: #edf0ee; }
.issue-marker svg { width: 19px; height: 19px; }
.issue-marker.medium { color: #4e7181; background: #e7eef1; }
.issue-marker.high { color: #9b681d; background: #f6ecda; }
.issue-marker.critical { color: #a64f43; background: #f4e5e2; }
.issue-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.issue-title strong { color: #293730; font-size: 15px; }
.issue-main > p { margin: 7px 0 10px; color: #65726c; line-height: 1.6; font-size: 13px; }
.issue-meta { display: flex; gap: 6px 16px; flex-wrap: wrap; color: #84908a; font-size: 11px; }
.resolution { margin-top: 12px; padding: 10px 12px; display: flex; align-items: flex-start; gap: 8px; color: #506a5a; background: #f2f6f3; border-left: 3px solid #6d9078; font-size: 12px; line-height: 1.55; }
.resolution svg { width: 16px; height: 16px; flex: 0 0 auto; margin-top: 1px; }
.issue-actions { display: grid; justify-items: stretch; gap: 8px; }
.closed-label { display: flex; align-items: center; justify-content: center; gap: 6px; color: #5e7b68; font-size: 12px; }
.closed-label svg { width: 16px; height: 16px; }
.resolution-modal { width: min(540px, calc(100vw - 32px)); }
.modal-hint { margin: -4px 0 14px; color: #75827c; font-size: 12px; line-height: 1.6; }
.resolution-modal .modal-actions { margin-top: 16px; }
@media (max-width: 860px) { .issue-filter { grid-template-columns: 1fr 1fr; }.issue-filter .n-input { grid-column: 1 / 3; }.issue-row { grid-template-columns: 38px minmax(0, 1fr); }.issue-actions { grid-column: 2; grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .issue-filter { grid-template-columns: 1fr; }.issue-filter .n-input { grid-column: auto; }.issue-row { grid-template-columns: 1fr; }.issue-marker { display: none; }.issue-actions { grid-column: auto; }.issue-summary { display: none; } }
</style>
