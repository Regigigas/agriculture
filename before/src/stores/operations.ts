import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi, request } from '@/api/client'
import type { AuditLog, BackupInfo, IntegrityResult, LocalSyncResult, OperationsRisk, OperationsSummary } from '@/types'

const emptySummary = (): OperationsSummary => ({
  activeSubjects: 0, activeFarms: 0, activeCycles: 0, pendingPlans: 0,
  plannedBudget: 0, actualCost: 0, harvestQuantity: 0, salesRevenue: 0, realizedProfit: 0, projectedProfit: 0,
  receivables: 0, criticalRisks: 0, openRisks: 0,
})

export const useOperationsStore = defineStore('operations', () => {
  const summary = ref<OperationsSummary>(emptySummary())
  const risks = ref<OperationsRisk[]>([])
  const audits = ref<AuditLog[]>([])
  const backups = ref<BackupInfo[]>([])
  const integrity = ref<IntegrityResult | null>(null)
  const lastLocalSync = ref<LocalSyncResult | null>(null)
  const loading = reactive<Record<string, boolean>>({})
  const errors = reactive<Record<string, string>>({})

  async function run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    loading[key] = true; errors[key] = ''
    try { return await operation() }
    catch (cause) { errors[key] = cause instanceof Error ? cause.message : '操作失败'; throw cause }
    finally { loading[key] = false }
  }

  const loadSummary = () => run('summary', async () => { summary.value = await request<OperationsSummary>('/operations/summary') })
  const loadRisks = () => run('risks', async () => { risks.value = await request<OperationsRisk[]>('/operations/risks') })
  const loadAudits = () => run('audits', async () => { audits.value = await request<AuditLog[]>('/operations/audit-logs?limit=300') })
  const loadBackups = () => run('backups', async () => { backups.value = await request<BackupInfo[]>('/system/backups') })
  const loadOperations = () => Promise.all([loadSummary(), loadRisks(), loadAudits()])
  const createBackup = () => run('backupMutation', async () => { const backup = await request<BackupInfo>('/system/backups', { method: 'POST' }); backups.value.unshift(backup); return backup })
  const authorizeOperation = (currentPassword: string, operation: string, confirmation: string) =>
    authApi.authorizeOperation({ currentPassword, operation, confirmation })
  const syncLocalFile = (importId: string, sourceName: string, operationToken: string) => run('localSync', async () => {
    const result = await request<LocalSyncResult>('/system/local-sync', {
      method: 'POST',
      body: JSON.stringify({ importId, sourceName }),
      headers: { 'x-operation-authorization': operationToken },
    })
    lastLocalSync.value = result
    await loadBackups().catch(() => undefined)
    return result
  })
  const checkIntegrity = () => run('integrity', async () => { integrity.value = await request<IntegrityResult>('/system/integrity'); return integrity.value })

  function reset() {
    summary.value = emptySummary()
    risks.value = []
    audits.value = []
    backups.value = []
    integrity.value = null
    lastLocalSync.value = null
    for (const key of Object.keys(loading)) delete loading[key]
    for (const key of Object.keys(errors)) delete errors[key]
  }

  return { summary, risks, audits, backups, integrity, lastLocalSync, loading, errors, loadSummary, loadRisks, loadAudits, loadBackups, loadOperations, createBackup, authorizeOperation, syncLocalFile, checkIntegrity, reset }
})
