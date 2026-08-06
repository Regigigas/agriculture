import { HttpException, HttpStatus, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ApplicationDatabase } from './application-database';
import { SyncDatabase } from './sync-database';
import {
  Activity,
  Alert,
  Device,
  Field,
  FieldStatus,
  InventoryItem,
  PurchaseOrder,
  Task,
  TaskPriority,
  TaskStatus,
  Telemetry,
} from './types';

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

  private purchases: PurchaseOrder[] = [
    { id: 'purchase-001', orderNo: 'PO-2026-0001', inventoryItemId: 'inventory-002', itemName: '番茄专用水溶肥', quantity: 120, unit: 'kg', unitPrice: 6.8, amount: 816, supplier: '绿禾农资有限公司', expectedAt: '2026-08-07', buyer: '陈静', notes: '温室膨果期补货', status: 'pending', createdAt: iso('2026-08-03T14:30:00+08:00'), updatedAt: iso('2026-08-03T14:30:00+08:00'), receivedAt: null },
  ];

  private activities: Activity[] = [
    { id: 'activity-001', type: 'task', message: '赵强完成了“校准气象站传感器”', timestamp: iso('2026-08-03T16:20:00+08:00') },
    { id: 'activity-002', type: 'alert', message: '河畔温室 A 触发土壤含水率告警', timestamp: iso('2026-08-04T08:55:00+08:00') },
    { id: 'activity-003', type: 'device', message: '北田综合墒情站上传最新遥测数据', timestamp: iso('2026-08-04T09:25:00+08:00') },
    { id: 'activity-004', type: 'inventory', message: '陈静更新了番茄专用水溶肥库存', timestamp: iso('2026-08-02T15:30:00+08:00') },
    { id: 'activity-005', type: 'field', message: '南坡试验田作物长势巡检正常', timestamp: iso('2026-08-03T10:05:00+08:00') },
  ];

  constructor(
    private readonly database: ApplicationDatabase,
    @Optional() private readonly syncDatabase?: SyncDatabase,
  ) {
    this.refreshState();
    this.database.transaction(() => {
      this.database.writeState('agriculture.fields', this.fields);
      this.database.writeState('agriculture.tasks', this.tasks);
      this.database.writeState('agriculture.devices', this.devices);
      this.database.writeState('agriculture.alerts', this.alerts);
      this.database.writeState('agriculture.inventory', this.inventory);
      this.database.writeState('agriculture.purchases', this.purchases);
      this.database.writeState('agriculture.activities', this.activities);
    });
  }

  private refreshState(): void {
    this.fields = this.database.readState('agriculture.fields', this.fields);
    this.tasks = this.database.readState('agriculture.tasks', this.tasks);
    this.devices = this.database.readState('agriculture.devices', this.devices);
    this.alerts = this.database.readState('agriculture.alerts', this.alerts);
    this.inventory = this.database.readState('agriculture.inventory', this.inventory);
    this.purchases = this.database.readState('agriculture.purchases', this.purchases);
    this.activities = this.database.readState('agriculture.activities', this.activities);
  }

  getDashboard(): Record<string, unknown> {
    this.refreshState();
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
      taskTrend: [
        { date: '2026-07-29', completed: 3, created: 2 },
        { date: '2026-07-30', completed: 2, created: 4 },
        { date: '2026-07-31', completed: 5, created: 3 },
        { date: '2026-08-01', completed: 4, created: 3 },
        { date: '2026-08-02', completed: 3, created: 2 },
        { date: '2026-08-03', completed: 6, created: 4 },
        { date: '2026-08-04', completed: 2, created: 3 },
      ],
      recentActivities: [...this.activities]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 8),
    };
  }

  getFields(): Field[] {
    this.fields = this.database.readState('agriculture.fields', this.fields);
    return this.fields;
  }

  createField(body: unknown): Field {
    this.getFields();
    const input = this.objectBody(body);
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
      farmId: this.optionalString(input, 'farmId') || 'farm-001',
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
    const updatedFields = [...this.fields, field];
    const activity = this.createActivity('field', `新增田块“${field.name}”`);
    const updatedActivities = [activity, ...this.activities];
    this.database.transaction(() => {
      this.database.writeState('agriculture.fields', updatedFields);
      this.database.writeState('agriculture.activities', updatedActivities);
      this.syncDatabase?.recordEntity('fields', field as unknown as Record<string, unknown>, field.createdAt);
    });
    this.fields = updatedFields;
    this.activities = updatedActivities;
    return field;
  }

  uprootField(id: string, body: unknown): Field {
    const { field, reason } = this.validateUprootField(id, body);
    const updatedField: Field = { ...field, crop: '', status: 'fallow' };
    const changedAt = new Date().toISOString();
    const activity: Activity = { id: randomUUID(), type: 'field', message: `管理员挖除“${field.name}”的“${field.crop}”：${reason}`, timestamp: changedAt };
    const updatedFields = this.fields.map((item) => item.id === id ? updatedField : item);
    const updatedActivities = [activity, ...this.activities];
    this.database.transaction(() => {
      this.database.writeState('agriculture.fields', updatedFields);
      this.database.writeState('agriculture.activities', updatedActivities);
      this.syncDatabase?.recordUproot(id, updatedField as unknown as Record<string, unknown>, changedAt);
    });
    this.fields = updatedFields;
    this.activities = updatedActivities;
    return updatedField;
  }

  validateUprootField(id: string, body: unknown): { field: Field; reason: string } {
    const field = this.requireField(id);
    if (field.status === 'fallow' && !field.crop) throw new HttpException('该地块当前没有可挖除作物', HttpStatus.CONFLICT);
    const reason = this.limitedRequiredString(this.objectBody(body), 'reason', 300);
    if (reason.length < 4) throw new HttpException('请填写至少 4 个字符的挖除原因', HttpStatus.BAD_REQUEST);
    return { field, reason };
  }

  getTasks(): Task[] {
    this.tasks = this.database.readState('agriculture.tasks', this.tasks);
    return this.tasks;
  }

  createTask(body: unknown): Task {
    const input = this.objectBody(body);
    const fieldId = this.requiredString(input, 'fieldId');
    this.requireField(fieldId);
    this.getTasks();
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
    const updatedTasks = [...this.tasks, task];
    const activity = this.createActivity('task', `创建任务“${task.title}”`);
    const updatedActivities = [activity, ...this.activities];
    this.database.transaction(() => {
      this.database.writeState('agriculture.tasks', updatedTasks);
      this.database.writeState('agriculture.activities', updatedActivities);
      this.syncDatabase?.recordEntity('tasks', task as unknown as Record<string, unknown>, task.createdAt);
    });
    this.tasks = updatedTasks;
    this.activities = updatedActivities;
    return task;
  }

  updateTaskStatus(id: string, body: unknown): Task {
    const task = this.getTasks().find((item) => item.id === id);
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
    const updatedTask = { ...task, status, completedAt: status === 'completed' ? new Date().toISOString() : null };
    const updatedTasks = this.tasks.map((item) => item.id === id ? updatedTask : item);
    const activity = this.createActivity('task', `任务“${task.title}”状态更新为 ${status}`);
    const updatedActivities = [activity, ...this.activities];
    this.database.transaction(() => {
      this.database.writeState('agriculture.tasks', updatedTasks);
      this.database.writeState('agriculture.activities', updatedActivities);
      this.syncDatabase?.recordEntity('tasks', updatedTask as unknown as Record<string, unknown>);
    });
    this.tasks = updatedTasks;
    this.activities = updatedActivities;
    return updatedTask;
  }

  getDevices(): Device[] {
    this.devices = this.database.readState('agriculture.devices', this.devices);
    return this.devices;
  }

  recordTelemetry(id: string, deviceKey: string | undefined, body: unknown): Device {
    if (deviceKey !== (process.env.DEVICE_KEY ?? 'agri-terminal-2026')) {
      throw new HttpException('设备密钥无效', HttpStatus.UNAUTHORIZED);
    }
    const device = this.getDevices().find((item) => item.id === id);
    if (!device) throw new NotFoundException(`设备 ${id} 不存在`);
    const input = this.objectBody(body);
    const telemetry: Telemetry = {
      temperature: this.numberInRange(input, 'temperature', -50, 80),
      humidity: this.numberInRange(input, 'humidity', 0, 100),
      soilMoisture: this.numberInRange(input, 'soilMoisture', 0, 100),
      light: this.numberInRange(input, 'light', 0, 200000),
      recordedAt: new Date().toISOString(),
    };
    const updatedDevice: Device = { ...device, telemetry, lastSeenAt: telemetry.recordedAt, status: 'online' };
    const updatedDevices = this.devices.map((item) => item.id === id ? updatedDevice : item);
    const field = this.getFields().find((item) => item.id === device.fieldId);
    const updatedFields = field
      ? this.fields.map((item) => item.id === field.id ? { ...item, soilMoisture: telemetry.soilMoisture } : item)
      : this.fields;
    const activity = this.createActivity('device', `${device.name} 上传最新遥测数据`);
    const updatedActivities = [activity, ...this.activities];
    this.database.transaction(() => {
      this.database.writeState('agriculture.devices', updatedDevices);
      if (field) this.database.writeState('agriculture.fields', updatedFields);
      this.database.writeState('agriculture.activities', updatedActivities);
      this.syncDatabase?.recordEntity('devices', updatedDevice as unknown as Record<string, unknown>, telemetry.recordedAt);
      if (field) {
        const updatedField = updatedFields.find((item) => item.id === field.id);
        if (updatedField) this.syncDatabase?.recordEntity('fields', updatedField as unknown as Record<string, unknown>, telemetry.recordedAt);
      }
    });
    this.devices = updatedDevices;
    this.fields = updatedFields;
    this.activities = updatedActivities;
    return updatedDevice;
  }

  getAlerts(): Alert[] {
    this.alerts = this.database.readState('agriculture.alerts', this.alerts);
    return this.alerts;
  }

  acknowledgeAlert(id: string): Alert {
    const alert = this.getAlerts().find((item) => item.id === id);
    if (!alert) throw new NotFoundException(`告警 ${id} 不存在`);
    if (!alert.acknowledged) {
      const updatedAlert = { ...alert, acknowledged: true, acknowledgedAt: new Date().toISOString() };
      const updatedAlerts = this.alerts.map((item) => item.id === id ? updatedAlert : item);
      const activity = this.createActivity('alert', `已确认告警“${alert.title}”`);
      const updatedActivities = [activity, ...this.activities];
      this.database.transaction(() => {
        this.database.writeState('agriculture.alerts', updatedAlerts);
        this.database.writeState('agriculture.activities', updatedActivities);
        this.syncDatabase?.recordEntity('alerts', updatedAlert as unknown as Record<string, unknown>, updatedAlert.acknowledgedAt);
      });
      this.alerts = updatedAlerts;
      this.activities = updatedActivities;
      return updatedAlert;
    }
    return alert;
  }

  getInventory(): InventoryItem[] {
    this.inventory = this.database.readState('agriculture.inventory', this.inventory);
    return this.inventory;
  }

  getPurchases(): PurchaseOrder[] {
    this.purchases = this.database.readState('agriculture.purchases', this.purchases);
    return [...this.purchases].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  createPurchase(body: unknown): PurchaseOrder {
    const input = this.objectBody(body);
    const inventoryItemId = this.requiredString(input, 'inventoryItemId');
    const item = this.getInventory().find((candidate) => candidate.id === inventoryItemId);
    this.getPurchases();
    if (!item) throw new NotFoundException(`库存项目 ${inventoryItemId} 不存在`);
    const quantity = this.roundQuantity(this.numberInRange(input, 'quantity', 0.01, 1000000));
    const unitPrice = this.roundMoney(this.numberInRange(input, 'unitPrice', 0, 1000000));
    const now = new Date().toISOString();
    const purchase: PurchaseOrder = {
      id: randomUUID(),
      orderNo: `PO-${new Date().getFullYear()}-${String(this.purchases.length + 1).padStart(4, '0')}`,
      inventoryItemId: item.id,
      itemName: item.name,
      quantity,
      unit: item.unit,
      unitPrice,
      amount: this.roundMoney(quantity * unitPrice),
      supplier: this.limitedRequiredString(input, 'supplier', 100),
      expectedAt: this.dateString(input, 'expectedAt'),
      buyer: this.limitedRequiredString(input, 'buyer', 40),
      notes: this.limitedOptionalString(input, 'notes', 300),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      receivedAt: null,
    };
    const updatedPurchases = [purchase, ...this.purchases];
    const activity = this.createActivity('purchase', `创建采购单 ${purchase.orderNo}，采购“${purchase.itemName}” ${purchase.quantity} ${purchase.unit}`);
    const updatedActivities = [activity, ...this.activities];
    this.database.transaction(() => {
      this.database.writeState('agriculture.purchases', updatedPurchases);
      this.database.writeState('agriculture.activities', updatedActivities);
      this.syncDatabase?.recordEntity('purchases', purchase as unknown as Record<string, unknown>, purchase.createdAt);
    });
    this.purchases = updatedPurchases;
    this.activities = updatedActivities;
    return purchase;
  }

  receivePurchase(id: string, body: unknown): PurchaseOrder {
    const purchase = this.getPurchases().find((candidate) => candidate.id === id);
    if (!purchase) throw new NotFoundException(`采购单 ${id} 不存在`);
    if (purchase.status === 'received') return purchase;
    const input = this.objectBody(body);
    const operator = this.limitedRequiredString(input, 'operator', 40);
    const item = this.getInventory().find((candidate) => candidate.id === purchase.inventoryItemId);
    if (!item) throw new NotFoundException(`库存项目 ${purchase.inventoryItemId} 不存在`);
    const now = new Date().toISOString();
    const updatedItem = { ...item, quantity: this.roundQuantity(item.quantity + purchase.quantity), updatedAt: now };
    const updatedPurchase: PurchaseOrder = { ...purchase, status: 'received', updatedAt: now, receivedAt: now };
    const updatedInventory = this.inventory.map((candidate) => candidate.id === item.id ? updatedItem : candidate);
    const updatedPurchases = this.purchases.map((candidate) => candidate.id === id ? updatedPurchase : candidate);
    const activity = this.createActivity('purchase', `${operator}确认采购单 ${purchase.orderNo} 到货并入库`);
    const updatedActivities = [activity, ...this.activities];
    this.database.transaction(() => {
      this.database.writeState('agriculture.inventory', updatedInventory);
      this.database.writeState('agriculture.purchases', updatedPurchases);
      this.database.writeState('agriculture.activities', updatedActivities);
      this.syncDatabase?.recordEntity('inventory', updatedItem as unknown as Record<string, unknown>, now);
      this.syncDatabase?.recordEntity('purchases', updatedPurchase as unknown as Record<string, unknown>, now);
    });
    this.inventory = updatedInventory;
    this.purchases = updatedPurchases;
    this.activities = updatedActivities;
    return updatedPurchase;
  }

  private requireField(id: string): Field {
    const field = this.getFields().find((item) => item.id === id);
    if (!field) throw new NotFoundException(`田块 ${id} 不存在`);
    return field;
  }

  private createActivity(type: string, message: string): Activity {
    return { id: randomUUID(), type, message, timestamp: new Date().toISOString() };
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
    if (value === undefined) return '';
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
    const value = this.requiredString(input, key);
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
