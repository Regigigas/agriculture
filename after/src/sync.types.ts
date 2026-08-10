export const SYNC_COLLECTIONS = [
  'fields',
  'tasks',
  'devices',
  'alerts',
  'inventory',
  'inventory_transactions',
  'purchases',
  'issues',
  'corrections',
  'business_subjects',
  'farms',
  'crop_cycles',
  'production_plans',
  'operation_logs',
  'harvest_batches',
  'sales_orders',
  'invoices',
  'compliance_documents',
  'farm_contracts',
] as const;

export type SyncCollection = typeof SYNC_COLLECTIONS[number];

export interface SyncEvent {
  eventId: string;
  collection: SyncCollection;
  entityId: string;
  payload: Record<string, unknown>;
  baseRevision: number;
  occurredAt: string;
}

export interface SyncResult {
  eventId: string;
  status: 'accepted' | 'duplicate' | 'conflict';
  revision: number;
  payload: Record<string, unknown>;
}

export interface SyncChange {
  cursor: number;
  collection: SyncCollection;
  entityId: string;
  revision: number;
  payload: Record<string, unknown>;
  sourceClientId: string;
  changedAt: string;
}

export interface SyncExchangeResponse {
  serverId: string;
  schemaVersion: 1;
  results: SyncResult[];
  changes: SyncChange[];
  nextCursor: number;
  hasMore: boolean;
  serverTime: string;
}
