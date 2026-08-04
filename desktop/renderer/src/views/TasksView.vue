<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useDialog, useMessage, type FormInst, type FormRules } from 'naive-ui'
import { Check, Play, Plus, Search } from '@lucide/vue'
import { useFarmStore } from '@/stores/farm'
import type { CreateTaskInput, FarmTask, TaskPriority, TaskStatus } from '@/types'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'

const farm = useFarmStore()
const message = useMessage()
const dialog = useDialog()
const showModal = ref(false)
const formRef = ref<FormInst | null>(null)
const keyword = ref('')
const status = ref<string | null>(null)
const form = reactive<CreateTaskInput>({ title: '', dueDate: '', priority: 'medium', description: '', assignee: '', fieldId: '' })
const rules: FormRules = {
  title: { required: true, message: '请输入任务名称', trigger: 'blur' },
  fieldId: { required: true, message: '请选择关联地块', trigger: 'change' },
  assignee: { required: true, message: '请输入负责人', trigger: 'blur' },
  dueDate: { required: true, message: '请选择截止日期', trigger: 'change' },
}
const fieldName = (fieldId: string | number) => farm.fields.find((field) => field.id === fieldId)?.name || '-'
const filtered = computed(() => farm.tasks.filter((task) => (!status.value || task.status === status.value) && (!keyword.value || `${task.title}${fieldName(task.fieldId)}${task.assignee}`.toLowerCase().includes(keyword.value.toLowerCase()))))
const fieldOptions = computed(() => farm.fields.map((field) => ({ label: field.name, value: field.id })))
const statusMap: Record<TaskStatus, { label: string; type: 'warning' | 'info' | 'success' }> = { pending: { label: '待处理', type: 'warning' }, in_progress: { label: '进行中', type: 'info' }, completed: { label: '已完成', type: 'success' } }
const priorityMap: Record<TaskPriority, string> = { low: '普通', medium: '重要', high: '紧急' }

function resetForm() { Object.assign(form, { title: '', dueDate: '', priority: 'medium', description: '', assignee: '', fieldId: '' }) }
async function create() {
  await formRef.value?.validate()
  try { await farm.createTask({ ...form }); showModal.value = false; resetForm(); message.success('任务已创建') } catch { message.error(farm.errors.taskMutation) }
}
function advance(task: FarmTask) {
  const nextStatus: TaskStatus = task.status === 'pending' ? 'in_progress' : 'completed'
  const completing = nextStatus === 'completed'
  dialog.warning({ title: completing ? '确认完成任务' : '确认开始任务', content: completing ? `确认“${task.title}”已经执行完成？` : `确认开始执行“${task.title}”？`, positiveText: completing ? '确认完成' : '开始任务', negativeText: '取消', onPositiveClick: async () => {
    try { await farm.updateTaskStatus(task.id, nextStatus); message.success(completing ? '任务已完成' : '任务已开始') } catch { message.error(farm.errors.taskMutation) }
  } })
}
onMounted(() => Promise.all([farm.loadTasks(), farm.loadFields()]).catch(() => undefined))
</script>

<template>
  <page-header title="生产任务" description="安排农事活动，跟踪执行进度与责任人员"><n-button type="primary" @click="showModal = true"><template #icon><Plus /></template>新建任务</n-button></page-header>
  <div class="filter-bar"><n-input v-model:value="keyword" clearable placeholder="搜索任务、地块或负责人"><template #prefix><Search :size="17" /></template></n-input><n-select v-model:value="status" clearable placeholder="全部状态" :options="[{label:'待处理',value:'pending'},{label:'进行中',value:'in_progress'},{label:'已完成',value:'completed'}]" /></div>
  <state-panel :loading="farm.loading.tasks" :error="farm.errors.tasks" :empty="!filtered.length" empty-text="没有符合条件的任务" @retry="farm.loadTasks">
    <div class="table-wrap"><n-table :single-line="false"><thead><tr><th>任务</th><th>关联地块</th><th>负责人</th><th>截止日期</th><th>优先级</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="task in filtered" :key="task.id"><td><strong>{{ task.title }}</strong><small class="cell-detail">{{ task.description || '无补充说明' }}</small></td><td>{{ fieldName(task.fieldId) }}</td><td>{{ task.assignee }}</td><td>{{ task.dueDate }}</td><td><span :class="['priority', task.priority]">{{ priorityMap[task.priority] }}</span></td><td><n-tag size="small" :type="statusMap[task.status]?.type || 'default'">{{ statusMap[task.status]?.label || task.status }}</n-tag></td><td><n-button v-if="task.status !== 'completed'" size="small" secondary type="primary" :loading="farm.loading.taskMutation" @click="advance(task)"><template #icon><Play v-if="task.status === 'pending'" /><Check v-else /></template>{{ task.status === 'pending' ? '开始' : '完工' }}</n-button><span v-else class="muted">已归档</span></td></tr></tbody></n-table></div>
  </state-panel>
  <n-modal v-model:show="showModal" preset="card" title="新建生产任务" class="form-modal" :bordered="false"><n-form ref="formRef" :model="form" :rules="rules" label-placement="top"><n-form-item label="任务名称" path="title"><n-input v-model:value="form.title" placeholder="例如：一号田块滴灌" /></n-form-item><div class="form-grid"><n-form-item label="关联地块" path="fieldId"><n-select v-model:value="form.fieldId" :options="fieldOptions" placeholder="选择地块" /></n-form-item><n-form-item label="负责人" path="assignee"><n-input v-model:value="form.assignee" placeholder="输入负责人" /></n-form-item><n-form-item label="截止日期" path="dueDate"><n-date-picker v-model:formatted-value="form.dueDate" value-format="yyyy-MM-dd" type="date" clearable /></n-form-item><n-form-item label="优先级"><n-select v-model:value="form.priority" :options="[{label:'普通',value:'low'},{label:'重要',value:'medium'},{label:'紧急',value:'high'}]" /></n-form-item></div><n-form-item label="任务说明"><n-input v-model:value="form.description" type="textarea" :rows="3" /></n-form-item><div class="modal-actions"><n-button @click="showModal = false">取消</n-button><n-button type="primary" :loading="farm.loading.taskMutation" @click="create">创建任务</n-button></div></n-form></n-modal>
</template>
