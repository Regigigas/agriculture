export type LivestockSpecies = 'cattle' | 'pig' | 'sheep' | 'chicken' | 'duck'
export type BarnStatus = 'active' | 'maintenance' | 'empty'
export type LivestockBatchStatus = 'active' | 'quarantine' | 'exited'
export type HealthRecordType = 'vaccination' | 'medication' | 'inspection' | 'disinfection' | 'mortality'

export interface Barn {
  id: string
  farmId: string
  name: string
  code: string
  species: LivestockSpecies
  capacity: number
  manager: string
  location: string
  status: BarnStatus
  temperature: number
  humidity: number
  createdAt: string
  updatedAt: string
}

export interface LivestockBatch {
  id: string
  barnId: string
  code: string
  species: LivestockSpecies
  breed: string
  quantity: number
  averageWeight: number
  entryDate: string
  targetExitDate: string
  manager: string
  status: LivestockBatchStatus
  createdAt: string
  updatedAt: string
}

export interface FeedingRecord {
  id: string
  batchId: string
  feedName: string
  quantityKg: number
  fedAt: string
  operator: string
  notes: string
  createdAt: string
}

export interface LivestockHealthRecord {
  id: string
  batchId: string
  type: HealthRecordType
  title: string
  occurredAt: string
  affectedQuantity: number
  veterinarian: string
  nextDueDate: string | null
  notes: string
  createdAt: string
}

export interface LivestockExitRecord {
  id: string
  batchId: string
  quantity: number
  averageWeight: number
  destination: string
  exitedAt: string
  traceCode: string
  inspector: string
  notes: string
  createdAt: string
}

export interface LivestockSummary {
  barns: number
  activeBatches: number
  currentAnimals: number
  quarantineBatches: number
  feedTodayKg: number
  healthDue: number
  exitedThisMonth: number
}
