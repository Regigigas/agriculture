import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { request } from '@/api/client'
import type { Alert, CreateFieldInput, CreateTaskInput, DashboardData, Device, FarmTask, Field, InventoryItem, TaskStatus } from '@/types'

export const useFarmStore = defineStore('farm', () => {
  const dashboard = ref<DashboardData>({})
  const fields = ref<Field[]>([])
  const tasks = ref<FarmTask[]>([])
  const devices = ref<Device[]>([])
  const alerts = ref<Alert[]>([])
  const inventory = ref<InventoryItem[]>([])
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

  return {
    dashboard, fields, tasks, devices, alerts, inventory, loading, errors,
    loadDashboard, loadFields, loadTasks, loadDevices, loadAlerts, loadInventory,
    createField, createTask, updateTaskStatus, acknowledgeAlert,
  }
})
