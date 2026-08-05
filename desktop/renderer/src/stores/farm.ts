import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { request } from '@/api/client'
import type {
  Alert,
  Correction,
  CorrectionStatus,
  CreateCorrectionInput,
  CreateFieldInput,
  CreateInventoryItemInput,
  CreateIssueInput,
  CreatePurchaseInput,
  CreateTaskInput,
  DashboardData,
  Device,
  FarmTask,
  Field,
  FieldIssue,
  InventoryItem,
  InventoryTransaction,
  InventoryTransactionInput,
  IssueStatus,
  PurchaseOrder,
  TaskStatus,
} from '@/types'

export const useFarmStore = defineStore('farm', () => {
  const dashboard = ref<DashboardData>({})
  const fields = ref<Field[]>([])
  const tasks = ref<FarmTask[]>([])
  const devices = ref<Device[]>([])
  const alerts = ref<Alert[]>([])
  const inventory = ref<InventoryItem[]>([])
  const inventoryTransactions = ref<InventoryTransaction[]>([])
  const purchases = ref<PurchaseOrder[]>([])
  const issues = ref<FieldIssue[]>([])
  const corrections = ref<Correction[]>([])
  const loading = reactive<Record<string, boolean>>({})
  const errors = reactive<Record<string, string>>({})

  async function run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    loading[key] = true
    errors[key] = ''
    try {
      return await operation()
    } catch (cause) {
      errors[key] = cause instanceof Error ? cause.message : '加载失败'
      throw cause
    } finally {
      loading[key] = false
    }
  }

  const loadDashboard = () => run('dashboard', async () => { dashboard.value = await request<DashboardData>('/dashboard') })
  const loadFields = () => run('fields', async () => { fields.value = await request<Field[]>('/fields') })
  const loadTasks = () => run('tasks', async () => { tasks.value = await request<FarmTask[]>('/tasks') })
  const loadDevices = () => run('devices', async () => { devices.value = await request<Device[]>('/devices') })
  const loadAlerts = () => run('alerts', async () => { alerts.value = await request<Alert[]>('/alerts') })
  const loadInventory = () => run('inventory', async () => { inventory.value = await request<InventoryItem[]>('/inventory') })
  const loadInventoryTransactions = () => run('inventoryTransactions', async () => { inventoryTransactions.value = await request<InventoryTransaction[]>('/inventory/transactions') })
  const loadPurchases = () => run('purchases', async () => { purchases.value = await request<PurchaseOrder[]>('/purchases') })
  const loadIssues = () => run('issues', async () => { issues.value = await request<FieldIssue[]>('/issues') })
  const loadCorrections = () => run('corrections', async () => { corrections.value = await request<Correction[]>('/corrections') })

  const createField = (input: CreateFieldInput) => run('fieldMutation', async () => {
    const created = await request<Field | undefined>('/fields', { method: 'POST', body: JSON.stringify(input) })
    if (created?.id !== undefined) fields.value.unshift(created)
    else await loadFields()
    return created
  })

  const createTask = (input: CreateTaskInput) => run('taskMutation', async () => {
    const created = await request<FarmTask | undefined>('/tasks', { method: 'POST', body: JSON.stringify(input) })
    if (created?.id !== undefined) tasks.value.unshift(created)
    else await loadTasks()
    return created
  })

  const updateTaskStatus = (id: string | number, status: TaskStatus) => run('taskMutation', async () => {
    const updated = await request<Partial<FarmTask> | undefined>(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
    const index = tasks.value.findIndex((task) => task.id === id)
    if (index >= 0) tasks.value[index] = { ...tasks.value[index], ...(updated || {}), status }
  })

  const acknowledgeAlert = (id: string | number) => run('alertMutation', async () => {
    await request<Alert>(`/alerts/${id}/ack`, { method: 'PATCH' })
    const alert = alerts.value.find((item) => item.id === id)
    if (alert) alert.acknowledged = true
  })

  const createIssue = (input: CreateIssueInput) => run('issueMutation', async () => {
    const created = await request<FieldIssue>('/issues', { method: 'POST', body: JSON.stringify(input) })
    issues.value.unshift(created)
    return created
  })

  const updateIssueStatus = (id: string | number, status: IssueStatus, resolution = '') => run('issueMutation', async () => {
    const updated = await request<FieldIssue>(`/issues/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, resolution }) })
    const index = issues.value.findIndex((issue) => issue.id === id)
    if (index >= 0) issues.value[index] = updated
    return updated
  })

  const createInventoryTransaction = (itemId: string | number, input: InventoryTransactionInput) => run('inventoryMutation', async () => {
    const created = await request<InventoryTransaction>(`/inventory/${itemId}/transactions`, { method: 'POST', body: JSON.stringify(input) })
    inventoryTransactions.value.unshift(created)
    const item = inventory.value.find((candidate) => candidate.id === itemId)
    if (item) {
      item.quantity = created.balanceAfter
      item.updatedAt = created.createdAt
    }
    return created
  })

  const createInventoryItem = (input: CreateInventoryItemInput) => run('inventoryMutation', async () => {
    const created = await request<InventoryItem>('/inventory', { method: 'POST', body: JSON.stringify(input) })
    inventory.value.push(created)
    if (created.quantity > 0) await loadInventoryTransactions().catch(() => undefined)
    return created
  })

  const createPurchase = (input: CreatePurchaseInput) => run('purchaseMutation', async () => {
    const created = await request<PurchaseOrder>('/purchases', { method: 'POST', body: JSON.stringify(input) })
    purchases.value.unshift(created)
    return created
  })

  const receivePurchase = (id: string | number, operator: string) => run('purchaseMutation', async () => {
    const updated = await request<PurchaseOrder>(`/purchases/${id}/receive`, { method: 'PATCH', body: JSON.stringify({ operator }) })
    const index = purchases.value.findIndex((purchase) => purchase.id === id)
    if (index >= 0) purchases.value[index] = updated
    await Promise.allSettled([loadInventory(), loadInventoryTransactions()])
    return updated
  })

  const createCorrection = (input: CreateCorrectionInput) => run('correctionMutation', async () => {
    const created = await request<Correction>('/corrections', { method: 'POST', body: JSON.stringify(input) })
    corrections.value.unshift(created)
    return created
  })

  const updateCorrectionStatus = (id: string | number, status: CorrectionStatus, resolution = '') => run('correctionMutation', async () => {
    const updated = await request<Correction>(`/corrections/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, resolution }) })
    const index = corrections.value.findIndex((correction) => correction.id === id)
    if (index >= 0) corrections.value[index] = updated
    return updated
  })

  function reset() {
    dashboard.value = {}
    fields.value = []
    tasks.value = []
    devices.value = []
    alerts.value = []
    inventory.value = []
    inventoryTransactions.value = []
    purchases.value = []
    issues.value = []
    corrections.value = []
    for (const key of Object.keys(loading)) delete loading[key]
    for (const key of Object.keys(errors)) delete errors[key]
  }

  return {
    dashboard, fields, tasks, devices, alerts, inventory, inventoryTransactions, purchases, issues, corrections, loading, errors,
    loadDashboard, loadFields, loadTasks, loadDevices, loadAlerts, loadInventory, loadInventoryTransactions, loadPurchases, loadIssues, loadCorrections,
    createField, createTask, updateTaskStatus, acknowledgeAlert, createIssue, updateIssueStatus,
    createInventoryItem, createInventoryTransaction, createPurchase, receivePurchase, createCorrection, updateCorrectionStatus, reset,
  }
})
