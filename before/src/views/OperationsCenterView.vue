<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, CheckCircle2, DatabaseBackup, Download, FileClock, FileUp, FolderOpen, RefreshCw, RotateCcw, ShieldAlert } from '@/icons/iconpark'
import { useOperationsStore } from '@/stores/operations'
import { useAuthStore } from '@/stores/auth'
import type { OperationsRisk } from '@/types'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'

const operations = useOperationsStore()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const message = useMessage()
const isDesktop = Boolean(window.agricultureDesktop?.isDesktop)
const customBackup = reactive({ directory: '', available: false, loading: false, error: '', lastFilePath: '' })
const activeTab = ref(route.name === 'data-security' ? 'data' : 'risks')
const directDataEntry = computed(() => route.name === 'data-security')
const panelLoading = computed(() => activeTab.value === 'data'
  ? operations.loading.backups
  : operations.loading.summary || operations.loading.risks)
const panelError = computed(() => activeTab.value === 'data'
  ? operations.errors.backups
  : operations.errors.summary || operations.errors.risks)
const verification = reactive({
  show: false,
  busy: false,
  operation: '' as 'local-data-sync' | 'database-restore' | '',
  targetName: '',
  currentPassword: '',
  confirmation: '',
})
const verificationPhrase = computed(() => verification.operation === 'database-restore' ? 'RESTORE DATABASE' : 'LOCAL DATA SYNC')
const verificationTitle = computed(() => verification.operation === 'database-restore' ? '验证数据库恢复' : '验证本地数据同步')
const s = computed(() => operations.summary)
const sourceLabels: Record<OperationsRisk['source'], string> = { alert: '设备告警', task: '生产任务', issue: '巡田问题', inventory: '库存台账', cycle: '种植季', quality: '采收质检', contract: '农业合同', document: '合规文书' }
const domainLabels: Record<string, string> = { subject: '经营主体', farm: '农场', field: '地块', task: '任务', alert: '设备告警', inventory: '库存', issue: '巡田问题', crop_cycle: '种植季', production_plan: '生产计划', operation_log: '农事实绩', harvest_batch: '采收批次', sales_order: '销售订单', document: '合规文书', contract: '农业合同', correction: '纠错工单', system: '系统' }
const actionLabel = (action: string) => action.startsWith('status:') ? `状态变更为 ${action.slice(7)}` : action.startsWith('transaction:') ? `库存${action.slice(12)}` : action.startsWith('quality:') ? `质检${action.slice(8)}` : ({ create: '新建', archive: '归档', acknowledge: '确认', backup: '创建备份', uproot: '挖除作物', update_status: '更新状态' }[action] || action)
function money(value: number) { return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(value) }
function bytes(value: number) { return value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(2)} MB` }
async function refresh() {
  const loaders = activeTab.value === 'data'
    ? [operations.loadBackups()]
    : [operations.loadOperations(), operations.loadBackups()]
  await Promise.all(loaders).catch(() => undefined)
}
async function createBackup() { try { const result = await operations.createBackup(); message.success(`本机数据库备份已创建：${result.path}`); await operations.loadAudits() } catch { message.error(operations.errors.backupMutation) } }
async function exportBackup(name: string) { try { const result = await window.agricultureDesktop?.exportBackup(auth.token, name); if (result && !result.canceled) message.success(`备份已导出：${result.filePath}`) } catch (cause) { message.error(cause instanceof Error ? cause.message : '导出备份失败') } }
function restoreBackup(name: string) {
  openVerification('database-restore', name)
}
async function openBackupDirectory() { try { await window.agricultureDesktop?.openBackupDirectory(auth.token) } catch (cause) { message.error(cause instanceof Error ? cause.message : '无法打开备份目录') } }
function selectLocalDataFile() {
  if (!window.agricultureDesktop) return message.warning('本地文件同步只能在 Electron 桌面端使用')
  openVerification('local-data-sync')
}
function openVerification(operation: 'local-data-sync' | 'database-restore', targetName = '') {
  Object.assign(verification, { show: true, busy: false, operation, targetName, currentPassword: '', confirmation: '' })
}
async function confirmVerifiedOperation() {
  if (!verification.currentPassword || verification.confirmation !== verificationPhrase.value) return
  verification.busy = true
  try {
    const authorization = await operations.authorizeOperation(
      verification.currentPassword,
      verification.operation,
      verification.confirmation,
    )
    if (verification.operation === 'database-restore') {
      if (!window.agricultureDesktop) throw new Error('数据库恢复只能在 Electron 桌面端使用')
      await window.agricultureDesktop.restoreBackup({
        name: verification.targetName,
        accessToken: auth.token,
        operationToken: authorization.token,
      })
      verification.show = false
      message.info('正在重启并恢复数据库...')
      return
    }
    const selected = await window.agricultureDesktop?.selectLocalDataFile(auth.token)
    if (!selected || selected.canceled) return
    if (!selected.importId || !selected.fileName) throw new Error('未取得有效的数据文件')
    const result = await operations.syncLocalFile(selected.importId, selected.fileName, authorization.token)
    verification.show = false
    message.success(`本地同步完成：新增 ${result.inserted} 条，更新 ${result.updated} 条`)
    await operations.loadOperations().catch(() => message.warning('数据已同步，但当前页面刷新失败，请手动刷新'))
  } catch (cause) {
    message.error(cause instanceof Error ? cause.message : '高危操作验证失败')
  } finally {
    verification.busy = false
  }
}
async function loadCustomBackupConfig() {
  if (!window.agricultureDesktop) return
  customBackup.error = ''
  try {
    const config = await window.agricultureDesktop.getCustomBackupConfig(auth.token)
    customBackup.directory = config.directory
    customBackup.available = config.available
    if (config.directory && !config.available) customBackup.error = '已配置目录当前不可用，请重新选择'
  } catch (cause) {
    customBackup.error = cause instanceof Error ? cause.message : '读取外部镜像目录失败'
  }
}
async function selectCustomBackupDirectory() {
  try {
    const result = await window.agricultureDesktop?.selectCustomBackupDirectory(auth.token)
    if (!result || result.canceled) return
    customBackup.directory = result.directory || ''
    customBackup.available = Boolean(result.directory)
    customBackup.error = ''
  } catch (cause) {
    message.error(cause instanceof Error ? cause.message : '选择镜像备份目录失败')
  }
}
async function backupToCustomDirectory() {
  customBackup.loading = true
  try {
    const result = await window.agricultureDesktop?.backupToCustomDirectory(auth.token)
    if (result) {
      customBackup.lastFilePath = result.filePath
      message.success(`外部镜像备份已创建：${result.filePath}`)
    }
  } catch (cause) {
    message.error(cause instanceof Error ? cause.message : '镜像备份失败')
  } finally {
    customBackup.loading = false
  }
}
async function openCustomBackupDirectory() { try { await window.agricultureDesktop?.openCustomBackupDirectory(auth.token) } catch (cause) { message.error(cause instanceof Error ? cause.message : '无法打开外部镜像目录') } }
async function checkIntegrity() { try { const result = await operations.checkIntegrity(); result.ok ? message.success('SQLite 完整性检查通过') : message.error(result.messages.join('；')) } catch { message.error(operations.errors.integrity) } }
watch(() => route.name, (name) => { activeTab.value = name === 'data-security' ? 'data' : 'risks' })
watch(activeTab, (tab) => {
  if (tab === 'data' && !operations.backups.length && !operations.loading.backups) void operations.loadBackups().catch(() => undefined)
})
onMounted(() => { void Promise.all([refresh(), loadCustomBackupConfig()]) })
</script>

<template>
  <page-header :title="directDataEntry ? '本地备份与同步' : '运营风险与数据安全'" :description="directDataEntry ? '创建本机 SQLite 备份、外部目录镜像，或选择数据文件执行受控合并' : '从原始业务记录实时汇总风险，并保留关键操作审计'"><n-button secondary :loading="operations.loading.summary" @click="refresh"><template #icon><RefreshCw /></template>刷新</n-button></page-header>
  <div v-if="!directDataEntry" class="operations-hero">
    <div class="operations-primary"><span><ShieldAlert /></span><div><small>当前开放风险</small><strong>{{ s.openRisks }}</strong><em>其中 {{ s.criticalRisks }} 项严重</em></div></div>
    <div><small>活跃种植季</small><strong>{{ s.activeCycles }}</strong><em>{{ s.pendingPlans }} 项计划待执行</em></div>
    <div><small>生产成本</small><strong>{{ money(s.actualCost) }}</strong><em>计划预算 {{ money(s.plannedBudget) }}</em></div>
    <div><small>销售收入</small><strong>{{ money(s.salesRevenue) }}</strong><em>待收 {{ money(s.receivables) }}</em></div>
  </div>

  <state-panel :loading="panelLoading" :error="panelError" @retry="refresh">
    <n-tabs v-model:value="activeTab" type="line" animated>
      <n-tab-pane name="risks" tab="风险汇总">
        <div v-if="operations.risks.length" class="risk-list"><article v-for="item in operations.risks" :key="item.id" :class="['risk-row', item.severity]"><span class="risk-symbol"><AlertTriangle /></span><div><div class="risk-title"><strong>{{ item.title }}</strong><n-tag size="tiny" :type="item.severity === 'critical' ? 'error' : 'warning'">{{ item.severity === 'critical' ? '严重' : '关注' }}</n-tag><n-tag size="tiny" :bordered="false">{{ sourceLabels[item.source] }}</n-tag></div><p>{{ item.content }}</p><small>{{ item.riskAt }} · 当前状态 {{ item.status }}</small></div><n-button size="small" secondary @click="router.push(item.route)">查看来源</n-button></article></div>
        <div v-else class="risk-clear"><CheckCircle2 /><strong>当前没有开放风险</strong><span>风险中心直接读取业务记录，不复制第二份状态</span></div>
      </n-tab-pane>
      <n-tab-pane name="audit" tab="操作审计">
        <div class="table-wrap audit-table"><n-table :single-line="false"><thead><tr><th>时间</th><th>业务域</th><th>动作</th><th>操作人</th><th>详情</th><th>记录标识</th></tr></thead><tbody><tr v-for="item in operations.audits" :key="item.id"><td>{{ new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</td><td>{{ domainLabels[item.domain] || item.domain }}</td><td><n-tag size="small" :bordered="false">{{ actionLabel(item.action) }}</n-tag></td><td>{{ item.actor }}</td><td>{{ item.detail || '-' }}</td><td><code>{{ item.recordId }}</code></td></tr></tbody></n-table></div>
      </n-tab-pane>
      <n-tab-pane name="data" tab="数据安全">
        <div class="data-safety-grid">
          <section class="data-tool"><span class="data-tool-icon"><DatabaseBackup /></span><div><h3>创建本机数据库备份</h3><p>使用 SQLite `VACUUM INTO` 生成一致性快照，保存在程序受控目录，并在下方历史中提供恢复与导出。</p></div><n-button type="primary" :loading="operations.loading.backupMutation" @click="createBackup">创建本机备份</n-button></section>
          <section class="data-tool"><span class="data-tool-icon amber"><ShieldAlert /></span><div><h3>数据库完整性</h3><p>执行 `PRAGMA integrity_check`，检查页结构和索引一致性。</p><small v-if="operations.integrity">上次检查 {{ new Date(operations.integrity.checkedAt).toLocaleString('zh-CN', { hour12: false }) }} · {{ operations.integrity.ok ? '通过' : '异常' }}</small></div><n-button secondary :loading="operations.loading.integrity" @click="checkIntegrity">运行检查</n-button></section>
           <section class="data-tool local-sync-tool"><span class="data-tool-icon blue"><FileUp /></span><div><h3>选择 SQLite 数据文件并本地同步</h3><p>选择 `.db`、`.sqlite` 或 `.sqlite3` 文件，完成管理员密码和确认短语验证后按更新时间合并；现有本机备份、云同步、局域网和终端配置均保留。</p><small v-if="operations.lastLocalSync">最近同步 {{ operations.lastLocalSync.sourceName }} · 新增 {{ operations.lastLocalSync.inserted }} · 更新 {{ operations.lastLocalSync.updated }}</small></div><n-button secondary type="info" :disabled="!isDesktop" :loading="operations.loading.localSync" @click="selectLocalDataFile">选择文件并同步</n-button></section>
           <section class="data-tool local-sync-tool"><span class="data-tool-icon"><FolderOpen /></span><div><h3>选择外部目录并创建镜像备份</h3><p>可选择项目目录、移动硬盘或共享盘，例如 E:\\Project\\agriculture；这是额外镜像，程序受控备份及其他同步方式会继续保留。</p><small :class="{ 'config-error': customBackup.error }">{{ customBackup.error || customBackup.lastFilePath || customBackup.directory || '尚未选择外部目录，例如 E:\\Project\\agriculture' }}</small></div><div class="custom-backup-actions"><n-button secondary :disabled="!isDesktop" @click="selectCustomBackupDirectory">选择外部目录</n-button><n-button v-if="customBackup.available" quaternary circle title="打开外部镜像目录" aria-label="打开外部镜像目录" @click="openCustomBackupDirectory"><FolderOpen /></n-button><n-button type="primary" :disabled="!customBackup.available" :loading="customBackup.loading" @click="backupToCustomDirectory">创建镜像备份</n-button></div></section>
         </div>
        <div class="section-heading backup-heading"><div><h2>本地备份历史</h2><p>每份备份都可导出到移动硬盘、共享盘或其他指定位置</p></div><div class="backup-heading-actions"><n-button v-if="isDesktop" quaternary title="打开备份目录" @click="openBackupDirectory"><template #icon><FolderOpen /></template>打开目录</n-button><n-tag :bordered="false">{{ operations.backups.length }} 份</n-tag></div></div>
        <div v-if="operations.backups.length" class="backup-list"><div v-for="item in operations.backups" :key="item.name"><FileClock /><span><strong>{{ item.name }}</strong><small>{{ item.path }}</small></span><em>{{ bytes(item.size) }}</em><time>{{ new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</time><div v-if="isDesktop" class="backup-actions"><n-button quaternary circle title="恢复此备份" @click="restoreBackup(item.name)"><template #icon><RotateCcw /></template></n-button><n-button quaternary circle title="导出备份" @click="exportBackup(item.name)"><template #icon><Download /></template></n-button></div></div></div><div v-else class="empty-inline">尚未创建数据库备份</div>
      </n-tab-pane>
     </n-tabs>
   </state-panel>

  <n-modal v-model:show="verification.show" preset="card" :title="verificationTitle" class="verification-modal" :mask-closable="!verification.busy">
    <n-alert type="warning" :show-icon="true">
      {{ verification.operation === 'database-restore' ? `恢复 ${verification.targetName} 将替换当前数据库并重启应用。` : '外部数据将校验后合并，系统会先自动备份当前数据库。' }}
    </n-alert>
    <n-form label-placement="top" class="verification-form">
      <n-form-item label="当前管理员密码" required><n-input v-model:value="verification.currentPassword" type="password" show-password-on="click" autocomplete="current-password" /></n-form-item>
      <n-form-item :label="`输入确认短语 ${verificationPhrase}`" required><n-input v-model:value="verification.confirmation" :placeholder="verificationPhrase" /></n-form-item>
    </n-form>
    <template #footer><div class="modal-actions"><n-button :disabled="verification.busy" @click="verification.show = false">取消</n-button><n-button type="error" :loading="verification.busy" :disabled="!verification.currentPassword || verification.confirmation !== verificationPhrase" @click="confirmVerifiedOperation">验证并继续</n-button></div></template>
  </n-modal>
</template>

<style scoped>
.operations-hero { margin-bottom: 22px; padding: 18px 0; display: grid; grid-template-columns: 1.15fr repeat(3, 1fr); color: #fff; background: #30433c; border-radius: 8px; }.operations-hero > div { min-height: 74px; padding: 6px 22px; border-right: 1px solid rgba(255,255,255,.1); }.operations-hero > div:last-child { border: 0; }.operations-hero small, .operations-hero em { display: block; color: #b7c4be; font-size: 10px; font-style: normal; }.operations-hero strong { display: block; margin: 6px 0 4px; color: #f0c66f; font-size: 22px; }.operations-primary { display: flex; gap: 13px; align-items: center; }.operations-primary > span { width: 42px; height: 42px; display: grid; place-items: center; color: #30433c; background: #d7a64a; border-radius: 7px; }.operations-primary svg { width: 22px; }
.risk-list { overflow: hidden; border: 1px solid #e0e5e2; border-radius: 8px; background: #fff; }.risk-row { min-height: 92px; padding: 14px 16px; display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: center; gap: 13px; border-bottom: 1px solid #e9edeb; border-left: 3px solid #d29c3d; }.risk-row:last-child { border-bottom: 0; }.risk-row.critical { border-left-color: #b65347; }.risk-symbol { width: 36px; height: 36px; display: grid; place-items: center; color: #a7701f; background: #f7eddc; border-radius: 7px; }.critical .risk-symbol { color: #a94f43; background: #f4e5e2; }.risk-symbol svg { width: 18px; }.risk-title { display: flex; align-items: center; gap: 7px; }.risk-row p { margin: 6px 0; color: #5f6c66; font-size: 12px; }.risk-row small { color: #89948f; font-size: 10px; }.risk-clear { min-height: 260px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #7c8983; }.risk-clear svg { width: 34px; height: 34px; margin-bottom: 9px; color: #5d8268; }.risk-clear strong { color: #405047; }.risk-clear span { margin-top: 4px; font-size: 11px; }
.audit-table .n-table { min-width: 1000px; }.audit-table code { font-size: 10px; color: #6c7973; }
.data-safety-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }.data-tool { padding: 18px; display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; align-items: center; gap: 13px; border: 1px solid #e0e5e2; border-radius: 8px; background: #fff; }.local-sync-tool { grid-column: 1 / -1; }.data-tool-icon { width: 42px; height: 42px; display: grid; place-items: center; color: #4a7258; background: #e8f0ea; border-radius: 7px; }.data-tool-icon.amber { color: #9d6a20; background: #f5ecdc; }.data-tool-icon.blue { color: #456f83; background: #e5eef2; }.data-tool-icon svg { width: 20px; }.data-tool h3 { margin: 0; font-size: 14px; }.data-tool p { margin: 5px 0 0; color: #7a8781; font-size: 11px; line-height: 1.5; }.data-tool small { display: block; max-width: 620px; margin-top: 4px; overflow: hidden; color: #60776a; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }.custom-backup-actions, .modal-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }.verification-modal { width: min(520px, calc(100vw - 32px)); }.verification-form { margin-top: 18px; }.backup-heading { margin-top: 24px; }.backup-heading-actions, .backup-actions { display: flex; align-items: center; gap: 8px; }.backup-actions { justify-content: flex-end; }.backup-list { border: 1px solid #e0e5e2; border-radius: 8px; background: #fff; }.backup-list > div { min-height: 64px; padding: 10px 16px; display: grid; grid-template-columns: 28px minmax(0, 1fr) 70px 150px 76px; align-items: center; gap: 10px; border-bottom: 1px solid #edf0ee; }.backup-list > div:last-child { border: 0; }.backup-list svg { width: 17px; color: #60796a; }.backup-list strong, .backup-list small { display: block; }.backup-list strong { font-size: 12px; }.backup-list small { margin-top: 3px; overflow: hidden; color: #89948f; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }.backup-list em, .backup-list time { color: #77847e; font-size: 10px; font-style: normal; }
.config-error { color: #b65347 !important; }
@media (max-width: 1000px) { .operations-hero { grid-template-columns: 1fr 1fr; }.operations-hero > div:nth-child(2) { border-right: 0; }.data-safety-grid { grid-template-columns: 1fr; } }
@media (max-width: 650px) { .operations-hero { grid-template-columns: 1fr; }.operations-hero > div { border-right: 0; border-bottom: 1px solid rgba(255,255,255,.1); }.risk-row { grid-template-columns: 34px 1fr; }.risk-row .n-button { grid-column: 2; justify-self: start; }.data-tool { grid-template-columns: 38px 1fr; }.data-tool .n-button { grid-column: 2; justify-self: start; }.custom-backup-actions { grid-column: 2; flex-wrap: wrap; justify-content: flex-start; }.backup-heading { align-items: flex-start; }.backup-heading-actions { flex-direction: column-reverse; align-items: flex-end; }.backup-list > div { grid-template-columns: 24px 1fr auto 34px; }.backup-list time { display: none; } }
</style>
