<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import { Archive, FileCheck2, FileClock, FolderOpen, Plus, ShieldCheck } from '@lucide/vue'
import { useFarmStore } from '@/stores/farm'
import { useProductionStore } from '@/stores/production'
import type { ComplianceDocument, FarmContract } from '@/types'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import TableActions from '@/components/TableActions.vue'
import type { TableAction } from '@/components/table-actions'

const farm = useFarmStore()
const production = useProductionStore()
const message = useMessage()
const dialog = useDialog()
const showDocument = ref(false)
const showContract = ref(false)
const documentFileName = ref('')
const contractFileName = ref('')
const today = localDateKey()
const documentForm = reactive({ subjectId: null as string | null, farmId: null as string | null, fieldId: null as string | number | null, documentType: 'inspection' as ComplianceDocument['documentType'], name: '', documentNo: '', issueDate: today, expiryDate: null as string | null, custodian: '', filePath: '', notes: '' })
const contractForm = reactive({ subjectId: null as string | null, farmId: null as string | null, contractType: 'land_lease' as FarmContract['contractType'], contractNo: '', title: '', counterparty: '', startDate: today, endDate: `${new Date().getFullYear() + 1}-${today.slice(5)}`, amount: 0, reminderDays: 30, filePath: '', notes: '' })
const documentTypes: Record<ComplianceDocument['documentType'], string> = { land: '土地权属', inspection: '检测报告', input_invoice: '农资票据', certification: '认证证书', insurance: '农业保险', other: '其他档案' }
const contractTypes: Record<FarmContract['contractType'], string> = { land_lease: '土地流转', purchase: '采购合同', outsource: '外包合同', sales: '销售合同', insurance: '保险合同', other: '其他合同' }
const subjectOptions = computed(() => production.subjects.map((item) => ({ label: item.name, value: item.id })))
const documentFarmOptions = computed(() => production.farms.filter((item) => !documentForm.subjectId || item.subjectId === documentForm.subjectId).map((item) => ({ label: item.name, value: item.id })))
const contractFarmOptions = computed(() => production.farms.filter((item) => !contractForm.subjectId || item.subjectId === contractForm.subjectId).map((item) => ({ label: item.name, value: item.id })))
const documentFieldOptions = computed(() => {
  const subjectFarmIds = new Set(production.farms.filter((item) => !documentForm.subjectId || item.subjectId === documentForm.subjectId).map((item) => item.id))
  return farm.fields.filter((item) => (!documentForm.farmId || String(item.farmId) === documentForm.farmId) && subjectFarmIds.has(String(item.farmId))).map((item) => ({ label: item.name, value: item.id }))
})
const expiringCount = computed(() => production.documents.filter((item) => item.status !== 'valid').length)
const contractValue = computed(() => production.contracts.filter((item) => ['draft', 'active'].includes(item.status)).reduce((sum, item) => sum + item.amount, 0))
const subjectName = (id: string | null) => id ? production.subjects.find((item) => item.id === id)?.name || '未知主体' : '-'
const farmName = (id: string | null) => id ? production.farms.find((item) => item.id === id)?.name || '未知农场' : '-'
function localDateKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function money(value: number) { return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(value) }

watch(() => documentForm.subjectId, () => {
  if (documentForm.farmId && !production.farms.some((item) => item.id === documentForm.farmId && (!documentForm.subjectId || item.subjectId === documentForm.subjectId))) documentForm.farmId = null
  if (documentForm.fieldId && !documentFieldOptions.value.some((item) => item.value === documentForm.fieldId)) documentForm.fieldId = null
})
watch(() => documentForm.farmId, () => {
  if (documentForm.fieldId && !documentFieldOptions.value.some((item) => item.value === documentForm.fieldId)) documentForm.fieldId = null
})
watch(() => contractForm.subjectId, () => {
  if (contractForm.farmId && !production.farms.some((item) => item.id === contractForm.farmId && (!contractForm.subjectId || item.subjectId === contractForm.subjectId))) contractForm.farmId = null
})

async function selectAttachment(target: 'document' | 'contract') {
  try {
    const result = await window.agricultureDesktop?.selectManagedDocument()
    if (!result || result.canceled || !result.filePath) return
    if (target === 'document') { documentForm.filePath = result.filePath; documentFileName.value = result.fileName || '已归档附件'; if (!documentForm.name) documentForm.name = result.fileName || '' }
    else { contractForm.filePath = result.filePath; contractFileName.value = result.fileName || '已归档附件' }
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '附件归档失败') }
}
async function openAttachment(filePath: string) {
  try { await window.agricultureDesktop?.openManagedDocument(filePath) } catch (cause) { message.error(cause instanceof Error ? cause.message : '无法打开附件') }
}
async function createDocument() {
  if (!documentForm.name.trim() || !documentForm.custodian.trim()) return message.warning('请填写档案名称和保管人')
  try { await production.createDocument({ ...documentForm }); showDocument.value = false; message.success('合规文书已归档') } catch { message.error(production.errors.documentMutation) }
}
async function createContract() {
  if (!contractForm.contractNo.trim() || !contractForm.title.trim() || !contractForm.counterparty.trim()) return message.warning('请填写合同编号、名称和相对方')
  try { await production.createContract({ ...contractForm }); showContract.value = false; message.success('合同已建立，当前为草稿') } catch { message.error(production.errors.contractMutation) }
}
async function contractStatus(item: FarmContract, status: FarmContract['status']) {
  try { await production.updateContractStatus(item.id, status); message.success('合同状态已更新') } catch { message.error(production.errors.contractMutation) }
}
function terminate(item: FarmContract) {
  dialog.warning({ title: '终止合同', content: `确认终止“${item.title}”？终止后不能恢复。`, positiveText: '确认终止', negativeText: '取消', onPositiveClick: () => contractStatus(item, 'terminated') })
}

function contractActions(item: FarmContract): TableAction[] {
  const actions: TableAction[] = []
  if (item.filePath) actions.push({ key: 'attachment', label: '打开附件', icon: FolderOpen, quaternary: true, onClick: () => openAttachment(item.filePath) })
  if (item.status === 'draft') actions.push({ key: 'activate', label: '生效', type: 'primary', onClick: () => contractStatus(item, 'active') })
  if (item.status === 'active') actions.push({ key: 'terminate', label: '终止', type: 'error', secondary: true, onClick: () => terminate(item) })
  return actions
}

onMounted(() => Promise.all([farm.loadFields(), production.loadCompliance()]).catch(() => undefined))
</script>

<template>
  <page-header title="合同与合规档案" description="统一管理土地、检测、认证、保险、采购和销售合同"><n-button secondary @click="showDocument = true"><template #icon><Archive /></template>归档文书</n-button><n-button type="primary" @click="showContract = true"><template #icon><Plus /></template>新建合同</n-button></page-header>
  <div class="domain-kpis"><div><span class="domain-kpi-icon"><FileCheck2 /></span><small>合规文书</small><strong>{{ production.documents.length }}</strong><em>份</em></div><div><span class="domain-kpi-icon amber"><FileClock /></span><small>到期关注</small><strong>{{ expiringCount }}</strong><em>份文书</em></div><div><span class="domain-kpi-icon blue"><ShieldCheck /></span><small>合同金额</small><strong>{{ money(contractValue) }}</strong><em>草稿及有效合同</em></div></div>

  <state-panel :loading="production.loading.documents || production.loading.contracts" :error="production.errors.documents || production.errors.contracts" @retry="production.loadCompliance">
    <n-tabs type="line" animated>
      <n-tab-pane name="documents" tab="合规文书">
        <div class="table-wrap compliance-table"><n-table :single-line="false"><thead><tr><th>文书</th><th>类型</th><th>关联范围</th><th>签发日期</th><th>有效期</th><th>保管人</th><th>状态</th><th>附件</th></tr></thead><tbody><tr v-for="item in production.documents" :key="item.id"><td><strong>{{ item.name }}</strong><small class="cell-detail">{{ item.documentNo || '无文书编号' }}</small></td><td>{{ documentTypes[item.documentType] }}</td><td>{{ farmName(item.farmId) }}<small class="cell-detail">{{ subjectName(item.subjectId) }}</small></td><td>{{ item.issueDate || '-' }}</td><td>{{ item.expiryDate || '长期' }}</td><td>{{ item.custodian }}</td><td><n-tag size="small" :type="item.status === 'valid' ? 'success' : item.status === 'expiring' ? 'warning' : 'error'">{{ item.status === 'valid' ? '有效' : item.status === 'expiring' ? '即将到期' : '已过期' }}</n-tag></td><td><n-button v-if="item.filePath" size="tiny" secondary @click="openAttachment(item.filePath)"><template #icon><FolderOpen /></template>打开</n-button><span v-else class="muted">无附件</span></td></tr></tbody></n-table></div>
      </n-tab-pane>
      <n-tab-pane name="contracts" tab="农业合同">
        <div class="table-wrap compliance-table action-table"><n-table :single-line="false"><thead><tr><th>合同</th><th>类型</th><th>相对方</th><th>期限</th><th>金额</th><th>关联主体</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="item in production.contracts" :key="item.id"><td><strong>{{ item.title }}</strong><small class="cell-detail">{{ item.contractNo }}</small></td><td>{{ contractTypes[item.contractType] }}</td><td>{{ item.counterparty }}</td><td>{{ item.startDate }} 至 {{ item.endDate }}</td><td>{{ money(item.amount) }}</td><td>{{ subjectName(item.subjectId) }}</td><td><n-tag size="small" :type="item.status === 'active' ? 'success' : item.status === 'draft' ? 'info' : item.status === 'expired' ? 'error' : 'default'">{{ item.status === 'active' ? '履行中' : item.status === 'draft' ? '草稿' : item.status === 'expired' ? '已到期' : '已终止' }}</n-tag></td><td><table-actions :actions="contractActions(item)" /></td></tr></tbody></n-table></div>
      </n-tab-pane>
    </n-tabs>
  </state-panel>

  <n-modal v-model:show="showDocument" preset="card" title="归档合规文书" class="form-modal wide-modal" :bordered="false"><n-form :model="documentForm" label-placement="top"><div class="form-grid"><n-form-item label="文书类型"><n-select v-model:value="documentForm.documentType" :options="Object.entries(documentTypes).map(([value,label]) => ({value,label}))" /></n-form-item><n-form-item label="文书名称" required><n-input v-model:value="documentForm.name" /></n-form-item><n-form-item label="文书编号"><n-input v-model:value="documentForm.documentNo" /></n-form-item><n-form-item label="经营主体"><n-select v-model:value="documentForm.subjectId" clearable :options="subjectOptions" /></n-form-item><n-form-item label="农场"><n-select v-model:value="documentForm.farmId" clearable :options="documentFarmOptions" /></n-form-item><n-form-item label="地块"><n-select v-model:value="documentForm.fieldId" clearable :options="documentFieldOptions" /></n-form-item><n-form-item label="签发日期"><n-date-picker v-model:formatted-value="documentForm.issueDate" clearable value-format="yyyy-MM-dd" type="date" /></n-form-item><n-form-item label="有效期"><n-date-picker v-model:formatted-value="documentForm.expiryDate" clearable value-format="yyyy-MM-dd" type="date" /></n-form-item><n-form-item label="保管人" required><n-input v-model:value="documentForm.custodian" /></n-form-item></div><n-form-item label="附件"><div class="attachment-picker"><n-button secondary @click="selectAttachment('document')"><template #icon><FolderOpen /></template>选择并归档</n-button><span>{{ documentFileName || '未选择附件' }}</span></div></n-form-item><n-form-item label="备注"><n-input v-model:value="documentForm.notes" type="textarea" :rows="3" /></n-form-item><div class="modal-actions"><n-button @click="showDocument = false">取消</n-button><n-button type="primary" :loading="production.loading.documentMutation" @click="createDocument">归档</n-button></div></n-form></n-modal>
  <n-modal v-model:show="showContract" preset="card" title="新建农业合同" class="form-modal wide-modal" :bordered="false"><n-form :model="contractForm" label-placement="top"><div class="form-grid"><n-form-item label="合同类型"><n-select v-model:value="contractForm.contractType" :options="Object.entries(contractTypes).map(([value,label]) => ({value,label}))" /></n-form-item><n-form-item label="合同编号" required><n-input v-model:value="contractForm.contractNo" /></n-form-item><n-form-item label="合同名称" required><n-input v-model:value="contractForm.title" /></n-form-item><n-form-item label="合同相对方" required><n-input v-model:value="contractForm.counterparty" /></n-form-item><n-form-item label="经营主体"><n-select v-model:value="contractForm.subjectId" clearable :options="subjectOptions" /></n-form-item><n-form-item label="关联农场"><n-select v-model:value="contractForm.farmId" clearable :options="contractFarmOptions" /></n-form-item><n-form-item label="开始日期"><n-date-picker v-model:formatted-value="contractForm.startDate" value-format="yyyy-MM-dd" type="date" /></n-form-item><n-form-item label="结束日期"><n-date-picker v-model:formatted-value="contractForm.endDate" value-format="yyyy-MM-dd" type="date" /></n-form-item><n-form-item label="合同金额"><n-input-number v-model:value="contractForm.amount" :min="0" /></n-form-item><n-form-item label="提前提醒（天）"><n-input-number v-model:value="contractForm.reminderDays" :min="1" :max="365" /></n-form-item></div><n-form-item label="附件"><div class="attachment-picker"><n-button secondary @click="selectAttachment('contract')"><template #icon><FolderOpen /></template>选择并归档</n-button><span>{{ contractFileName || '未选择附件' }}</span></div></n-form-item><n-form-item label="备注"><n-input v-model:value="contractForm.notes" /></n-form-item><div class="modal-actions"><n-button @click="showContract = false">取消</n-button><n-button type="primary" :loading="production.loading.contractMutation" @click="createContract">保存草稿</n-button></div></n-form></n-modal>
</template>

<style scoped>
.compliance-table .n-table { min-width: 1120px; }.wide-modal { width: min(720px, calc(100vw - 32px)); }.attachment-picker { width: 100%; padding: 9px; display: flex; align-items: center; gap: 12px; border: 1px dashed #cfd8d3; border-radius: 6px; }.attachment-picker span { color: #7a8781; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
