export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export type TaskPriority = 'low' | 'medium' | 'high'
export type IssueStatus = 'open' | 'in_progress' | 'review' | 'closed'
export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical'
export type IssueCategory = 'pest' | 'disease' | 'irrigation' | 'equipment' | 'quality' | 'other'
export type InventoryTransactionType = 'opening' | 'purchase' | 'usage' | 'return' | 'adjustment'
export type CorrectionStatus = 'open' | 'processing' | 'resolved'
export type CorrectionCategory = 'data' | 'system' | 'workflow' | 'suggestion'
export type PurchaseStatus = 'pending' | 'received'
export type UserRole = 'admin' | 'worker'
export type ChatConversationType = 'private' | 'group'
export type ChatDeliveryStatus = 'sending' | 'sent' | 'failed'

export interface User {
  id?: string | number
  username: string
  name?: string
  role?: UserRole
}

export interface LoginResponse {
  token: string
  user?: User
}

export interface CreateUserInput {
  name: string
  username: string
  password: string
  role: UserRole
}

export interface ChatMessage {
  id: string | number
  conversationId: string | number
  senderId: string | number
  clientMessageId: string
  sender?: User
  body: string
  createdAt: string
  clientStatus?: ChatDeliveryStatus
}

export interface ChatConversation {
  id: string | number
  type: ChatConversationType
  title?: string | null
  members: User[]
  lastMessage?: ChatMessage | null
  unreadCount: number
  createdAt?: string
  updatedAt: string
}

export interface CreateGroupConversationInput {
  title: string
  memberIds: Array<string | number>
}

export interface OperationAuthorization {
  token: string
  operation: string
  expiresAt: string
}

export interface Field {
  id: string | number
  farmId: string | number
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

export interface InventoryTransaction {
  id: string | number
  itemId: string | number
  type: InventoryTransactionType
  change: number
  balanceAfter: number
  fieldId: string | number | null
  operator: string
  reference: string
  notes: string
  createdAt: string
}

export interface PurchaseOrder {
  id: string | number
  orderNo: string
  inventoryItemId: string | number
  itemName: string
  quantity: number
  unit: string
  unitPrice: number
  amount: number
  supplier: string
  expectedAt: string
  buyer: string
  notes: string
  status: PurchaseStatus
  createdAt: string
  updatedAt: string
  receivedAt: string | null
}

export interface FieldIssue {
  id: string | number
  title: string
  fieldId: string | number
  category: IssueCategory
  severity: IssueSeverity
  status: IssueStatus
  description: string
  reporter: string
  assignee: string
  observedAt: string
  reviewDueDate: string | null
  resolution: string
  createdAt: string
  updatedAt: string
  closedAt: string | null
}

export interface Correction {
  id: string | number
  code: string
  category: CorrectionCategory
  priority: TaskPriority
  title: string
  description: string
  expectedValue: string
  route: string
  entityType: string
  entityId: string
  errorCode: string
  createdBy: string
  status: CorrectionStatus
  resolution: string
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
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
  farmId: string | number
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

export interface CreateIssueInput {
  title: string
  fieldId: string | number
  category: IssueCategory
  severity: IssueSeverity
  description: string
  reporter: string
  assignee: string
  observedAt: string
  reviewDueDate?: string
}

export interface InventoryTransactionInput {
  type: Exclude<InventoryTransactionType, 'opening'>
  quantity: number
  fieldId?: string | number | null
  operator: string
  reference?: string
  notes?: string
}

export interface CreateInventoryItemInput {
  name: string
  category: string
  unit: string
  initialQuantity: number
  minimumStock: number
  location: string
  operator: string
}

export interface CreatePurchaseInput {
  inventoryItemId: string | number
  quantity: number
  unitPrice: number
  supplier: string
  expectedAt: string
  buyer: string
  notes?: string
}

export interface CreateCorrectionInput {
  category: CorrectionCategory
  priority: TaskPriority
  title: string
  description: string
  expectedValue?: string
  route?: string
  entityType?: string
  entityId?: string
  errorCode?: string
  createdBy: string
}

export type SubjectType = 'individual' | 'family_farm' | 'cooperative' | 'company'
export type ActiveStatus = 'active' | 'inactive'
export type CropCycleStatus = 'planned' | 'in_progress' | 'harvesting' | 'completed' | 'cancelled'
export type ProductionPlanStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled'
export type OperationType = 'tillage' | 'sowing' | 'irrigation' | 'fertilizing' | 'pesticide' | 'scouting' | 'harvest' | 'other'

export interface BusinessSubject {
  id: string
  name: string
  type: SubjectType
  creditCode: string
  contact: string
  phone: string
  address: string
  status: ActiveStatus
  notes: string
  createdAt: string
  updatedAt: string
}

export interface Farm {
  id: string
  subjectId: string
  name: string
  location: string
  totalArea: number
  manager: string
  status: ActiveStatus
  description: string
  createdAt: string
  updatedAt: string
}

export interface CropCycle {
  id: string
  code: string
  fieldId: string
  crop: string
  variety: string
  seasonYear: number
  plannedStart: string
  plannedHarvest: string
  actualStart: string | null
  actualHarvest: string | null
  targetYield: number
  budget: number
  manager: string
  status: CropCycleStatus
  notes: string
  createdAt: string
  updatedAt: string
}

export interface ProductionPlan {
  id: string
  cycleId: string
  fieldId: string
  title: string
  operationType: OperationType
  plannedDate: string
  assignee: string
  plannedCost: number
  plannedMaterial: string
  status: ProductionPlanStatus
  notes: string
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface OperationLog {
  id: string
  cycleId: string
  planId: string | null
  fieldId: string
  inventoryItemId: string | null
  operationType: OperationType
  occurredAt: string
  executor: string
  result: string
  laborHours: number
  cost: number
  materialName: string
  materialQuantity: number
  materialUnit: string
  weather: string
  notes: string
  createdAt: string
}

export interface HarvestBatch {
  id: string
  batchCode: string
  traceCode: string
  cycleId: string
  fieldId: string
  product: string
  grade: string
  quantity: number
  unit: string
  harvestedAt: string
  warehouse: string
  qualityStatus: 'pending' | 'passed' | 'rejected'
  inspector: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface SalesOrder {
  id: string
  orderNo: string
  harvestBatchId: string
  customer: string
  quantity: number
  unit: string
  unitPrice: number
  amount: number
  soldAt: string
  paymentStatus: 'unpaid' | 'partial' | 'paid'
  deliveryStatus: 'pending' | 'delivered'
  notes: string
  createdAt: string
  updatedAt: string
}

export interface ComplianceDocument {
  id: string
  subjectId: string | null
  farmId: string | null
  fieldId: string | null
  documentType: 'land' | 'inspection' | 'input_invoice' | 'certification' | 'insurance' | 'other'
  name: string
  documentNo: string
  issueDate: string | null
  expiryDate: string | null
  status: 'valid' | 'expiring' | 'expired'
  custodian: string
  filePath: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface FarmContract {
  id: string
  subjectId: string | null
  farmId: string | null
  contractType: 'land_lease' | 'purchase' | 'outsource' | 'sales' | 'insurance' | 'other'
  contractNo: string
  title: string
  counterparty: string
  startDate: string
  endDate: string
  amount: number
  status: 'draft' | 'active' | 'expired' | 'terminated'
  reminderDays: number
  filePath: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface TraceResult {
  batch: HarvestBatch
  cycle: CropCycle
  operations: OperationLog[]
  sales: SalesOrder[]
}

export interface OperationsRisk {
  id: string
  source: 'alert' | 'task' | 'issue' | 'inventory' | 'cycle' | 'quality' | 'contract' | 'document'
  sourceId: string
  title: string
  content: string
  severity: 'warning' | 'critical'
  status: string
  riskAt: string
  route: string
}

export interface AuditLog {
  id: string
  domain: string
  recordId: string
  action: string
  detail: string
  actor: string
  createdAt: string
}

export interface OperationsSummary {
  activeSubjects: number
  activeFarms: number
  activeCycles: number
  pendingPlans: number
  plannedBudget: number
  actualCost: number
  harvestQuantity: number
  salesRevenue: number
  receivables: number
  criticalRisks: number
  openRisks: number
}

export interface BackupInfo {
  name: string
  path: string
  size: number
  createdAt: string
}

export interface LocalSyncResult {
  sourceName: string
  inserted: number
  updated: number
  skipped: number
  telemetryImported: number
  auditImported: number
  safetyBackup: BackupInfo
  synchronizedAt: string
}

export interface IntegrityResult {
  ok: boolean
  messages: string[]
  checkedAt: string
}

export type LivestockSpecies = 'cattle' | 'pig' | 'sheep' | 'chicken' | 'duck'
export type BarnStatus = 'active' | 'maintenance' | 'empty'
export type LivestockBatchStatus = 'active' | 'quarantine' | 'exited'
export type HealthRecordType = 'vaccination' | 'medication' | 'inspection' | 'disinfection' | 'mortality'

export interface Barn { id: string; farmId: string; name: string; code: string; species: LivestockSpecies; capacity: number; manager: string; location: string; status: BarnStatus; temperature: number; humidity: number; createdAt: string; updatedAt: string }
export interface LivestockBatch { id: string; barnId: string; code: string; species: LivestockSpecies; breed: string; quantity: number; averageWeight: number; entryDate: string; targetExitDate: string; manager: string; status: LivestockBatchStatus; createdAt: string; updatedAt: string }
export interface FeedingRecord { id: string; batchId: string; feedName: string; quantityKg: number; fedAt: string; operator: string; notes: string; createdAt: string }
export interface LivestockHealthRecord { id: string; batchId: string; type: HealthRecordType; title: string; occurredAt: string; affectedQuantity: number; veterinarian: string; nextDueDate: string | null; notes: string; createdAt: string }
export interface LivestockExitRecord { id: string; batchId: string; quantity: number; averageWeight: number; destination: string; exitedAt: string; traceCode: string; inspector: string; notes: string; createdAt: string }
export interface LivestockSummary { barns: number; activeBatches: number; currentAnimals: number; quarantineBatches: number; feedTodayKg: number; healthDue: number; exitedThisMonth: number }
