import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { request } from '@/api/client'
import type { Barn, BarnStatus, FeedingRecord, LivestockBatch, LivestockBatchStatus, LivestockExitRecord, LivestockHealthRecord, LivestockSummary } from '@/types'

export const useLivestockStore = defineStore('livestock', () => {
  const summary = ref<LivestockSummary>({ barns: 0, activeBatches: 0, currentAnimals: 0, quarantineBatches: 0, feedTodayKg: 0, healthDue: 0, exitedThisMonth: 0 })
  const barns = ref<Barn[]>([])
  const batches = ref<LivestockBatch[]>([])
  const feeding = ref<FeedingRecord[]>([])
  const health = ref<LivestockHealthRecord[]>([])
  const exits = ref<LivestockExitRecord[]>([])
  const loading = reactive<Record<string, boolean>>({})
  const errors = reactive<Record<string, string>>({})

  async function run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    loading[key] = true; errors[key] = ''
    try { return await operation() }
    catch (cause) { errors[key] = cause instanceof Error ? cause.message : '操作失败'; throw cause }
    finally { loading[key] = false }
  }
  const loadAll = () => run('all', async () => {
    const data = await Promise.all([
      request<LivestockSummary>('/livestock/summary'), request<Barn[]>('/livestock/barns'), request<LivestockBatch[]>('/livestock/batches'),
      request<FeedingRecord[]>('/livestock/feeding'), request<LivestockHealthRecord[]>('/livestock/health'), request<LivestockExitRecord[]>('/livestock/exits'),
    ])
    ;[summary.value, barns.value, batches.value, feeding.value, health.value, exits.value] = data
  })
  const refreshSummary = async () => { summary.value = await request<LivestockSummary>('/livestock/summary') }
  const createBarn = (input: Record<string, unknown>) => run('mutation', async () => { const item = await request<Barn>('/livestock/barns', { method: 'POST', body: JSON.stringify(input) }); barns.value.push(item); await refreshSummary(); return item })
  const updateBarnStatus = (id: string, status: BarnStatus) => run('mutation', async () => { const item = await request<Barn>(`/livestock/barns/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); replace(barns.value, item); return item })
  const createBatch = (input: Record<string, unknown>) => run('mutation', async () => { const item = await request<LivestockBatch>('/livestock/batches', { method: 'POST', body: JSON.stringify(input) }); batches.value.push(item); await refreshSummary(); return item })
  const updateBatchStatus = (id: string, status: LivestockBatchStatus) => run('mutation', async () => { const item = await request<LivestockBatch>(`/livestock/batches/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); replace(batches.value, item); await refreshSummary(); return item })
  const createFeeding = (input: Record<string, unknown>) => run('mutation', async () => { const item = await request<FeedingRecord>('/livestock/feeding', { method: 'POST', body: JSON.stringify(input) }); feeding.value.unshift(item); await refreshSummary(); return item })
  const createHealth = (input: Record<string, unknown>) => run('mutation', async () => { const item = await request<LivestockHealthRecord>('/livestock/health', { method: 'POST', body: JSON.stringify(input) }); health.value.unshift(item); await refreshSummary(); return item })
  const createExit = (input: Record<string, unknown>) => run('mutation', async () => { const item = await request<LivestockExitRecord>('/livestock/exits', { method: 'POST', body: JSON.stringify(input) }); exits.value.unshift(item); await loadAll(); return item })
  function replace<T extends { id: string }>(items: T[], updated: T) { const index = items.findIndex((item) => item.id === updated.id); if (index >= 0) items[index] = updated }
  return { summary, barns, batches, feeding, health, exits, loading, errors, loadAll, createBarn, updateBarnStatus, createBatch, updateBatchStatus, createFeeding, createHealth, createExit }
})
