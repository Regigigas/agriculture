import { defineStore } from 'pinia'
import { createPurchase, getDashboard, getDevices, getFields, getInventory, getPurchases, getTasks, receivePurchase, updateTaskStatus } from '../api/farm'

function payloadOf(result) {
  return result?.data ?? result
}

function listOf(result, key) {
  const payload = payloadOf(result)
  if (Array.isArray(payload)) return payload
  return payload?.[key] || payload?.items || []
}

export const useFarmStore = defineStore('farm', {
  state: () => ({
    dashboard: null,
    fields: [],
    tasks: [],
    devices: [],
    inventory: [],
    purchases: [],
    loading: false,
    updatingTaskId: null,
    purchasesLoading: false,
    purchaseSubmitting: false,
    receivingPurchaseId: null,
    purchaseSyncError: ''
  }),
  getters: {
    abnormalDevices: (state) => state.devices.filter((device) =>
      ['offline', 'maintenance', 'warning', 'alarm', 'abnormal', '故障', '离线', '维护'].includes(device.status)
    )
  },
  actions: {
    async loadHome() {
      this.loading = true
      try {
        const [dashboardResult, devicesResult, tasksResult, fieldsResult] = await Promise.all([
          getDashboard(),
          getDevices(),
          getTasks(),
          getFields()
        ])
        this.dashboard = payloadOf(dashboardResult) || {}
        this.devices = listOf(devicesResult, 'devices')
        this.tasks = listOf(tasksResult, 'tasks')
        this.fields = listOf(fieldsResult, 'fields')
      } finally {
        this.loading = false
      }
    },
    async loadTasks() {
      this.loading = true
      try {
        this.tasks = listOf(await getTasks(), 'tasks')
      } finally {
        this.loading = false
      }
    },
    async loadFields() {
      this.loading = true
      try {
        this.fields = listOf(await getFields(), 'fields')
      } finally {
        this.loading = false
      }
    },
    async loadPurchases() {
      this.purchasesLoading = true
      this.purchaseSyncError = ''
      try {
        const [purchaseResult, inventoryResult] = await Promise.all([getPurchases(), getInventory()])
        this.purchases = listOf(purchaseResult, 'purchases')
        this.inventory = listOf(inventoryResult, 'inventory')
      } finally {
        this.purchasesLoading = false
      }
    },
    async createPurchase(input) {
      this.purchaseSubmitting = true
      try {
        const created = payloadOf(await createPurchase(input))
        if (created?.id) this.purchases.unshift(created)
        else await this.loadPurchases()
        return created
      } finally {
        this.purchaseSubmitting = false
      }
    },
    async receivePurchase(order, operator) {
      this.receivingPurchaseId = order.id
      this.purchaseSyncError = ''
      try {
        const updated = payloadOf(await receivePurchase(order.id, operator))
        const index = this.purchases.findIndex((item) => item.id === order.id)
        if (index !== -1 && updated?.id) this.purchases[index] = updated
        try {
          this.inventory = listOf(await getInventory(), 'inventory')
        } catch {
          this.purchaseSyncError = '到货已确认，但库存刷新失败，请下拉刷新'
        }
        return updated
      } finally {
        this.receivingPurchaseId = null
      }
    },
    async updateTask(task, status) {
      this.updatingTaskId = task.id
      try {
        const result = await updateTaskStatus(task.id, status)
        const updated = payloadOf(result)
        const index = this.tasks.findIndex((item) => item.id === task.id)
        if (index !== -1) {
          this.tasks[index] = updated?.id ? updated : { ...this.tasks[index], status }
        }
      } finally {
        this.updatingTaskId = null
      }
    }
  }
})
