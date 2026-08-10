import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { assertIntegerCents, multiplyCents } from './money';
import {
  Activity,
  Alert,
  Correction,
  CorrectionCategory,
  CorrectionStatus,
  Device,
  Field,
  FieldIssue,
  FieldStatus,
  InventoryItem,
  InventoryTransaction,
  InventoryTransactionType,
  PurchaseOrder,
  IssueCategory,
  IssueSeverity,
  IssueStatus,
  Task,
  TaskPriority,
  TaskStatus,
  Telemetry,
} from './types';
import { LocalDatabase } from './local-database';

const iso = (value: string): string => new Date(value).toISOString();

@Injectable()
export class AgricultureService {
  private fields: Field[] = [
    { id: 'field-001', farmId: 'farm-001', name: '北区一号田', crop: '冬小麦', area: 42.6, location: '北纬 35.21, 东经 113.84', status: 'healthy', plantedAt: '2025-10-16', expectedHarvestAt: '2026-06-08', soilMoisture: 63, manager: '李明', createdAt: iso('2025-09-01') },
    { id: 'field-002', farmId: 'farm-002', name: '河畔温室 A', crop: '番茄', area: 8.4, location: '园区东南温室群', status: 'attention', plantedAt: '2026-01-12', expectedHarvestAt: '2026-05-20', soilMoisture: 38, manager: '王芳', createdAt: iso('2025-12-20') },
    { id: 'field-003', farmId: 'farm-001', name: '南坡试验田', crop: '玉米', area: 31.2, location: '南坡缓冲带', status: 'healthy', plantedAt: '2026-04-18', expectedHarvestAt: '2026-09-25', soilMoisture: 57, manager: '赵强', createdAt: iso('2026-03-15') },
    { id: 'field-004', farmId: 'farm-001', name: '西区轮作田', crop: '大豆', area: 24.8, location: '西区灌溉渠北侧', status: 'fallow', plantedAt: '2025-05-02', expectedHarvestAt: '2025-10-11', soilMoisture: 46, manager: '陈静', createdAt: iso('2025-03-28') },
  ];

  private tasks: Task[] = [
    { id: 'task-001', title: '检查滴灌主管压力', fieldId: 'field-002', assignee: '王芳', dueDate: '2026-08-04', priority: 'high', status: 'in_progress', description: '排查温室东侧末端压力偏低问题', createdAt: iso('2026-08-02T08:10:00+08:00'), completedAt: null },
    { id: 'task-002', title: '小麦收获后土壤取样', fieldId: 'field-001', assignee: '李明', dueDate: '2026-08-05', priority: 'medium', status: 'pending', description: '按五点法采集并送实验室检测', createdAt: iso('2026-08-01T10:30:00+08:00'), completedAt: null },
    { id: 'task-003', title: '校准气象站传感器', fieldId: 'field-003', assignee: '赵强', dueDate: '2026-08-03', priority: 'high', status: 'completed', description: '校准温湿度和光照传感器', createdAt: iso('2026-07-30T09:00:00+08:00'), completedAt: iso('2026-08-03T16:20:00+08:00') },
    { id: 'task-004', title: '盘点水溶肥库存', fieldId: 'field-002', assignee: '陈静', dueDate: '2026-08-07', priority: 'low', status: 'pending', description: '核对仓库实物与领用记录', createdAt: iso('2026-08-03T14:15:00+08:00'), completedAt: null },
  ];

  private devices: Device[] = [
    { id: 'DEV-001', name: '北田综合墒情站', type: 'soil_station', fieldId: 'field-001', status: 'online', battery: 86, lastSeenAt: iso('2026-08-04T09:25:00+08:00'), telemetry: { temperature: 27.4, humidity: 61, soilMoisture: 63, light: 72800, recordedAt: iso('2026-08-04T09:25:00+08:00') } },
    { id: 'DEV-002', name: '温室 A 环境终端', type: 'greenhouse_terminal', fieldId: 'field-002', status: 'online', battery: 100, lastSeenAt: iso('2026-08-04T09:26:00+08:00'), telemetry: { temperature: 31.8, humidity: 74, soilMoisture: 38, light: 43600, recordedAt: iso('2026-08-04T09:26:00+08:00') } },
    { id: 'DEV-003', name: '南坡微型气象站', type: 'weather_station', fieldId: 'field-003', status: 'online', battery: 72, lastSeenAt: iso('2026-08-04T09:24:00+08:00'), telemetry: { temperature: 29.1, humidity: 56, soilMoisture: 57, light: 81500, recordedAt: iso('2026-08-04T09:24:00+08:00') } },
    { id: 'DEV-004', name: '西区灌溉阀控器', type: 'irrigation_controller', fieldId: 'field-004', status: 'maintenance', battery: 19, lastSeenAt: iso('2026-08-03T18:10:00+08:00'), telemetry: { temperature: 26.3, humidity: 59, soilMoisture: 46, light: 0, recordedAt: iso('2026-08-03T18:10:00+08:00') } },
  ];

  private alerts: Alert[] = [
    { id: 'alert-001', title: '土壤含水率偏低', message: '河畔温室 A 当前土壤含水率为 38%，低于设定阈值 42%。', severity: 'critical', source: 'DEV-002', fieldId: 'field-002', createdAt: iso('2026-08-04T08:55:00+08:00'), acknowledged: false, acknowledgedAt: null },
    { id: 'alert-002', title: '设备电量不足', message: '西区灌溉阀控器剩余电量 19%，建议维护时更换电池。', severity: 'warning', source: 'DEV-004', fieldId: 'field-004', createdAt: iso('2026-08-03T18:12:00+08:00'), acknowledged: false, acknowledgedAt: null },
    { id: 'alert-003', title: '传感器校准完成', message: '南坡微型气象站已完成计划校准并恢复采集。', severity: 'info', source: 'DEV-003', fieldId: 'field-003', createdAt: iso('2026-08-03T16:25:00+08:00'), acknowledged: true, acknowledgedAt: iso('2026-08-03T16:40:00+08:00') },
  ];

  private inventory: InventoryItem[] = [
    { id: 'inventory-001', name: '高氮复合肥', category: '肥料', quantity: 1260, unit: 'kg', minimumStock: 500, location: '农资库 A-01', updatedAt: iso('2026-08-03T11:00:00+08:00') },
    { id: 'inventory-002', name: '番茄专用水溶肥', category: '肥料', quantity: 180, unit: 'kg', minimumStock: 200, location: '温室物资间', updatedAt: iso('2026-08-02T15:30:00+08:00') },
    { id: 'inventory-003', name: '滴灌带', category: '灌溉耗材', quantity: 48, unit: '卷', minimumStock: 20, location: '农资库 B-06', updatedAt: iso('2026-07-28T09:40:00+08:00') },
    { id: 'inventory-004', name: '黄色粘虫板', category: '植保物资', quantity: 320, unit: '张', minimumStock: 100, location: '植保库 C-02', updatedAt: iso('2026-08-01T13:20:00+08:00') },
    { id: 'inventory-005', name: '土壤采样袋', category: '检测耗材', quantity: 65, unit: '个', minimumStock: 50, location: '实验室储物柜', updatedAt: iso('2026-08-03T17:10:00+08:00') },
  ];

  private inventoryTransactions: InventoryTransaction[] = [
    { id: 'stock-opening-001', itemId: 'inventory-001', type: 'opening', change: 1260, balanceAfter: 1260, fieldId: null, operator: '系统', reference: '期初库存', notes: '桌面系统启用时的库存余额', createdAt: iso('2026-08-03T11:00:00+08:00') },
    { id: 'stock-opening-002', itemId: 'inventory-002', type: 'opening', change: 180, balanceAfter: 180, fieldId: null, operator: '系统', reference: '期初库存', notes: '桌面系统启用时的库存余额', createdAt: iso('2026-08-02T15:30:00+08:00') },
    { id: 'stock-opening-003', itemId: 'inventory-003', type: 'opening', change: 48, balanceAfter: 48, fieldId: null, operator: '系统', reference: '期初库存', notes: '桌面系统启用时的库存余额', createdAt: iso('2026-07-28T09:40:00+08:00') },
    { id: 'stock-opening-004', itemId: 'inventory-004', type: 'opening', change: 320, balanceAfter: 320, fieldId: null, operator: '系统', reference: '期初库存', notes: '桌面系统启用时的库存余额', createdAt: iso('2026-08-01T13:20:00+08:00') },
    { id: 'stock-opening-005', itemId: 'inventory-005', type: 'opening', change: 65, balanceAfter: 65, fieldId: null, operator: '系统', reference: '期初库存', notes: '桌面系统启用时的库存余额', createdAt: iso('2026-08-03T17:10:00+08:00') },
  ];

  private purchases: PurchaseOrder[] = [
    { id: 'purchase-001', orderNo: 'PO-2026-0001', inventoryItemId: 'inventory-002', itemName: '番茄专用水溶肥', quantity: 120, unit: 'kg', unitPrice: 6.8, amount: 816, supplier: '绿禾农资有限公司', expectedAt: '2026-08-07', buyer: '陈静', notes: '温室膨果期补货', status: 'pending', createdAt: iso('2026-08-03T14:30:00+08:00'), updatedAt: iso('2026-08-03T14:30:00+08:00'), receivedAt: null },
  ];

  private issues: FieldIssue[] = [
    { id: 'issue-001', title: '温室东侧滴灌压力偏低', fieldId: 'field-002', category: 'irrigation', severity: 'high', status: 'in_progress', description: '末端滴头出水不均，需检查主管过滤器与分区阀门。', reporter: '王芳', assignee: '王芳', observedAt: '2026-08-04', reviewDueDate: '2026-08-06', resolution: '', createdAt: iso('2026-08-04T08:40:00+08:00'), updatedAt: iso('2026-08-04T09:10:00+08:00'), closedAt: null },
    { id: 'issue-002', title: '西区阀控器电池待更换', fieldId: 'field-004', category: 'equipment', severity: 'medium', status: 'open', description: '设备电量低于 20%，需在下一轮巡检中更换电池。', reporter: '陈静', assignee: '赵强', observedAt: '2026-08-03', reviewDueDate: '2026-08-07', resolution: '', createdAt: iso('2026-08-03T18:15:00+08:00'), updatedAt: iso('2026-08-03T18:15:00+08:00'), closedAt: null },
    { id: 'issue-003', title: '南坡玉米叶面斑点复查', fieldId: 'field-003', category: 'disease', severity: 'low', status: 'review', description: '小范围叶面斑点，已完成样本检查与重点植株标记。', reporter: '赵强', assignee: '李明', observedAt: '2026-08-01', reviewDueDate: '2026-08-05', resolution: '初检未发现扩散，已标记 12 株并等待复查确认。', createdAt: iso('2026-08-01T09:30:00+08:00'), updatedAt: iso('2026-08-03T15:20:00+08:00'), closedAt: null },
  ];

  private corrections: Correction[] = [];

  private activities: Activity[] = [
    { id: 'activity-001', type: 'task', message: '赵强完成了“校准气象站传感器”', timestamp: iso('2026-08-03T16:20:00+08:00') },
    { id: 'activity-002', type: 'alert', message: '河畔温室 A 触发土壤含水率告警', timestamp: iso('2026-08-04T08:55:00+08:00') },
    { id: 'activity-003', type: 'device', message: '北田综合墒情站上传最新遥测数据', timestamp: iso('2026-08-04T09:25:00+08:00') },
    { id: 'activity-004', type: 'inventory', message: '陈静更新了番茄专用水溶肥库存', timestamp: iso('2026-08-02T15:30:00+08:00') },
    { id: 'activity-005', type: 'field', message: '南坡试验田作物长势巡检正常', timestamp: iso('2026-08-03T10:05:00+08:00') },
  ];

  constructor(private readonly database: LocalDatabase) {
    this.reloadFromDatabase();
  }

  reloadFromDatabase(): void {
    this.fields = this.database.loadCollection('fields', this.fields);
    for (const field of this.fields) {
      if (!field.farmId) {
        field.farmId = field.id === 'field-002' ? 'farm-002' : 'farm-001';
        this.database.put('fields', field);
      }
    }
    this.tasks = this.database.loadCollection('tasks', this.tasks);
    this.devices = this.database.loadCollection('devices', this.devices);
    this.alerts = this.database.loadCollection('alerts', this.alerts);
    this.inventory = this.database.loadCollection('inventory', this.inventory);
    this.inventoryTransactions = this.database.loadCollection('inventory_transactions', this.inventoryTransactions);
    this.purchases = this.database.loadCollection('purchases', this.purchases.map((item) => ({ ...item, unitPrice: Math.round(item.unitPrice * 100), amount: Math.round(item.amount * 100) })));
    this.issues = this.database.loadCollection('issues', this.issues);
    this.corrections = this.database.loadCollection('corrections', this.corrections);
    this.activities = this.database.loadCollection('activities', this.activities);
  }

  getDashboard(): Record<string, unknown> {
    const totalArea = this.fields.reduce((sum, field) => sum + field.area, 0);
    const onlineDevices = this.devices.filter((device) => device.status === 'online').length;
    const environment = this.devices.find((device) => device.status === 'online')?.telemetry;
    const cropAreas = new Map<string, number>();
    for (const field of this.fields) {
      cropAreas.set(field.crop, (cropAreas.get(field.crop) ?? 0) + field.area);
    }
    return {
      metrics: {
        totalFields: this.fields.length,
        totalArea: Number(totalArea.toFixed(1)),
        pendingTasks: this.tasks.filter((task) => task.status !== 'completed').length,
        onlineDevices,
        activeAlerts: this.alerts.filter((alert) => !alert.acknowledged).length,
      },
      environment: environment ?? null,
      cropDistribution: Array.from(cropAreas, ([crop, area]) => ({ crop, area: Number(area.toFixed(1)) })),
      taskTrend: this.taskTrend(),
      recentActivities: [...this.activities]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 8),
    };
  }

  getFields(): Field[] {
    return this.fields;
  }

  createField(body: unknown): Field {
    const input = this.objectBody(body);
    const farmId = this.optionalString(input, 'farmId') || 'farm-001';
    if (!this.database.hasEntity('farms', farmId)) {
      throw new HttpException(`农场 ${farmId} 不存在`, HttpStatus.NOT_FOUND);
    }
    const name = this.requiredString(input, 'name');
    const crop = this.requiredString(input, 'crop');
    const area = this.numberInRange(input, 'area', 0.1, 100000);
    const soilMoisture = this.numberInRange(input, 'soilMoisture', 0, 100);
    const status = this.enumValue<FieldStatus>(input, 'status', ['healthy', 'attention', 'fallow']);
    const plantedAt = this.dateString(input, 'plantedAt');
    const expectedHarvestAt = this.dateString(input, 'expectedHarvestAt');
    if (new Date(expectedHarvestAt) < new Date(plantedAt)) {
      throw new HttpException('expectedHarvestAt 不能早于 plantedAt', HttpStatus.BAD_REQUEST);
    }
    const field: Field = {
      id: randomUUID(),
      farmId,
      name,
      crop,
      area,
      location: this.requiredString(input, 'location'),
      status,
      plantedAt,
      expectedHarvestAt,
      soilMoisture,
      manager: this.requiredString(input, 'manager'),
      createdAt: new Date().toISOString(),
    };
    const activity = this.activity('field', `新增田块“${field.name}”`);
    this.database.transaction(() => {
      this.database.put('fields', field);
      this.database.put('activities', activity);
      this.database.appendAudit('field', field.id, 'create', `${field.name}；负责人：${field.manager}`);
    });
    this.fields.push(field);
    this.activities.unshift(activity);
    return field;
  }

  getTasks(): Task[] {
    return this.tasks;
  }

  createTask(body: unknown): Task {
    const input = this.objectBody(body);
    const fieldId = this.requiredString(input, 'fieldId');
    this.requireField(fieldId);
    const task: Task = {
      id: randomUUID(),
      title: this.requiredString(input, 'title'),
      fieldId,
      assignee: this.requiredString(input, 'assignee'),
      dueDate: this.dateString(input, 'dueDate'),
      priority: this.enumValue<TaskPriority>(input, 'priority', ['low', 'medium', 'high']),
      status: 'pending',
      description: this.optionalString(input, 'description'),
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    const activity = this.activity('task', `创建任务“${task.title}”`);
    this.database.transaction(() => {
      this.database.put('tasks', task);
      this.database.put('activities', activity);
      this.database.appendAudit('task', task.id, 'create', `${task.title}；负责人：${task.assignee}`);
    });
    this.tasks.push(task);
    this.activities.unshift(activity);
    return task;
  }

  updateTaskStatus(id: string, body: unknown, operationId?: string, targetServerId?: string): Task {
    if (targetServerId) {
      const actualServerId = this.database.getOrCreateMetadata('server_id', () => randomUUID());
      if (targetServerId !== actualServerId) {
        throw new HttpException('目标农场服务器身份不匹配，已拒绝同步', HttpStatus.CONFLICT);
      }
    }
    const normalizedOperationId = this.operationId(operationId);
    const receiptId = normalizedOperationId ? `task-status:${id}:${normalizedOperationId}` : undefined;
    if (receiptId) {
      const receipt = this.database.getOperationReceipt<Task>(receiptId);
      if (receipt) return receipt;
    }

    const task = this.tasks.find((item) => item.id === id);
    if (!task) throw new NotFoundException(`任务 ${id} 不存在`);
    const status = this.enumValue<TaskStatus>(this.objectBody(body), 'status', ['pending', 'in_progress', 'completed']);
    if (status === task.status) return task;
    const transitions: Record<TaskStatus, readonly TaskStatus[]> = {
      pending: ['in_progress'],
      in_progress: ['completed'],
      completed: [],
    };
    if (!transitions[task.status].includes(status)) {
      throw new HttpException(`任务不能从 ${task.status} 变更为 ${status}`, HttpStatus.CONFLICT);
    }
    const updated = {
      ...task,
      status,
      completedAt: status === 'completed' ? new Date().toISOString() : null,
    };
    const activity = this.activity('task', `任务“${task.title}”状态更新为 ${status}`);
    this.database.transaction(() => {
      this.database.put('tasks', updated);
      this.database.put('activities', activity);
      this.database.appendAudit('task', id, `status:${status}`, task.title);
      if (receiptId) this.database.putOperationReceipt(receiptId, updated);
    });
    Object.assign(task, updated);
    this.activities.unshift(activity);
    return task;
  }

  getDevices(): Device[] {
    return this.devices;
  }

  recordTelemetry(id: string, deviceKey: string | undefined, body: unknown): Device {
    if (deviceKey !== (process.env.DEVICE_KEY ?? 'agri-terminal-2026')) {
      throw new HttpException('设备密钥无效', HttpStatus.UNAUTHORIZED);
    }
    const device = this.devices.find((item) => item.id === id);
    if (!device) throw new NotFoundException(`设备 ${id} 不存在`);
    const input = this.objectBody(body);
    const telemetry: Telemetry = {
      temperature: this.numberInRange(input, 'temperature', -50, 80),
      humidity: this.numberInRange(input, 'humidity', 0, 100),
      soilMoisture: this.numberInRange(input, 'soilMoisture', 0, 100),
      light: this.numberInRange(input, 'light', 0, 200000),
      recordedAt: new Date().toISOString(),
    };
    const updatedDevice: Device = {
      ...device,
      telemetry,
      lastSeenAt: telemetry.recordedAt,
      status: 'online',
    };
    const field = this.fields.find((item) => item.id === device.fieldId);
    const updatedField = field ? { ...field, soilMoisture: telemetry.soilMoisture } : undefined;
    const activity = this.activity('device', `${device.name} 上传最新遥测数据`);
    this.database.transaction(() => {
      this.database.put('devices', updatedDevice);
      this.database.appendTelemetry(device.id, telemetry, telemetry.recordedAt);
      if (updatedField) this.database.put('fields', updatedField);
      this.database.put('activities', activity);
    });
    Object.assign(device, updatedDevice);
    if (field && updatedField) Object.assign(field, updatedField);
    this.activities.unshift(activity);
    return device;
  }

  getAlerts(): Alert[] {
    return this.alerts;
  }

  acknowledgeAlert(id: string): Alert {
    const alert = this.alerts.find((item) => item.id === id);
    if (!alert) throw new NotFoundException(`告警 ${id} 不存在`);
    if (!alert.acknowledged) {
      const updated = { ...alert, acknowledged: true, acknowledgedAt: new Date().toISOString() };
      const activity = this.activity('alert', `已确认告警“${alert.title}”`);
      this.database.transaction(() => {
        this.database.put('alerts', updated);
        this.database.put('activities', activity);
        this.database.appendAudit('alert', id, 'acknowledge', alert.title);
      });
      Object.assign(alert, updated);
      this.activities.unshift(activity);
    }
    return alert;
  }

  getInventory(): InventoryItem[] {
    return this.inventory;
  }

  getInventoryTransactions(): InventoryTransaction[] {
    return [...this.inventoryTransactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  createInventoryItem(body: unknown): InventoryItem {
    const input = this.objectBody(body);
    const name = this.limitedRequiredString(input, 'name', 100);
    if (this.inventory.some((item) => item.name.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'))) {
      throw new HttpException('同名农资已经存在', HttpStatus.CONFLICT);
    }
    const initialQuantity = this.roundQuantity(this.numberInRange(input, 'initialQuantity', 0, 1000000));
    const operator = this.limitedRequiredString(input, 'operator', 40);
    const now = new Date().toISOString();
    const item: InventoryItem = {
      id: randomUUID(),
      name,
      category: this.limitedRequiredString(input, 'category', 60),
      quantity: initialQuantity,
      unit: this.limitedRequiredString(input, 'unit', 20),
      minimumStock: this.roundQuantity(this.numberInRange(input, 'minimumStock', 0, 1000000)),
      location: this.limitedRequiredString(input, 'location', 100),
      updatedAt: now,
    };
    const opening: InventoryTransaction | null = initialQuantity > 0 ? {
      id: randomUUID(), itemId: item.id, type: 'opening', change: initialQuantity, balanceAfter: initialQuantity,
      fieldId: null, operator, reference: '新建农资期初库存', notes: '', createdAt: now,
    } : null;
    const activity = this.activity('inventory', `${operator}新建农资“${item.name}”`);
    this.database.transaction(() => {
      this.database.put('inventory', item);
      if (opening) this.database.put('inventory_transactions', opening);
      this.database.put('activities', activity);
      this.database.appendAudit('inventory', item.id, 'create', `${item.name}；期初库存：${initialQuantity} ${item.unit}`, operator);
    });
    this.inventory.push(item);
    if (opening) this.inventoryTransactions.unshift(opening);
    this.activities.unshift(activity);
    return item;
  }

  createInventoryTransaction(id: string, body: unknown): InventoryTransaction {
    const item = this.inventory.find((candidate) => candidate.id === id);
    if (!item) throw new NotFoundException(`库存项目 ${id} 不存在`);
    const input = this.objectBody(body);
    const type = this.enumValue<Exclude<InventoryTransactionType, 'opening'>>(input, 'type', ['purchase', 'usage', 'return', 'adjustment']);
    const quantity = this.roundQuantity(this.numberInRange(input, 'quantity', type === 'adjustment' ? 0 : 0.01, 1000000));
    const currentQuantity = this.roundQuantity(item.quantity);
    const balanceAfter = type === 'adjustment'
      ? quantity
      : this.roundQuantity(currentQuantity + (type === 'usage' ? -quantity : quantity));
    const change = this.roundQuantity(balanceAfter - currentQuantity);
    if (balanceAfter < 0) {
      throw new HttpException(`库存不足，当前仅有 ${item.quantity} ${item.unit}`, HttpStatus.CONFLICT);
    }
    if (change === 0) {
      throw new HttpException('调整后数量与当前库存相同，无需登记', HttpStatus.BAD_REQUEST);
    }
    const fieldId = this.optionalString(input, 'fieldId');
    if (fieldId) this.requireField(fieldId);
    const transaction: InventoryTransaction = {
      id: randomUUID(),
      itemId: item.id,
      type,
      change,
      balanceAfter,
      fieldId: fieldId || null,
      operator: this.limitedRequiredString(input, 'operator', 40),
      reference: this.limitedOptionalString(input, 'reference', 80),
      notes: this.limitedOptionalString(input, 'notes', 300),
      createdAt: new Date().toISOString(),
    };
    const updatedItem = { ...item, quantity: balanceAfter, updatedAt: transaction.createdAt };
    const activity = this.activity('inventory', `${transaction.operator}登记“${item.name}”库存变动 ${change > 0 ? '+' : ''}${change} ${item.unit}`);
    this.database.transaction(() => {
      this.database.put('inventory_transactions', transaction);
      this.database.put('inventory', updatedItem);
      this.database.put('activities', activity);
      this.database.appendAudit('inventory', item.id, `transaction:${type}`, `${change > 0 ? '+' : ''}${change} ${item.unit}；经办人：${transaction.operator}`);
    });
    Object.assign(item, updatedItem);
    this.inventoryTransactions.unshift(transaction);
    this.activities.unshift(activity);
    return transaction;
  }

  recordProductionUsage(
    input: { itemId: string; quantity: number; fieldId: string; operator: string; reference: string; notes: string },
    persistProductionRecord: () => void,
  ): InventoryTransaction {
    const item = this.inventory.find((candidate) => candidate.id === input.itemId);
    if (!item) throw new NotFoundException(`库存项目 ${input.itemId} 不存在`);
    const quantity = this.roundQuantity(input.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpException('生产领用数量必须大于 0', HttpStatus.BAD_REQUEST);
    this.requireField(input.fieldId);
    const balanceAfter = this.roundQuantity(item.quantity - quantity);
    if (balanceAfter < 0) throw new HttpException(`库存不足，当前仅有 ${item.quantity} ${item.unit}`, HttpStatus.CONFLICT);
    const now = new Date().toISOString();
    const transaction: InventoryTransaction = {
      id: randomUUID(), itemId: item.id, type: 'usage', change: -quantity, balanceAfter,
      fieldId: input.fieldId, operator: input.operator, reference: input.reference, notes: input.notes, createdAt: now,
    };
    const updatedItem = { ...item, quantity: balanceAfter, updatedAt: now };
    const activity = this.activity('inventory', `${input.operator}生产领用“${item.name}” ${quantity} ${item.unit}`);
    this.database.transaction(() => {
      persistProductionRecord();
      this.database.put('inventory_transactions', transaction);
      this.database.put('inventory', updatedItem);
      this.database.put('activities', activity);
      this.database.appendAudit('inventory', item.id, 'transaction:usage', `-${quantity} ${item.unit}；${input.reference}`, input.operator);
    });
    Object.assign(item, updatedItem);
    this.inventoryTransactions.unshift(transaction);
    this.activities.unshift(activity);
    return transaction;
  }

  getPurchases(): PurchaseOrder[] {
    return [...this.purchases].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  createPurchase(body: unknown): PurchaseOrder {
    const input = this.objectBody(body);
    const inventoryItemId = this.requiredString(input, 'inventoryItemId');
    const item = this.inventory.find((candidate) => candidate.id === inventoryItemId);
    if (!item) throw new NotFoundException(`库存项目 ${inventoryItemId} 不存在`);
    const quantity = this.roundQuantity(this.numberInRange(input, 'quantity', 0.01, 1000000));
    const unitPrice = assertIntegerCents(this.numberInRange(input, 'unitPrice', 0, 100000000), 'unitPrice');
    const now = new Date().toISOString();
    const values = {
      inventoryItemId: item.id,
      itemName: item.name,
      quantity,
      unit: item.unit,
      unitPrice,
      amount: multiplyCents(quantity, unitPrice),
      supplier: this.limitedRequiredString(input, 'supplier', 100),
      expectedAt: this.dateString(input, 'expectedAt'),
      buyer: this.limitedRequiredString(input, 'buyer', 40),
      notes: this.limitedOptionalString(input, 'notes', 300),
    };
    let purchase!: PurchaseOrder;
    let activity!: Activity;
    this.database.transaction(() => {
      const currentSequence = this.purchases.reduce((max, order) => {
        const match = /-(\d+)$/.exec(order.orderNo);
        return Math.max(max, match ? Number(match[1]) : 0);
      }, 0);
      const sequence = Number(this.database.getOrCreateMetadata('purchase_sequence', () => String(currentSequence))) + 1;
      this.database.setMetadata('purchase_sequence', String(sequence));
      purchase = {
        id: randomUUID(),
        orderNo: `PO-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`,
        ...values,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        receivedAt: null,
      };
      activity = this.activity('purchase', `创建采购单 ${purchase.orderNo}，采购“${purchase.itemName}” ${purchase.quantity} ${purchase.unit}`);
      this.database.put('purchases', purchase);
      this.database.put('activities', activity);
      this.database.appendAudit('purchase', purchase.id, 'create', `${purchase.orderNo}；供应商：${purchase.supplier}；金额：${purchase.amount}`, purchase.buyer);
    });
    this.purchases.unshift(purchase);
    this.activities.unshift(activity);
    return purchase;
  }

  receivePurchase(id: string, body: unknown): PurchaseOrder {
    const purchase = this.purchases.find((candidate) => candidate.id === id);
    if (!purchase) throw new NotFoundException(`采购单 ${id} 不存在`);
    if (purchase.status === 'received') return purchase;
    const input = this.objectBody(body);
    const operator = this.limitedRequiredString(input, 'operator', 40);
    const item = this.inventory.find((candidate) => candidate.id === purchase.inventoryItemId);
    if (!item) throw new NotFoundException(`库存项目 ${purchase.inventoryItemId} 不存在`);
    const now = new Date().toISOString();
    const balanceAfter = this.roundQuantity(item.quantity + purchase.quantity);
    const updatedItem: InventoryItem = { ...item, quantity: balanceAfter, updatedAt: now };
    const updatedPurchase: PurchaseOrder = { ...purchase, status: 'received', updatedAt: now, receivedAt: now };
    const transaction: InventoryTransaction = {
      id: randomUUID(),
      itemId: item.id,
      type: 'purchase',
      change: purchase.quantity,
      balanceAfter,
      fieldId: null,
      operator,
      reference: purchase.orderNo,
      notes: `供应商：${purchase.supplier}`,
      createdAt: now,
    };
    const activity = this.activity('purchase', `${operator}确认采购单 ${purchase.orderNo} 到货并入库`);
    this.database.transaction(() => {
      this.database.put('purchases', updatedPurchase);
      this.database.put('inventory_transactions', transaction);
      this.database.put('inventory', updatedItem);
      this.database.put('activities', activity);
      this.database.appendAudit('purchase', purchase.id, 'receive', `${purchase.itemName} +${purchase.quantity} ${purchase.unit}`, operator);
      this.database.appendAudit('inventory', item.id, 'transaction:purchase', `+${purchase.quantity} ${purchase.unit}；采购单：${purchase.orderNo}`, operator);
    });
    Object.assign(purchase, updatedPurchase);
    Object.assign(item, updatedItem);
    this.inventoryTransactions.unshift(transaction);
    this.activities.unshift(activity);
    return purchase;
  }

  getIssues(): FieldIssue[] {
    return [...this.issues].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  createIssue(body: unknown): FieldIssue {
    const input = this.objectBody(body);
    const fieldId = this.requiredString(input, 'fieldId');
    this.requireField(fieldId);
    const now = new Date().toISOString();
    const reviewDueDateInput = this.limitedOptionalString(input, 'reviewDueDate', 30);
    const reviewDueDate = reviewDueDateInput ? this.validDateKey(reviewDueDateInput, 'reviewDueDate') : '';
    const issue: FieldIssue = {
      id: randomUUID(),
      title: this.limitedRequiredString(input, 'title', 80),
      fieldId,
      category: this.enumValue<IssueCategory>(input, 'category', ['pest', 'disease', 'irrigation', 'equipment', 'quality', 'other']),
      severity: this.enumValue<IssueSeverity>(input, 'severity', ['low', 'medium', 'high', 'critical']),
      status: 'open',
      description: this.limitedRequiredString(input, 'description', 800),
      reporter: this.limitedRequiredString(input, 'reporter', 40),
      assignee: this.limitedRequiredString(input, 'assignee', 40),
      observedAt: this.dateString(input, 'observedAt'),
      reviewDueDate: reviewDueDate || null,
      resolution: '',
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };
    const activity = this.activity('issue', `登记巡田问题“${issue.title}”`);
    this.database.transaction(() => {
      this.database.put('issues', issue);
      this.database.put('activities', activity);
      this.database.appendAudit('issue', issue.id, 'create', `${issue.title}；发现人：${issue.reporter}`);
    });
    this.issues.unshift(issue);
    this.activities.unshift(activity);
    return issue;
  }

  updateIssueStatus(id: string, body: unknown): FieldIssue {
    const issue = this.issues.find((candidate) => candidate.id === id);
    if (!issue) throw new NotFoundException(`巡田问题 ${id} 不存在`);
    const input = this.objectBody(body);
    const status = this.enumValue<IssueStatus>(input, 'status', ['open', 'in_progress', 'review', 'closed']);
    const transitions: Record<IssueStatus, readonly IssueStatus[]> = {
      open: ['in_progress'],
      in_progress: ['open', 'review'],
      review: ['in_progress', 'closed'],
      closed: [],
    };
    if (!transitions[issue.status].includes(status)) {
      throw new HttpException(`问题不能从 ${issue.status} 变更为 ${status}`, HttpStatus.CONFLICT);
    }
    const resolutionInput = this.limitedOptionalString(input, 'resolution', 1000);
    const resolution = resolutionInput || issue.resolution;
    if (status === 'review' && !resolution) {
      throw new HttpException('提交复查前必须填写处理结果', HttpStatus.BAD_REQUEST);
    }
    const now = new Date().toISOString();
    const updated: FieldIssue = {
      ...issue,
      status,
      resolution,
      updatedAt: now,
      closedAt: status === 'closed' ? now : null,
    };
    const activity = this.activity('issue', `巡田问题“${issue.title}”状态更新为 ${status}`);
    this.database.transaction(() => {
      this.database.put('issues', updated);
      this.database.put('activities', activity);
      this.database.appendAudit('issue', id, `status:${status}`, `${issue.title}；负责人：${issue.assignee}`);
    });
    Object.assign(issue, updated);
    this.activities.unshift(activity);
    return issue;
  }

  getCorrections(): Correction[] {
    return [...this.corrections].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  createCorrection(body: unknown): Correction {
    const input = this.objectBody(body);
    const now = new Date().toISOString();
    const values = {
      category: this.enumValue<CorrectionCategory>(input, 'category', ['data', 'system', 'workflow', 'suggestion']),
      priority: this.enumValue<TaskPriority>(input, 'priority', ['low', 'medium', 'high']),
      title: this.limitedRequiredString(input, 'title', 100),
      description: this.limitedRequiredString(input, 'description', 1500),
      expectedValue: this.limitedOptionalString(input, 'expectedValue', 800),
      route: this.limitedOptionalString(input, 'route', 200),
      entityType: this.limitedOptionalString(input, 'entityType', 40),
      entityId: this.limitedOptionalString(input, 'entityId', 100),
      errorCode: this.limitedOptionalString(input, 'errorCode', 100),
      createdBy: this.limitedRequiredString(input, 'createdBy', 40),
    };
    let correction!: Correction;
    let activity!: Activity;
    this.database.transaction(() => {
      const sequence = Number(this.database.getOrCreateMetadata('correction_sequence', () => '0')) + 1;
      this.database.setMetadata('correction_sequence', String(sequence));
      correction = {
        id: randomUUID(),
        code: `CR-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`,
        ...values,
        status: 'open',
        resolution: '',
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
      };
      activity = this.activity('correction', `提交纠错工单 ${correction.code}“${correction.title}”`);
      this.database.put('corrections', correction);
      this.database.put('activities', activity);
      this.database.appendAudit('correction', correction.id, 'create', `${correction.title}；提交人：${correction.createdBy}`);
    });
    this.corrections.unshift(correction);
    this.activities.unshift(activity);
    return correction;
  }

  updateCorrectionStatus(id: string, body: unknown): Correction {
    const correction = this.corrections.find((candidate) => candidate.id === id);
    if (!correction) throw new NotFoundException(`纠错工单 ${id} 不存在`);
    const input = this.objectBody(body);
    const status = this.enumValue<CorrectionStatus>(input, 'status', ['open', 'processing', 'resolved']);
    if (correction.status === 'resolved') {
      throw new HttpException('已解决工单不能再次更新', HttpStatus.CONFLICT);
    }
    if (correction.status === status) return correction;
    const transitions: Record<CorrectionStatus, readonly CorrectionStatus[]> = {
      open: ['processing'],
      processing: ['resolved'],
      resolved: [],
    };
    if (!transitions[correction.status].includes(status)) {
      throw new HttpException(`纠错工单不能从 ${correction.status} 变更为 ${status}`, HttpStatus.CONFLICT);
    }
    const resolution = this.limitedOptionalString(input, 'resolution', 1000) || correction.resolution;
    if (status === 'resolved' && !resolution) {
      throw new HttpException('解决工单前必须填写处理说明', HttpStatus.BAD_REQUEST);
    }
    const now = new Date().toISOString();
    const updated: Correction = {
      ...correction,
      status,
      resolution,
      updatedAt: now,
      resolvedAt: status === 'resolved' ? now : null,
    };
    const activity = this.activity('correction', `纠错工单 ${correction.code} 状态更新为 ${status}`);
    this.database.transaction(() => {
      this.database.put('corrections', updated);
      this.database.put('activities', activity);
      this.database.appendAudit('correction', id, `status:${status}`, correction.title);
    });
    Object.assign(correction, updated);
    this.activities.unshift(activity);
    return correction;
  }

  private taskTrend(): Array<{ date: string; completed: number; created: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (6 - index));
      const date = this.localDateKey(day);
      return {
        date,
        created: this.tasks.filter((task) => this.localDateKey(new Date(task.createdAt)) === date).length,
        completed: this.tasks.filter((task) => task.completedAt && this.localDateKey(new Date(task.completedAt)) === date).length,
      };
    });
  }

  private localDateKey(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private requireField(id: string): void {
    if (!this.fields.some((field) => field.id === id)) {
      throw new NotFoundException(`田块 ${id} 不存在`);
    }
  }

  private activity(type: string, message: string): Activity {
    return { id: randomUUID(), type, message, timestamp: new Date().toISOString() };
  }

  private operationId(value: string | undefined): string | undefined {
    if (value === undefined || value.trim() === '') return undefined;
    if (value.length > 128) {
      throw new HttpException('x-operation-id 长度不能超过 128', HttpStatus.BAD_REQUEST);
    }
    return value.trim();
  }

  private objectBody(body: unknown): Record<string, unknown> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpException('请求体必须是 JSON 对象', HttpStatus.BAD_REQUEST);
    }
    return body as Record<string, unknown>;
  }

  private requiredString(input: Record<string, unknown>, key: string): string {
    const value = input[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new HttpException(`${key} 必须是非空字符串`, HttpStatus.BAD_REQUEST);
    }
    return value.trim();
  }

  private optionalString(input: Record<string, unknown>, key: string): string {
    const value = input[key];
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') {
      throw new HttpException(`${key} 必须是字符串`, HttpStatus.BAD_REQUEST);
    }
    return value.trim();
  }

  private limitedRequiredString(input: Record<string, unknown>, key: string, maxLength: number): string {
    const value = this.requiredString(input, key);
    if (value.length > maxLength) {
      throw new HttpException(`${key} 长度不能超过 ${maxLength}`, HttpStatus.BAD_REQUEST);
    }
    return value;
  }

  private limitedOptionalString(input: Record<string, unknown>, key: string, maxLength: number): string {
    const value = this.optionalString(input, key);
    if (value.length > maxLength) {
      throw new HttpException(`${key} 长度不能超过 ${maxLength}`, HttpStatus.BAD_REQUEST);
    }
    return value;
  }

  private numberInRange(input: Record<string, unknown>, key: string, min: number, max: number): number {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new HttpException(`${key} 必须是 ${min} 到 ${max} 之间的数字`, HttpStatus.BAD_REQUEST);
    }
    return value;
  }

  private enumValue<T extends string>(input: Record<string, unknown>, key: string, values: readonly T[]): T {
    const value = input[key];
    if (typeof value !== 'string' || !values.includes(value as T)) {
      throw new HttpException(`${key} 必须是 ${values.join('、')} 之一`, HttpStatus.BAD_REQUEST);
    }
    return value as T;
  }

  private dateString(input: Record<string, unknown>, key: string): string {
    return this.validDateKey(this.requiredString(input, key), key);
  }

  private validDateKey(value: string, key: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new HttpException(`${key} 必须是 YYYY-MM-DD 格式的有效日期`, HttpStatus.BAD_REQUEST);
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
      throw new HttpException(`${key} 必须是有效日期`, HttpStatus.BAD_REQUEST);
    }
    return value;
  }

  private roundQuantity(value: number): number {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
