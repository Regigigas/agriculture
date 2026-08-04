export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface User {
  id?: string | number
  username: string
  name?: string
  role?: string
}

export interface LoginResponse {
  token: string
  user?: User
}

export interface Field {
  id: string | number
  name: string
  crop: string
  area: number
  location: string
  status: 'healthy' | 'attention' | 'fallow'
  manager: string
  plantedAt: string
  expectedHarvestAt: string
  soilMoisture: number
  createdAt: string
}

export interface FarmTask {
  id: string | number
  title: string
  fieldId: string | number
  assignee: string
  dueDate: string
  status: TaskStatus
  priority: TaskPriority
  description?: string
}

export interface Device {
  id: string | number
  name: string
  type: string
  fieldId: string | number
  status: 'online' | 'offline' | 'maintenance'
  battery: number
  lastSeenAt: string
  telemetry: {
    temperature: number
    humidity: number
    soilMoisture: number
    light: number
    recordedAt: string
  }
}

export interface Alert {
  id: string | number
  title: string
  message: string
  severity: 'info' | 'warning' | 'critical'
  acknowledged: boolean
  source: string
  fieldId: string | number | null
  createdAt: string
  acknowledgedAt: string | null
}

export interface InventoryItem {
  id: string | number
  name: string
  category: string
  quantity: number
  unit: string
  minimumStock: number
  location: string
  updatedAt: string
}

export interface DashboardData {
  metrics?: {
    totalFields: number
    totalArea: number
    pendingTasks: number
    onlineDevices: number
    activeAlerts: number
  }
  environment?: Device['telemetry'] | null
  cropDistribution?: Array<{ crop: string; area: number }>
  taskTrend?: Array<{ date: string; completed: number; created: number }>
  recentActivities?: Array<{ id: string | number; message: string; timestamp: string; type: string }>
}

export interface CreateFieldInput {
  name: string
  crop: string
  area: number
  location: string
  manager: string
  status: Field['status']
  plantedAt: string
  expectedHarvestAt: string
  soilMoisture: number
}

export interface CreateTaskInput {
  title: string
  fieldId: string | number
  assignee: string
  dueDate: string
  priority: TaskPriority
  description?: string
}
