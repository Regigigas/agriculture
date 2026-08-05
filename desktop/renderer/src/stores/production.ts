import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { request } from '@/api/client'
import type {
  ActiveStatus,
  BusinessSubject,
  ComplianceDocument,
  CropCycle,
  CropCycleStatus,
  Farm,
  FarmContract,
  HarvestBatch,
  OperationLog,
  ProductionPlan,
  ProductionPlanStatus,
  SalesOrder,
  TraceResult,
} from '@/types'

export const useProductionStore = defineStore('production', () => {
  const subjects = ref<BusinessSubject[]>([])
  const farms = ref<Farm[]>([])
  const cycles = ref<CropCycle[]>([])
  const plans = ref<ProductionPlan[]>([])
  const logs = ref<OperationLog[]>([])
  const harvests = ref<HarvestBatch[]>([])
  const sales = ref<SalesOrder[]>([])
  const documents = ref<ComplianceDocument[]>([])
  const contracts = ref<FarmContract[]>([])
  const traceResult = ref<TraceResult | null>(null)
  const loading = reactive<Record<string, boolean>>({})
  const errors = reactive<Record<string, string>>({})

  async function run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    loading[key] = true
    errors[key] = ''
    try { return await operation() }
    catch (cause) { errors[key] = cause instanceof Error ? cause.message : '操作失败'; throw cause }
    finally { loading[key] = false }
  }

  const loadSubjects = () => run('subjects', async () => { subjects.value = await request<BusinessSubject[]>('/subjects') })
  const loadFarms = () => run('farms', async () => { farms.value = await request<Farm[]>('/farms') })
  const loadCycles = () => run('cycles', async () => { cycles.value = await request<CropCycle[]>('/crop-cycles') })
  const loadPlans = () => run('plans', async () => { plans.value = await request<ProductionPlan[]>('/production-plans') })
  const loadLogs = () => run('logs', async () => { logs.value = await request<OperationLog[]>('/operation-logs') })
  const loadHarvests = () => run('harvests', async () => { harvests.value = await request<HarvestBatch[]>('/harvest-batches') })
  const loadSales = () => run('sales', async () => { sales.value = await request<SalesOrder[]>('/sales-orders') })
  const loadDocuments = () => run('documents', async () => { documents.value = await request<ComplianceDocument[]>('/compliance-documents') })
  const loadContracts = () => run('contracts', async () => { contracts.value = await request<FarmContract[]>('/farm-contracts') })

  const loadOrganization = () => Promise.all([loadSubjects(), loadFarms()])
  const loadProduction = () => Promise.all([loadCycles(), loadPlans(), loadLogs()])
  const loadTraceability = () => Promise.all([loadHarvests(), loadSales(), loadCycles()])
  const loadCompliance = () => Promise.all([loadDocuments(), loadContracts(), loadSubjects(), loadFarms()])

  const createSubject = (input: Record<string, unknown>) => run('subjectMutation', async () => {
    const created = await request<BusinessSubject>('/subjects', { method: 'POST', body: JSON.stringify(input) })
    subjects.value.push(created); return created
  })
  const updateSubjectStatus = (id: string, status: ActiveStatus) => run('subjectMutation', async () => {
    const updated = await request<BusinessSubject>(`/subjects/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
    replace(subjects.value, updated); return updated
  })
  const createFarm = (input: Record<string, unknown>) => run('farmMutation', async () => {
    const created = await request<Farm>('/farms', { method: 'POST', body: JSON.stringify(input) })
    farms.value.push(created); return created
  })
  const updateFarmStatus = (id: string, status: ActiveStatus) => run('farmMutation', async () => {
    const updated = await request<Farm>(`/farms/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
    replace(farms.value, updated); return updated
  })
  const createCycle = (input: Record<string, unknown>) => run('cycleMutation', async () => {
    const created = await request<CropCycle>('/crop-cycles', { method: 'POST', body: JSON.stringify(input) })
    cycles.value.unshift(created); return created
  })
  const updateCycleStatus = (id: string, status: CropCycleStatus) => run('cycleMutation', async () => {
    const updated = await request<CropCycle>(`/crop-cycles/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
    replace(cycles.value, updated)
    if (status === 'cancelled') plans.value.filter((item) => item.cycleId === id && ['planned', 'in_progress'].includes(item.status)).forEach((item) => { item.status = 'cancelled' })
    return updated
  })
  const createPlan = (input: Record<string, unknown>) => run('planMutation', async () => {
    const created = await request<ProductionPlan>('/production-plans', { method: 'POST', body: JSON.stringify(input) })
    plans.value.push(created); return created
  })
  const updatePlanStatus = (id: string, status: ProductionPlanStatus) => run('planMutation', async () => {
    const updated = await request<ProductionPlan>(`/production-plans/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
    replace(plans.value, updated); return updated
  })
  const createLog = (input: Record<string, unknown>) => run('logMutation', async () => {
    const created = await request<OperationLog>('/operation-logs', { method: 'POST', body: JSON.stringify(input) })
    logs.value.unshift(created)
    if (created.planId) { const plan = plans.value.find((item) => item.id === created.planId); if (plan) plan.status = 'completed' }
    return created
  })
  const createHarvest = (input: Record<string, unknown>) => run('harvestMutation', async () => {
    const created = await request<HarvestBatch>('/harvest-batches', { method: 'POST', body: JSON.stringify(input) })
    harvests.value.unshift(created)
    const cycle = cycles.value.find((item) => item.id === created.cycleId)
    if (cycle?.status === 'in_progress') cycle.status = 'harvesting'
    return created
  })
  const updateHarvestQuality = (id: string, qualityStatus: 'passed' | 'rejected', inspector: string, notes: string) => run('harvestMutation', async () => {
    const updated = await request<HarvestBatch>(`/harvest-batches/${id}/quality`, { method: 'PATCH', body: JSON.stringify({ qualityStatus, inspector, notes }) })
    replace(harvests.value, updated); return updated
  })
  const createSale = (input: Record<string, unknown>) => run('saleMutation', async () => {
    const created = await request<SalesOrder>('/sales-orders', { method: 'POST', body: JSON.stringify(input) })
    sales.value.unshift(created); return created
  })
  const updateSaleStatus = (id: string, input: Partial<Pick<SalesOrder, 'paymentStatus' | 'deliveryStatus'>>) => run('saleMutation', async () => {
    const updated = await request<SalesOrder>(`/sales-orders/${id}/status`, { method: 'PATCH', body: JSON.stringify(input) })
    replace(sales.value, updated); return updated
  })
  const queryTrace = (code: string) => {
    traceResult.value = null
    return run('trace', async () => { traceResult.value = await request<TraceResult>(`/trace/${encodeURIComponent(code)}`); return traceResult.value })
  }
  const createDocument = (input: Record<string, unknown>) => run('documentMutation', async () => {
    const created = await request<ComplianceDocument>('/compliance-documents', { method: 'POST', body: JSON.stringify(input) })
    documents.value.push(created); return created
  })
  const createContract = (input: Record<string, unknown>) => run('contractMutation', async () => {
    const created = await request<FarmContract>('/farm-contracts', { method: 'POST', body: JSON.stringify(input) })
    contracts.value.push(created); return created
  })
  const updateContractStatus = (id: string, status: FarmContract['status']) => run('contractMutation', async () => {
    const updated = await request<FarmContract>(`/farm-contracts/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
    replace(contracts.value, updated); return updated
  })

  function replace<T extends { id: string }>(list: T[], updated: T) {
    const index = list.findIndex((item) => item.id === updated.id)
    if (index >= 0) list[index] = updated
  }

  function reset() {
    subjects.value = []
    farms.value = []
    cycles.value = []
    plans.value = []
    logs.value = []
    harvests.value = []
    sales.value = []
    documents.value = []
    contracts.value = []
    traceResult.value = null
    for (const key of Object.keys(loading)) delete loading[key]
    for (const key of Object.keys(errors)) delete errors[key]
  }

  return {
    subjects, farms, cycles, plans, logs, harvests, sales, documents, contracts, traceResult, loading, errors,
    loadSubjects, loadFarms, loadCycles, loadPlans, loadLogs, loadHarvests, loadSales, loadDocuments, loadContracts,
    loadOrganization, loadProduction, loadTraceability, loadCompliance,
    createSubject, updateSubjectStatus, createFarm, updateFarmStatus,
    createCycle, updateCycleStatus, createPlan, updatePlanStatus, createLog,
    createHarvest, updateHarvestQuality, createSale, updateSaleStatus, queryTrace,
    createDocument, createContract, updateContractStatus, reset,
  }
})
