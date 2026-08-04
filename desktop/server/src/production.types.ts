export type SubjectType = 'individual' | 'family_farm' | 'cooperative' | 'company';
export type ActiveStatus = 'active' | 'inactive';
export type CropCycleStatus = 'planned' | 'in_progress' | 'harvesting' | 'completed' | 'cancelled';
export type ProductionPlanStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';
export type OperationType = 'tillage' | 'sowing' | 'irrigation' | 'fertilizing' | 'pesticide' | 'scouting' | 'harvest' | 'other';

export interface BusinessSubject {
  id: string;
  name: string;
  type: SubjectType;
  creditCode: string;
  contact: string;
  phone: string;
  address: string;
  status: ActiveStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Farm {
  id: string;
  subjectId: string;
  name: string;
  location: string;
  totalArea: number;
  manager: string;
  status: ActiveStatus;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface CropCycle {
  id: string;
  code: string;
  fieldId: string;
  crop: string;
  variety: string;
  seasonYear: number;
  plannedStart: string;
  plannedHarvest: string;
  actualStart: string | null;
  actualHarvest: string | null;
  targetYield: number;
  budget: number;
  manager: string;
  status: CropCycleStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionPlan {
  id: string;
  cycleId: string;
  fieldId: string;
  title: string;
  operationType: OperationType;
  plannedDate: string;
  assignee: string;
  plannedCost: number;
  plannedMaterial: string;
  status: ProductionPlanStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface OperationLog {
  id: string;
  cycleId: string;
  planId: string | null;
  fieldId: string;
  inventoryItemId: string | null;
  operationType: OperationType;
  occurredAt: string;
  executor: string;
  result: string;
  laborHours: number;
  cost: number;
  materialName: string;
  materialQuantity: number;
  materialUnit: string;
  weather: string;
  notes: string;
  createdAt: string;
}

export interface HarvestBatch {
  id: string;
  batchCode: string;
  traceCode: string;
  cycleId: string;
  fieldId: string;
  product: string;
  grade: string;
  quantity: number;
  unit: string;
  harvestedAt: string;
  warehouse: string;
  qualityStatus: 'pending' | 'passed' | 'rejected';
  inspector: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalesOrder {
  id: string;
  orderNo: string;
  harvestBatchId: string;
  customer: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  soldAt: string;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  deliveryStatus: 'pending' | 'delivered';
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceDocument {
  id: string;
  subjectId: string | null;
  farmId: string | null;
  fieldId: string | null;
  documentType: 'land' | 'inspection' | 'input_invoice' | 'certification' | 'insurance' | 'other';
  name: string;
  documentNo: string;
  issueDate: string | null;
  expiryDate: string | null;
  status: 'valid' | 'expiring' | 'expired';
  custodian: string;
  filePath: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface FarmContract {
  id: string;
  subjectId: string | null;
  farmId: string | null;
  contractType: 'land_lease' | 'purchase' | 'outsource' | 'sales' | 'insurance' | 'other';
  contractNo: string;
  title: string;
  counterparty: string;
  startDate: string;
  endDate: string;
  amount: number;
  status: 'draft' | 'active' | 'expired' | 'terminated';
  reminderDays: number;
  filePath: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface TraceResult {
  batch: HarvestBatch;
  cycle: CropCycle;
  operations: OperationLog[];
  sales: SalesOrder[];
}

export interface OperationsRisk {
  id: string;
  source: 'alert' | 'task' | 'issue' | 'inventory' | 'cycle' | 'quality' | 'contract' | 'document';
  sourceId: string;
  title: string;
  content: string;
  severity: 'warning' | 'critical';
  status: string;
  riskAt: string;
  route: string;
}
