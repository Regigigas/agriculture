<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDialog, useMessage } from 'naive-ui'
import { Edit, FileCheck2, FileClock, Plus, Printer, RotateCcw } from '@/icons/iconpark'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import TableActions from '@/components/TableActions.vue'
import type { TableAction } from '@/components/table-actions'
import { useAuthStore } from '@/stores/auth'
import { useFarmStore } from '@/stores/farm'
import { useProductionStore } from '@/stores/production'
import type { Invoice } from '@/types'
import { centsToChineseUppercase, formatCents } from '@/types/money'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const farm = useFarmStore()
const production = useProductionStore()
const message = useMessage()
const dialog = useDialog()
const showCreate = ref(false)
const showEdit = ref(false)
const showIssue = ref(false)
const statusFilter = ref<'all' | Invoice['status']>('all')
const selectedInvoice = ref<Invoice | null>(null)
const editingInvoice = ref<Invoice | null>(null)
const form = reactive({ sourceType: 'sales_order' as Invoice['sourceType'], sourceId: '', title: '', taxNumber: '', applicant: '', notes: '' })
const editForm = reactive({ title: '', taxNumber: '', applicant: '', notes: '' })
const issueForm = reactive({ invoiceNo: '', issuedAt: today() })

const sourceOptions = computed(() => form.sourceType === 'sales_order'
  ? production.sales.map((item) => ({ label: `${item.orderNo} · ${item.customer} · ${formatCents(item.amount)}`, value: item.id, disabled: hasActiveInvoice('sales_order', item.id) }))
  : farm.purchases.map((item) => ({ label: `${item.orderNo} · ${item.supplier} · ${formatCents(item.amount)}`, value: String(item.id), disabled: hasActiveInvoice('purchase', String(item.id)) })))
const filtered = computed(() => statusFilter.value === 'all' ? production.invoices : production.invoices.filter((item) => item.status === statusFilter.value))
const pending = computed(() => production.invoices.filter((item) => item.status === 'pending'))
const issued = computed(() => production.invoices.filter((item) => item.status === 'issued'))
const outputAmount = computed(() => issued.value.filter((item) => item.direction === 'output').reduce((sum, item) => sum + item.amount, 0))
const inputAmount = computed(() => issued.value.filter((item) => item.direction === 'input').reduce((sum, item) => sum + item.amount, 0))

function today() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function operatorName() { return auth.user?.name || auth.user?.username || '系统管理员' }
function hasActiveInvoice(sourceType: Invoice['sourceType'], sourceId: string) { return production.invoices.some((item) => item.sourceType === sourceType && item.sourceId === sourceId && item.status !== 'voided') }
function resetForm(sourceType: Invoice['sourceType'] = 'sales_order', sourceId = '') { Object.assign(form, { sourceType, sourceId, title: '', taxNumber: '', applicant: operatorName(), notes: '' }) }
function openCreate(sourceType: Invoice['sourceType'] = 'sales_order', sourceId = '') { resetForm(sourceType, sourceId); showCreate.value = true }
async function createInvoice() {
  if (!form.sourceId || !form.title.trim() || !form.applicant.trim()) return message.warning('请选择业务单据并填写发票抬头和申请人')
  try { await production.createInvoice(form); showCreate.value = false; await clearSourceQuery(); message.success('发票申请已创建') } catch { message.error(production.errors.invoiceMutation) }
}
function openEdit(item: Invoice) {
  editingInvoice.value = item
  Object.assign(editForm, { title: item.title, taxNumber: item.taxNumber, applicant: item.applicant, notes: item.notes })
  showEdit.value = true
}
async function saveInvoice() {
  if (!editingInvoice.value || !editForm.title.trim() || !editForm.applicant.trim()) return message.warning('请填写发票抬头和申请人')
  try {
    await production.updateInvoice(editingInvoice.value.id, editForm)
    showEdit.value = false
    message.success('发票申请已更新')
  } catch { message.error(production.errors.invoiceMutation) }
}
function openIssue(item: Invoice) { selectedInvoice.value = item; Object.assign(issueForm, { invoiceNo: '', issuedAt: today() }); showIssue.value = true }
async function issueInvoice() {
  if (!selectedInvoice.value || !issueForm.invoiceNo.trim() || !issueForm.issuedAt) return message.warning('请填写发票号码和开票日期')
  try { await production.updateInvoiceStatus(selectedInvoice.value.id, { status: 'issued', ...issueForm }); showIssue.value = false; message.success('发票已登记，关联业务单据状态已同步') } catch { message.error(production.errors.invoiceMutation) }
}
function voidInvoice(item: Invoice) {
  dialog.warning({ title: '作废发票', content: `确认作废 ${item.invoiceNo || item.applicationNo}？作废后原业务单据可以重新申请发票。`, positiveText: '确认作废', negativeText: '取消', onPositiveClick: async () => {
    try { await production.updateInvoiceStatus(item.id, { status: 'voided' }); message.success('发票已作废') } catch { message.error(production.errors.invoiceMutation); return false }
  } })
}
async function printInvoice(item: Invoice) {
  selectedInvoice.value = item
  await nextTick()
  const originalTitle = document.title
  document.title = `${item.invoiceNo || item.applicationNo}-发票`
  window.addEventListener('afterprint', () => { document.title = originalTitle }, { once: true })
  window.print()
}
function actions(item: Invoice): TableAction[] {
  if (item.status === 'pending') return [
    { key: 'issue', label: item.direction === 'output' ? '登记开票' : '登记收票', icon: FileCheck2, type: 'primary', onClick: () => openIssue(item) },
    { key: 'edit', label: '编辑', icon: Edit, secondary: true, onClick: () => openEdit(item) },
    { key: 'void', label: '作废申请', icon: RotateCcw, secondary: true, onClick: () => voidInvoice(item) },
  ]
  if (item.status === 'issued') return [
    { key: 'print', label: '打印', icon: Printer, type: 'primary', onClick: () => printInvoice(item) },
    { key: 'void', label: '作废', icon: RotateCcw, secondary: true, onClick: () => voidInvoice(item) },
  ]
  return []
}
async function clearSourceQuery() { if (route.query.sourceType || route.query.sourceId) await router.replace({ path: '/invoices' }) }

onMounted(async () => {
  await Promise.allSettled([production.loadInvoices(), production.loadSales(), farm.loadPurchases()])
  const sourceType = route.query.sourceType === 'purchase' ? 'purchase' : route.query.sourceType === 'sales_order' ? 'sales_order' : null
  const sourceId = typeof route.query.sourceId === 'string' ? route.query.sourceId : ''
  if (sourceType && sourceId) {
    if (hasActiveInvoice(sourceType, sourceId)) message.info('该业务单据已有发票记录')
    else openCreate(sourceType, sourceId)
  }
})
</script>

<template>
  <page-header title="发票管理" description="统一管理销售开票与采购收票，发票状态与原业务单据通过关联关系保持同步">
    <n-button type="primary" @click="openCreate()"><template #icon><Plus /></template>新建发票申请</n-button>
  </page-header>
  <div class="domain-kpis invoice-kpis"><div><span class="domain-kpi-icon amber"><FileClock /></span><small>待处理</small><strong>{{ pending.length }}</strong><em>张发票申请</em></div><div><span class="domain-kpi-icon blue"><FileCheck2 /></span><small>销项已开</small><strong>{{ formatCents(outputAmount) }}</strong><em>销售订单开票</em></div><div><span class="domain-kpi-icon"><FileCheck2 /></span><small>进项已收</small><strong>{{ formatCents(inputAmount) }}</strong><em>采购单收票</em></div></div>
  <div class="filter-bar invoice-filter"><n-input value="" readonly placeholder="发票数据与销售、采购业务单据关联"><template #prefix><FileClock :size="17" /></template></n-input><n-select v-model:value="statusFilter" :options="[{label:'全部状态',value:'all'},{label:'待处理',value:'pending'},{label:'已开具/已收票',value:'issued'},{label:'已作废',value:'voided'}]" /></div>
  <state-panel :loading="production.loading.invoices" :error="production.errors.invoices" :empty="!filtered.length" empty-text="当前没有发票记录" @retry="production.loadInvoices">
    <div class="table-wrap action-table"><n-table :single-line="false"><thead><tr><th>申请单号</th><th>方向</th><th>来源单据</th><th>往来单位</th><th>发票抬头</th><th>金额</th><th>发票号码</th><th>状态</th><th>申请/开票日期</th><th>操作</th></tr></thead><tbody><tr v-for="item in filtered" :key="item.id"><td><strong>{{ item.applicationNo }}</strong><small class="cell-detail">{{ item.applicant }}</small></td><td><n-tag size="small" :type="item.direction === 'output' ? 'success' : 'info'">{{ item.direction === 'output' ? '销项' : '进项' }}</n-tag></td><td>{{ item.sourceNo }}<small class="cell-detail">{{ item.sourceType === 'sales_order' ? '销售订单' : '采购单' }}</small></td><td>{{ item.counterparty }}</td><td>{{ item.title }}<small class="cell-detail">{{ item.taxNumber || '未填写税号' }}</small></td><td><strong>{{ formatCents(item.amount) }}</strong></td><td>{{ item.invoiceNo || '-' }}</td><td><n-tag size="small" :type="item.status === 'issued' ? 'success' : item.status === 'voided' ? 'default' : 'warning'">{{ item.status === 'issued' ? (item.direction === 'output' ? '已开具' : '已收票') : item.status === 'voided' ? '已作废' : '待处理' }}</n-tag></td><td>{{ new Date(item.createdAt).toLocaleDateString('zh-CN') }}<small class="cell-detail">{{ item.issuedAt || '尚未登记' }}</small></td><td><table-actions :actions="actions(item)" /></td></tr></tbody></n-table></div>
  </state-panel>

  <n-modal v-model:show="showCreate" preset="card" title="新建发票申请" class="form-modal" :bordered="false"><n-form :model="form" label-placement="top"><div class="form-grid"><n-form-item label="发票方向" required><n-select v-model:value="form.sourceType" :options="[{label:'销项发票（销售订单）',value:'sales_order'},{label:'进项发票（采购单）',value:'purchase'}]" @update:value="form.sourceId = ''" /></n-form-item><n-form-item label="关联业务单据" required><n-select v-model:value="form.sourceId" filterable :options="sourceOptions" placeholder="选择未开票单据" /></n-form-item><n-form-item label="发票抬头" required><n-input v-model:value="form.title" maxlength="200" /></n-form-item><n-form-item label="纳税人识别号"><n-input v-model:value="form.taxNumber" maxlength="50" /></n-form-item><n-form-item label="申请人" required><n-input v-model:value="form.applicant" maxlength="50" /></n-form-item></div><n-form-item label="备注"><n-input v-model:value="form.notes" type="textarea" :rows="3" maxlength="500" /></n-form-item><div class="modal-actions"><n-button @click="showCreate = false">取消</n-button><n-button type="primary" :loading="production.loading.invoiceMutation" @click="createInvoice">提交申请</n-button></div></n-form></n-modal>
  <n-modal v-model:show="showEdit" preset="card" title="编辑发票申请" class="form-modal" :bordered="false"><n-form :model="editForm" label-placement="top"><div class="form-grid"><n-form-item label="申请单号"><n-input :value="editingInvoice?.applicationNo" disabled /></n-form-item><n-form-item label="关联业务单据"><n-input :value="editingInvoice ? `${editingInvoice.sourceNo} · ${formatCents(editingInvoice.amount)}` : ''" disabled /></n-form-item><n-form-item label="发票抬头" required><n-input v-model:value="editForm.title" maxlength="200" /></n-form-item><n-form-item label="纳税人识别号"><n-input v-model:value="editForm.taxNumber" maxlength="50" /></n-form-item><n-form-item label="申请人" required><n-input v-model:value="editForm.applicant" maxlength="50" /></n-form-item></div><n-form-item label="备注"><n-input v-model:value="editForm.notes" type="textarea" :rows="3" maxlength="500" /></n-form-item><div class="modal-actions"><n-button @click="showEdit = false">取消</n-button><n-button type="primary" :loading="production.loading.invoiceMutation" @click="saveInvoice">保存修改</n-button></div></n-form></n-modal>
  <n-modal v-model:show="showIssue" preset="card" :title="selectedInvoice?.direction === 'output' ? '登记开票' : '登记收票'" class="form-modal issue-modal" :bordered="false"><n-form :model="issueForm" label-placement="top"><n-form-item label="发票号码" required><n-input v-model:value="issueForm.invoiceNo" maxlength="100" /></n-form-item><n-form-item label="开票日期" required><n-date-picker v-model:formatted-value="issueForm.issuedAt" value-format="yyyy-MM-dd" type="date" /></n-form-item><div class="modal-actions"><n-button @click="showIssue = false">取消</n-button><n-button type="primary" :loading="production.loading.invoiceMutation" @click="issueInvoice">确认登记</n-button></div></n-form></n-modal>

  <section v-if="selectedInvoice" class="invoice-print-sheet" aria-hidden="true">
    <header>
      <p>丰域农业管理系统</p>
      <h1>{{ selectedInvoice.direction === 'output' ? '销项发票' : '进项发票' }}</h1>
      <div class="invoice-print-meta">
        <span>发票号码：{{ selectedInvoice.invoiceNo }}</span>
        <span>开票日期：{{ selectedInvoice.issuedAt }}</span>
      </div>
    </header>
    <table>
      <tbody>
        <tr><th>发票抬头</th><td colspan="3">{{ selectedInvoice.title }}</td></tr>
        <tr><th>纳税人识别号</th><td colspan="3">{{ selectedInvoice.taxNumber || '-' }}</td></tr>
        <tr><th>往来单位</th><td>{{ selectedInvoice.counterparty }}</td><th>发票方向</th><td>{{ selectedInvoice.direction === 'output' ? '销项' : '进项' }}</td></tr>
        <tr><th>关联单据</th><td>{{ selectedInvoice.sourceNo }}</td><th>单据类型</th><td>{{ selectedInvoice.sourceType === 'sales_order' ? '销售订单' : '采购单' }}</td></tr>
        <tr class="invoice-print-amount"><th>金额（小写）</th><td>{{ formatCents(selectedInvoice.amount) }}</td><th>金额（大写）</th><td>{{ centsToChineseUppercase(selectedInvoice.amount) }}</td></tr>
        <tr><th>申请单号</th><td>{{ selectedInvoice.applicationNo }}</td><th>申请人</th><td>{{ selectedInvoice.applicant }}</td></tr>
        <tr class="invoice-print-notes"><th>备注</th><td colspan="3">{{ selectedInvoice.notes || '-' }}</td></tr>
      </tbody>
    </table>
    <footer><span>打印日期：{{ new Date().toLocaleDateString('zh-CN') }}</span><span>经办人签字：</span></footer>
  </section>
</template>

<style scoped>
.invoice-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }.invoice-filter { grid-template-columns: 1fr 220px; }.table-wrap .n-table { min-width: 1320px; }.issue-modal { width: min(520px, calc(100vw - 32px)); }
.invoice-print-sheet { display: none; }
@media (max-width: 700px) { .invoice-kpis, .invoice-filter { grid-template-columns: 1fr; } }
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  :global(body *) { visibility: hidden !important; }
  .invoice-print-sheet, .invoice-print-sheet * { visibility: visible !important; }
  .invoice-print-sheet { position: fixed; inset: 0; display: block; padding: 8mm; background: #fff; color: #111; font-family: "Microsoft YaHei", sans-serif; }
  .invoice-print-sheet header { text-align: center; }
  .invoice-print-sheet header p { margin: 0 0 3mm; font-size: 12px; letter-spacing: 2px; }
  .invoice-print-sheet h1 { margin: 0; font-size: 26px; font-weight: 600; letter-spacing: 8px; }
  .invoice-print-meta { display: flex; justify-content: flex-end; gap: 10mm; margin: 8mm 0 3mm; font-size: 12px; }
  .invoice-print-sheet table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 13px; }
  .invoice-print-sheet th, .invoice-print-sheet td { padding: 4mm 3mm; border: 1px solid #222; text-align: left; vertical-align: middle; overflow-wrap: anywhere; }
  .invoice-print-sheet th { width: 17%; background: #f5f5f5; font-weight: 600; }
  .invoice-print-amount td:last-child { font-size: 12px; }
  .invoice-print-notes { height: 24mm; }
  .invoice-print-sheet footer { display: flex; justify-content: space-between; margin-top: 8mm; font-size: 12px; }
}
</style>
