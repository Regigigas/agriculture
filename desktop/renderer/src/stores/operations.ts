import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { request } from '@/api/client'
import type { AuditLog, BackupInfo, IntegrityResult, OperationsRisk, OperationsSummary } from '@/types'

const emptySummary = (): OperationsSummary => ({
  activeSubjects: 0, activeFarms: 0, activeCycles: 0, pendingPlans: 0,
  plannedBudget: 0, actualCost: 0, harvestQuantity: 0, salesRevenue: 0,
  receivables: 0, criticalRisks: 0, openRisks: 0,
})

export const useOperationsStore = defineStore('operations', () => {
  const summary = ref<OperationsSummary>(emptySummary())
  const risks = ref<OperationsRisk[]>([])
  const audits = ref<AuditLog[]>([])
  const backups = ref<BackupInfo[]>([])
  const integrity = ref<IntegrityResult | null>(null)
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
  const checkIntegrity = () => run('integrity', async () => { integrity.value = await request<IntegrityResult>('/system/integrity'); return integrity.value })

  return { summary, risks, audits, backups, integrity, loading, errors, loadSummary, loadRisks, loadAudits, loadBackups, loadOperations, createBackup, checkIntegrity }
})
