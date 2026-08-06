export type FieldStatus = 'healthy' | 'attention' | 'fallow';
export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high';
export type IssueStatus = 'open' | 'in_progress' | 'review' | 'closed';
export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IssueCategory = 'pest' | 'disease' | 'irrigation' | 'equipment' | 'quality' | 'other';
export type InventoryTransactionType = 'opening' | 'purchase' | 'usage' | 'return' | 'adjustment';
export type CorrectionStatus = 'open' | 'processing' | 'resolved';
export type CorrectionCategory = 'data' | 'system' | 'workflow' | 'suggestion';
export type PurchaseStatus = 'pending' | 'received';

export interface User {
  id: string;
  username: string;
  name: string;
  role: string;
}

export interface Field {
  id: string;
  farmId: string;
  name: string;
  crop: string;
  area: number;
  location: string;
  status: FieldStatus;
  plantedAt: string;
  expectedHarvestAt: string;
  soilMoisture: number;
  manager: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  fieldId: string;
  assignee: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  description: string;
  createdAt: string;
  completedAt: string | null;
}

export interface Telemetry {
  temperature: number;
  humidity: number;
  soilMoisture: number;
  light: number;
  recordedAt: string;
}

export interface Device {
  id: string;
  name: string;
  type: string;
  fieldId: string;
  status: 'online' | 'offline' | 'maintenance';
  battery: number;
  lastSeenAt: string;
  telemetry: Telemetry;
}

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  source: string;
  fieldId: string | null;
  createdAt: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  minimumStock: number;
  location: string;
  updatedAt: string;
}

export interface InventoryTransaction {
  id: string;
  itemId: string;
  type: InventoryTransactionType;
  change: number;
  balanceAfter: number;
  fieldId: string | null;
  operator: string;
  reference: string;
  notes: string;
  createdAt: string;
}

export interface PurchaseOrder {
  id: string;
  orderNo: string;
  inventoryItemId: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  supplier: string;
  expectedAt: string;
  buyer: string;
  notes: string;
  status: PurchaseStatus;
  createdAt: string;
  updatedAt: string;
  receivedAt: string | null;
}

export interface FieldIssue {
  id: string;
  title: string;
  fieldId: string;
  category: IssueCategory;
  severity: IssueSeverity;
  status: IssueStatus;
  description: string;
  reporter: string;
  assignee: string;
  observedAt: string;
  reviewDueDate: string | null;
  resolution: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface Correction {
  id: string;
  code: string;
  category: CorrectionCategory;
  priority: TaskPriority;
  title: string;
  description: string;
  expectedValue: string;
  route: string;
  entityType: string;
  entityId: string;
  errorCode: string;
  createdBy: string;
  status: CorrectionStatus;
  resolution: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface Activity {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}
