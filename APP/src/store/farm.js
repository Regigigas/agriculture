import { defineStore } from 'pinia'
import { getDashboard, getDevices, getFields, getTasks, updateTaskStatus } from '../api/farm'

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
    loading: false,
    updatingTaskId: null
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
    async completeTask(task) {
      this.updatingTaskId = task.id
      try {
        const result = await updateTaskStatus(task.id, 'completed')
        const updated = payloadOf(result)
        const index = this.tasks.findIndex((item) => item.id === task.id)
        if (index !== -1) {
          this.tasks[index] = updated?.id ? updated : { ...this.tasks[index], status: 'completed' }
        }
      } finally {
        this.updatingTaskId = null
      }
    }
  }
})
