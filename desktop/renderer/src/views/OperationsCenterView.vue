<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { useRouter } from 'vue-router'
import { AlertTriangle, CheckCircle2, Coins, DatabaseBackup, FileClock, RefreshCw, ShieldAlert, Sprout, WalletCards } from '@lucide/vue'
import { useOperationsStore } from '@/stores/operations'
import type { OperationsRisk } from '@/types'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'

const operations = useOperationsStore()
const router = useRouter()
const message = useMessage()
const s = computed(() => operations.summary)
const sourceLabels: Record<OperationsRisk['source'], string> = { alert: '设备告警', task: '生产任务', issue: '巡田问题', inventory: '库存台账', cycle: '种植季', quality: '采收质检', contract: '农业合同', document: '合规文书' }
const domainLabels: Record<string, string> = { subject: '经营主体', farm: '农场', field: '地块', task: '任务', alert: '设备告警', inventory: '库存', issue: '巡田问题', crop_cycle: '种植季', production_plan: '生产计划', operation_log: '农事实绩', harvest_batch: '采收批次', sales_order: '销售订单', document: '合规文书', contract: '农业合同', correction: '纠错工单', system: '系统' }
const actionLabel = (action: string) => action.startsWith('status:') ? `状态变更为 ${action.slice(7)}` : action.startsWith('transaction:') ? `库存${action.slice(12)}` : action.startsWith('quality:') ? `质检${action.slice(8)}` : ({ create: '新建', archive: '归档', acknowledge: '确认', backup: '创建备份', update_status: '更新状态' }[action] || action)
function money(value: number) { return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(value) }
function bytes(value: number) { return value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(2)} MB` }
async function refresh() { await Promise.all([operations.loadOperations(), operations.loadBackups()]).catch(() => undefined) }
async function createBackup() { try { const result = await operations.createBackup(); message.success(`备份已创建：${result.name}`); await operations.loadAudits() } catch { message.error(operations.errors.backupMutation) } }
async function checkIntegrity() { try { const result = await operations.checkIntegrity(); result.ok ? message.success('SQLite 完整性检查通过') : message.error(result.messages.join('；')) } catch { message.error(operations.errors.integrity) } }
onMounted(refresh)
</script>

<template>
  <page-header title="运营风险与数据安全" description="从原始业务记录实时汇总风险，并保留关键操作审计"><n-button secondary :loading="operations.loading.summary" @click="refresh"><template #icon><RefreshCw /></template>刷新</n-button></page-header>
  <div class="operations-hero">
    <div class="operations-primary"><span><ShieldAlert /></span><div><small>当前开放风险</small><strong>{{ s.openRisks }}</strong><em>其中 {{ s.criticalRisks }} 项严重</em></div></div>
    <div><small>活跃种植季</small><strong>{{ s.activeCycles }}</strong><em>{{ s.pendingPlans }} 项计划待执行</em></div>
    <div><small>生产成本</small><strong>{{ money(s.actualCost) }}</strong><em>计划预算 {{ money(s.plannedBudget) }}</em></div>
    <div><small>销售收入</small><strong>{{ money(s.salesRevenue) }}</strong><em>待收 {{ money(s.receivables) }}</em></div>
  </div>

  <state-panel :loading="operations.loading.summary || operations.loading.risks" :error="operations.errors.summary || operations.errors.risks" @retry="refresh">
    <n-tabs type="line" animated>
      <n-tab-pane name="risks" tab="风险汇总">
        <div v-if="operations.risks.length" class="risk-list"><article v-for="item in operations.risks" :key="item.id" :class="['risk-row', item.severity]"><span class="risk-symbol"><AlertTriangle /></span><div><div class="risk-title"><strong>{{ item.title }}</strong><n-tag size="tiny" :type="item.severity === 'critical' ? 'error' : 'warning'">{{ item.severity === 'critical' ? '严重' : '关注' }}</n-tag><n-tag size="tiny" :bordered="false">{{ sourceLabels[item.source] }}</n-tag></div><p>{{ item.content }}</p><small>{{ item.riskAt }} · 当前状态 {{ item.status }}</small></div><n-button size="small" secondary @click="router.push(item.route)">查看来源</n-button></article></div>
        <div v-else class="risk-clear"><CheckCircle2 /><strong>当前没有开放风险</strong><span>风险中心直接读取业务记录，不复制第二份状态</span></div>
      </n-tab-pane>
      <n-tab-pane name="audit" tab="操作审计">
        <div class="table-wrap audit-table"><n-table :single-line="false"><thead><tr><th>时间</th><th>业务域</th><th>动作</th><th>操作人</th><th>详情</th><th>记录标识</th></tr></thead><tbody><tr v-for="item in operations.audits" :key="item.id"><td>{{ new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</td><td>{{ domainLabels[item.domain] || item.domain }}</td><td><n-tag size="small" :bordered="false">{{ actionLabel(item.action) }}</n-tag></td><td>{{ item.actor }}</td><td>{{ item.detail || '-' }}</td><td><code>{{ item.recordId }}</code></td></tr></tbody></n-table></div>
      </n-tab-pane>
      <n-tab-pane name="data" tab="数据安全">
        <div class="data-safety-grid">
          <section class="data-tool"><span class="data-tool-icon"><DatabaseBackup /></span><div><h3>SQLite 自动备份</h3><p>使用 SQLite `VACUUM INTO` 生成一致性快照，保存在本机数据目录。</p></div><n-button type="primary" :loading="operations.loading.backupMutation" @click="createBackup">立即备份</n-button></section>
          <section class="data-tool"><span class="data-tool-icon amber"><ShieldAlert /></span><div><h3>数据库完整性</h3><p>执行 `PRAGMA integrity_check`，检查页结构和索引一致性。</p><small v-if="operations.integrity">上次检查 {{ new Date(operations.integrity.checkedAt).toLocaleString('zh-CN', { hour12: false }) }} · {{ operations.integrity.ok ? '通过' : '异常' }}</small></div><n-button secondary :loading="operations.loading.integrity" @click="checkIntegrity">运行检查</n-button></section>
        </div>
        <div class="section-heading backup-heading"><div><h2>备份历史</h2><p>正式上线前仍需增加保留策略和异机恢复演练</p></div><n-tag :bordered="false">{{ operations.backups.length }} 份</n-tag></div>
        <div v-if="operations.backups.length" class="backup-list"><div v-for="item in operations.backups" :key="item.name"><FileClock /><span><strong>{{ item.name }}</strong><small>{{ item.path }}</small></span><em>{{ bytes(item.size) }}</em><time>{{ new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</time></div></div><div v-else class="empty-inline">尚未创建数据库备份</div>
      </n-tab-pane>
    </n-tabs>
  </state-panel>
</template>

<style scoped>
.operations-hero { margin-bottom: 22px; padding: 18px 0; display: grid; grid-template-columns: 1.15fr repeat(3, 1fr); color: #fff; background: #30433c; border-radius: 8px; }.operations-hero > div { min-height: 74px; padding: 6px 22px; border-right: 1px solid rgba(255,255,255,.1); }.operations-hero > div:last-child { border: 0; }.operations-hero small, .operations-hero em { display: block; color: #b7c4be; font-size: 10px; font-style: normal; }.operations-hero strong { display: block; margin: 6px 0 4px; color: #f0c66f; font-size: 22px; }.operations-primary { display: flex; gap: 13px; align-items: center; }.operations-primary > span { width: 42px; height: 42px; display: grid; place-items: center; color: #30433c; background: #d7a64a; border-radius: 7px; }.operations-primary svg { width: 22px; }
.risk-list { overflow: hidden; border: 1px solid #e0e5e2; border-radius: 8px; background: #fff; }.risk-row { min-height: 92px; padding: 14px 16px; display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: center; gap: 13px; border-bottom: 1px solid #e9edeb; border-left: 3px solid #d29c3d; }.risk-row:last-child { border-bottom: 0; }.risk-row.critical { border-left-color: #b65347; }.risk-symbol { width: 36px; height: 36px; display: grid; place-items: center; color: #a7701f; background: #f7eddc; border-radius: 7px; }.critical .risk-symbol { color: #a94f43; background: #f4e5e2; }.risk-symbol svg { width: 18px; }.risk-title { display: flex; align-items: center; gap: 7px; }.risk-row p { margin: 6px 0; color: #5f6c66; font-size: 12px; }.risk-row small { color: #89948f; font-size: 10px; }.risk-clear { min-height: 260px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #7c8983; }.risk-clear svg { width: 34px; height: 34px; margin-bottom: 9px; color: #5d8268; }.risk-clear strong { color: #405047; }.risk-clear span { margin-top: 4px; font-size: 11px; }
.audit-table .n-table { min-width: 1000px; }.audit-table code { font-size: 10px; color: #6c7973; }
.data-safety-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }.data-tool { padding: 18px; display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; align-items: center; gap: 13px; border: 1px solid #e0e5e2; border-radius: 8px; background: #fff; }.data-tool-icon { width: 42px; height: 42px; display: grid; place-items: center; color: #4a7258; background: #e8f0ea; border-radius: 7px; }.data-tool-icon.amber { color: #9d6a20; background: #f5ecdc; }.data-tool-icon svg { width: 20px; }.data-tool h3 { margin: 0; font-size: 14px; }.data-tool p { margin: 5px 0 0; color: #7a8781; font-size: 11px; line-height: 1.5; }.data-tool small { color: #60776a; font-size: 10px; }.backup-heading { margin-top: 24px; }.backup-list { border: 1px solid #e0e5e2; border-radius: 8px; background: #fff; }.backup-list > div { min-height: 64px; padding: 10px 16px; display: grid; grid-template-columns: 28px minmax(0, 1fr) 70px 150px; align-items: center; gap: 10px; border-bottom: 1px solid #edf0ee; }.backup-list > div:last-child { border: 0; }.backup-list svg { width: 17px; color: #60796a; }.backup-list strong, .backup-list small { display: block; }.backup-list strong { font-size: 12px; }.backup-list small { margin-top: 3px; overflow: hidden; color: #89948f; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }.backup-list em, .backup-list time { color: #77847e; font-size: 10px; font-style: normal; }
@media (max-width: 1000px) { .operations-hero { grid-template-columns: 1fr 1fr; }.operations-hero > div:nth-child(2) { border-right: 0; }.data-safety-grid { grid-template-columns: 1fr; } }
@media (max-width: 650px) { .operations-hero { grid-template-columns: 1fr; }.operations-hero > div { border-right: 0; border-bottom: 1px solid rgba(255,255,255,.1); }.risk-row { grid-template-columns: 34px 1fr; }.risk-row .n-button { grid-column: 2; justify-self: start; }.data-tool { grid-template-columns: 38px 1fr; }.data-tool .n-button { grid-column: 2; justify-self: start; }.backup-list > div { grid-template-columns: 24px 1fr auto; }.backup-list time { display: none; } }
</style>
