import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AgricultureService } from './agriculture.service';
import { LocalDatabase } from './local-database';
import {
  ActiveStatus,
  BusinessSubject,
  ComplianceDocument,
  CropCycle,
  CropCycleStatus,
  Farm,
  FarmContract,
  HarvestBatch,
  OperationLog,
  OperationType,
  ProductionPlan,
  ProductionPlanStatus,
  SalesOrder,
  SubjectType,
  TraceResult,
} from './production.types';

const iso = (value: string): string => new Date(value).toISOString();

@Injectable()
export class ProductionService {
  private subjects: BusinessSubject[] = [
    { id: 'subject-001', name: '丰域家庭农场', type: 'family_farm', creditCode: 'JY41081120260001', contact: '李明', phone: '13800001001', address: '河南省焦作市示范区', status: 'active', notes: '粮食与设施蔬菜综合经营主体', createdAt: iso('2025-08-18'), updatedAt: iso('2026-07-20') },
    { id: 'subject-002', name: '河畔农业合作社', type: 'cooperative', creditCode: '93410811MA9AGRI002', contact: '王芳', phone: '13800001002', address: '河南省焦作市河畔园区', status: 'active', notes: '负责温室群运营与订单销售', createdAt: iso('2025-11-02'), updatedAt: iso('2026-07-28') },
  ];

  private farms: Farm[] = [
    { id: 'farm-001', subjectId: 'subject-001', name: '丰域北区农场', location: '园区北区及南坡缓冲带', totalArea: 98.6, manager: '李明', status: 'active', description: '露地粮食、轮作试验和气象监测区', createdAt: iso('2025-08-20'), updatedAt: iso('2026-07-20') },
    { id: 'farm-002', subjectId: 'subject-002', name: '河畔设施农业园', location: '园区东南温室群', totalArea: 8.4, manager: '王芳', status: 'active', description: '番茄水肥一体化与订单采收基地', createdAt: iso('2025-11-05'), updatedAt: iso('2026-07-28') },
  ];

  private cycles: CropCycle[] = [
    { id: 'cycle-001', code: 'CY-2026-001', fieldId: 'field-002', crop: '番茄', variety: '普罗旺斯', seasonYear: 2026, plannedStart: '2026-01-12', plannedHarvest: '2026-08-20', actualStart: iso('2026-01-12'), actualHarvest: null, targetYield: 52000, budget: 138000, manager: '王芳', status: 'in_progress', notes: '订单型设施番茄生产季', createdAt: iso('2025-12-18'), updatedAt: iso('2026-08-03') },
    { id: 'cycle-002', code: 'CY-2026-002', fieldId: 'field-003', crop: '玉米', variety: '郑单 958', seasonYear: 2026, plannedStart: '2026-04-18', plannedHarvest: '2026-09-25', actualStart: iso('2026-04-18'), actualHarvest: null, targetYield: 39000, budget: 52000, manager: '赵强', status: 'in_progress', notes: '南坡节水对比试验', createdAt: iso('2026-03-15'), updatedAt: iso('2026-08-02') },
    { id: 'cycle-003', code: 'CY-2025-003', fieldId: 'field-001', crop: '冬小麦', variety: '郑麦 136', seasonYear: 2025, plannedStart: '2025-10-16', plannedHarvest: '2026-06-08', actualStart: iso('2025-10-16'), actualHarvest: iso('2026-06-09'), targetYield: 26000, budget: 44000, manager: '李明', status: 'completed', notes: '已完成结季和采收质检', createdAt: iso('2025-09-01'), updatedAt: iso('2026-06-12') },
  ];

  private plans: ProductionPlan[] = [
    { id: 'plan-001', cycleId: 'cycle-001', fieldId: 'field-002', title: '番茄膨果期水肥调控', operationType: 'fertilizing', plannedDate: '2026-08-05', assignee: '王芳', plannedCost: 2200, plannedMaterial: '番茄专用水溶肥 35kg', status: 'planned', notes: '根据墒情调整分区灌溉时长', createdAt: iso('2026-08-01'), updatedAt: iso('2026-08-01'), completedAt: null },
    { id: 'plan-002', cycleId: 'cycle-002', fieldId: 'field-003', title: '玉米病斑复查与样方记录', operationType: 'scouting', plannedDate: '2026-08-05', assignee: '李明', plannedCost: 300, plannedMaterial: '采样袋 6 个', status: 'in_progress', notes: '复查已标记的 12 株样本', createdAt: iso('2026-08-03'), updatedAt: iso('2026-08-04'), completedAt: null },
    { id: 'plan-003', cycleId: 'cycle-003', fieldId: 'field-001', title: '冬小麦联合收获', operationType: 'harvest', plannedDate: '2026-06-09', assignee: '李明', plannedCost: 6800, plannedMaterial: '联合收割机外包', status: 'completed', notes: '完成测产和水分检测', createdAt: iso('2026-05-25'), updatedAt: iso('2026-06-09'), completedAt: iso('2026-06-09T18:00:00+08:00') },
  ];

  private operationLogs: OperationLog[] = [
    { id: 'operation-001', cycleId: 'cycle-003', planId: 'plan-003', fieldId: 'field-001', inventoryItemId: null, operationType: 'harvest', occurredAt: iso('2026-06-09T08:00:00+08:00'), executor: '李明', result: '完成 42.6 亩联合收获，籽粒水分 12.8%', laborHours: 18, cost: 6500, materialName: '', materialQuantity: 0, materialUnit: '', weather: '晴，微风', notes: '损失率抽测正常', createdAt: iso('2026-06-09T18:00:00+08:00') },
    { id: 'operation-002', cycleId: 'cycle-001', planId: null, fieldId: 'field-002', inventoryItemId: null, operationType: 'scouting', occurredAt: iso('2026-08-04T08:40:00+08:00'), executor: '王芳', result: '发现东侧末端滴灌压力偏低并登记问题', laborHours: 1.5, cost: 90, materialName: '', materialQuantity: 0, materialUnit: '', weather: '温室 31.8°C', notes: '已安排检查过滤器', createdAt: iso('2026-08-04T09:00:00+08:00') },
    { id: 'operation-003', cycleId: 'cycle-002', planId: null, fieldId: 'field-003', inventoryItemId: null, operationType: 'irrigation', occurredAt: iso('2026-08-02T06:30:00+08:00'), executor: '赵强', result: '完成分区灌溉 2.5 小时', laborHours: 1, cost: 460, materialName: '灌溉水', materialQuantity: 68, materialUnit: 'm³', weather: '多云', notes: '', createdAt: iso('2026-08-02T09:10:00+08:00') },
  ];

  private harvestBatches: HarvestBatch[] = [
    { id: 'harvest-001', batchCode: 'HB-2026-001', traceCode: 'TRACE-2026-WHEAT-001', cycleId: 'cycle-003', fieldId: 'field-001', product: '冬小麦', grade: '一等', quantity: 25780, unit: 'kg', harvestedAt: '2026-06-09', warehouse: '成品仓 W-01', qualityStatus: 'passed', inspector: '陈静', notes: '水分与容重检测合格', createdAt: iso('2026-06-09'), updatedAt: iso('2026-06-10') },
  ];

  private salesOrders: SalesOrder[] = [
    { id: 'sale-001', orderNo: 'SO-2026-001', harvestBatchId: 'harvest-001', customer: '焦作粮食储备库', quantity: 18000, unit: 'kg', unitPrice: 2.64, amount: 47520, soldAt: '2026-06-15', paymentStatus: 'paid', deliveryStatus: 'delivered', notes: '首批订单已完成交付', createdAt: iso('2026-06-12'), updatedAt: iso('2026-06-18') },
  ];

  private documents: ComplianceDocument[] = [
    { id: 'document-001', subjectId: 'subject-001', farmId: 'farm-001', fieldId: null, documentType: 'land', name: '北区土地经营权材料', documentNo: 'TD-2025-018', issueDate: '2025-09-01', expiryDate: '2029-08-31', status: 'valid', custodian: '陈静', filePath: '', notes: '纸质原件存档案柜 A-02', createdAt: iso('2025-09-01'), updatedAt: iso('2025-09-01') },
    { id: 'document-002', subjectId: 'subject-002', farmId: 'farm-002', fieldId: 'field-002', documentType: 'inspection', name: '番茄农残抽检报告', documentNo: 'JC-2026-0728', issueDate: '2026-07-28', expiryDate: '2026-08-28', status: 'expiring', custodian: '王芳', filePath: '', notes: '下批采收前安排复检', createdAt: iso('2026-07-28'), updatedAt: iso('2026-07-28') },
  ];

  private contracts: FarmContract[] = [
    { id: 'contract-001', subjectId: 'subject-001', farmId: 'farm-001', contractType: 'land_lease', contractNo: 'HT-TD-2025-001', title: '西区轮作田土地流转合同', counterparty: '西区村集体经济合作社', startDate: '2025-01-01', endDate: '2026-08-25', amount: 42000, status: 'active', reminderDays: 30, filePath: '', notes: '需在到期前确认续签面积', createdAt: iso('2025-01-01'), updatedAt: iso('2026-07-20') },
    { id: 'contract-002', subjectId: 'subject-002', farmId: 'farm-002', contractType: 'sales', contractNo: 'HT-XS-2026-008', title: '设施番茄订单销售合同', counterparty: '绿鲜供应链有限公司', startDate: '2026-05-01', endDate: '2026-10-31', amount: 320000, status: 'active', reminderDays: 30, filePath: '', notes: '按周交付并附批次检测报告', createdAt: iso('2026-04-22'), updatedAt: iso('2026-07-31') },
  ];

  constructor(
    private readonly database: LocalDatabase,
    private readonly agriculture: AgricultureService,
  ) {
    this.reloadFromDatabase();
  }

  reloadFromDatabase(): void {
    this.subjects = this.database.loadCollection('business_subjects', this.subjects);
    this.farms = this.database.loadCollection('farms', this.farms);
    this.cycles = this.database.loadCollection('crop_cycles', this.cycles);
    this.plans = this.database.loadCollection('production_plans', this.plans);
    this.operationLogs = this.database.loadCollection('operation_logs', this.operationLogs);
    this.harvestBatches = this.database.loadCollection('harvest_batches', this.harvestBatches);
    this.salesOrders = this.database.loadCollection('sales_orders', this.salesOrders);
    this.documents = this.database.loadCollection('compliance_documents', this.documents);
    this.contracts = this.database.loadCollection('farm_contracts', this.contracts);
  }

  getSubjects(): BusinessSubject[] { return [...this.subjects].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')); }
  getFarms(): Farm[] { return [...this.farms].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')); }
  getCycles(): CropCycle[] { return [...this.cycles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  getPlans(): ProductionPlan[] { return [...this.plans].sort((a, b) => a.plannedDate.localeCompare(b.plannedDate)); }
  getOperationLogs(): OperationLog[] { return [...this.operationLogs].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)); }
  getHarvestBatches(): HarvestBatch[] { return [...this.harvestBatches].sort((a, b) => b.harvestedAt.localeCompare(a.harvestedAt)); }
  getSalesOrders(): SalesOrder[] { return [...this.salesOrders].sort((a, b) => b.soldAt.localeCompare(a.soldAt)); }

  getDocuments(): ComplianceDocument[] {
    const today = this.localDateKey();
    const warningDate = this.addDays(today, 30);
    for (const document of this.documents) {
      const next = !document.expiryDate ? 'valid' : document.expiryDate < today ? 'expired' : document.expiryDate <= warningDate ? 'expiring' : 'valid';
      if (next !== document.status) {
        document.status = next;
        document.updatedAt = new Date().toISOString();
        this.database.put('compliance_documents', document);
      }
    }
    return [...this.documents].sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999'));
  }

  getContracts(): FarmContract[] {
    const today = this.localDateKey();
    for (const contract of this.contracts) {
      if (contract.status === 'active' && contract.endDate < today) {
        contract.status = 'expired';
        contract.updatedAt = new Date().toISOString();
        this.database.put('farm_contracts', contract);
      }
    }
    return [...this.contracts].sort((a, b) => a.endDate.localeCompare(b.endDate));
  }

  createSubject(body: unknown): BusinessSubject {
    const input = this.objectBody(body);
    const now = new Date().toISOString();
    const subject: BusinessSubject = {
      id: randomUUID(),
      name: this.required(input, 'name', 100),
      type: this.enumValue<SubjectType>(input, 'type', ['individual', 'family_farm', 'cooperative', 'company']),
      creditCode: this.optional(input, 'creditCode', 50),
      contact: this.required(input, 'contact', 40),
      phone: this.required(input, 'phone', 30),
      address: this.required(input, 'address', 200),
      status: 'active',
      notes: this.optional(input, 'notes', 500),
      createdAt: now,
      updatedAt: now,
    };
    this.database.transaction(() => {
      this.database.put('business_subjects', subject);
      this.database.appendAudit('subject', subject.id, 'create', `${subject.name}；联系人：${subject.contact}`);
    });
    this.subjects.push(subject);
    return subject;
  }

  updateSubjectStatus(id: string, body: unknown): BusinessSubject {
    const subject = this.requireSubject(id);
    const status = this.enumValue<ActiveStatus>(this.objectBody(body), 'status', ['active', 'inactive']);
    if (subject.status === status) return subject;
    if (status === 'inactive' && this.farms.some((farm) => farm.subjectId === id && farm.status === 'active')) {
      throw new HttpException('主体仍有启用中的农场，不能停用', HttpStatus.CONFLICT);
    }
    const updated = { ...subject, status, updatedAt: new Date().toISOString() };
    this.database.transaction(() => {
      this.database.put('business_subjects', updated);
      this.database.appendAudit('subject', id, `status:${status}`, subject.name);
    });
    Object.assign(subject, updated);
    return subject;
  }

  createFarm(body: unknown): Farm {
    const input = this.objectBody(body);
    const subjectId = this.required(input, 'subjectId', 100);
    const subject = this.requireSubject(subjectId);
    if (subject.status !== 'active') throw new HttpException('只能为启用中的经营主体创建农场', HttpStatus.CONFLICT);
    const now = new Date().toISOString();
    const farm: Farm = {
      id: randomUUID(), subjectId,
      name: this.required(input, 'name', 100),
      location: this.required(input, 'location', 200),
      totalArea: this.number(input, 'totalArea', 0.1, 1000000),
      manager: this.required(input, 'manager', 40),
      status: 'active',
      description: this.optional(input, 'description', 500),
      createdAt: now, updatedAt: now,
    };
    this.database.transaction(() => {
      this.database.put('farms', farm);
      this.database.appendAudit('farm', farm.id, 'create', `${farm.name}；负责人：${farm.manager}`);
    });
    this.farms.push(farm);
    return farm;
  }

  updateFarmStatus(id: string, body: unknown): Farm {
    const farm = this.requireFarm(id);
    const status = this.enumValue<ActiveStatus>(this.objectBody(body), 'status', ['active', 'inactive']);
    if (farm.status === status) return farm;
    if (status === 'active' && this.requireSubject(farm.subjectId).status !== 'active') {
      throw new HttpException('所属经营主体已停用，不能启用农场', HttpStatus.CONFLICT);
    }
    if (status === 'inactive') {
      const fieldIds = new Set(this.agriculture.getFields().filter((field) => field.farmId === id).map((field) => field.id));
      if (this.cycles.some((cycle) => fieldIds.has(cycle.fieldId) && ['planned', 'in_progress', 'harvesting'].includes(cycle.status))) {
        throw new HttpException('农场仍有未结束的种植季，不能停用', HttpStatus.CONFLICT);
      }
    }
    const updated = { ...farm, status, updatedAt: new Date().toISOString() };
    this.database.transaction(() => {
      this.database.put('farms', updated);
      this.database.appendAudit('farm', id, `status:${status}`, farm.name);
    });
    Object.assign(farm, updated);
    return farm;
  }

  createCycle(body: unknown): CropCycle {
    const input = this.objectBody(body);
    const fieldId = this.required(input, 'fieldId', 100);
    const field = this.findField(fieldId);
    const farm = this.requireFarm(field.farmId);
    const subject = this.requireSubject(farm.subjectId);
    if (farm.status !== 'active' || subject.status !== 'active') throw new HttpException('只能为启用主体下的启用农场建立种植季', HttpStatus.CONFLICT);
    const activeCycle = this.cycles.find((cycle) => cycle.fieldId === fieldId && ['planned', 'in_progress', 'harvesting'].includes(cycle.status));
    if (activeCycle) throw new HttpException(`该地块已有未结束种植季 ${activeCycle.code}，请先完成或取消`, HttpStatus.CONFLICT);
    const plannedStart = this.date(input, 'plannedStart');
    const plannedHarvest = this.date(input, 'plannedHarvest');
    if (plannedHarvest < plannedStart) throw new HttpException('计划采收日期不能早于计划开始日期', HttpStatus.BAD_REQUEST);
    const now = new Date().toISOString();
    let cycle!: CropCycle;
    this.database.transaction(() => {
      const sequence = this.nextSequence('crop_cycle_sequence', this.cycles.length);
      cycle = {
        id: randomUUID(), code: `CY-${new Date().getFullYear()}-${String(sequence).padStart(3, '0')}`,
        fieldId,
        crop: this.required(input, 'crop', 60),
        variety: this.optional(input, 'variety', 80),
        seasonYear: this.number(input, 'seasonYear', 2000, 2100),
        plannedStart, plannedHarvest,
        actualStart: null, actualHarvest: null,
        targetYield: this.number(input, 'targetYield', 0, 100000000),
        budget: this.number(input, 'budget', 0, 1000000000),
        manager: this.required(input, 'manager', 40),
        status: 'planned',
        notes: this.optional(input, 'notes', 800),
        createdAt: now, updatedAt: now,
      };
      this.database.put('crop_cycles', cycle);
      this.database.appendAudit('crop_cycle', cycle.id, 'create', `${cycle.code} ${cycle.crop}；负责人：${cycle.manager}`);
    });
    this.cycles.push(cycle);
    return cycle;
  }

  updateCycleStatus(id: string, body: unknown): CropCycle {
    const cycle = this.requireCycle(id);
    const status = this.enumValue<CropCycleStatus>(this.objectBody(body), 'status', ['planned', 'in_progress', 'harvesting', 'completed', 'cancelled']);
    if (cycle.status === status) return cycle;
    const transitions: Record<CropCycleStatus, readonly CropCycleStatus[]> = {
      planned: ['in_progress', 'cancelled'],
      in_progress: ['harvesting', 'cancelled'],
      harvesting: ['completed'],
      completed: [], cancelled: [],
    };
    if (!transitions[cycle.status].includes(status)) throw new HttpException(`种植季不能从 ${cycle.status} 变更为 ${status}`, HttpStatus.CONFLICT);
    if (status === 'in_progress') {
      const conflicting = this.cycles.find((item) => item.id !== id && item.fieldId === cycle.fieldId && ['planned', 'in_progress', 'harvesting'].includes(item.status));
      if (conflicting) throw new HttpException(`该地块已有未结束种植季 ${conflicting.code}，不能开季`, HttpStatus.CONFLICT);
    }
    const openPlans = this.plans.filter((plan) => plan.cycleId === id && ['planned', 'in_progress'].includes(plan.status));
    if (status === 'completed' && openPlans.length > 0) throw new HttpException('种植季仍有未结束的生产计划，不能结季', HttpStatus.CONFLICT);
    if (status === 'completed') {
      const harvests = this.harvestBatches.filter((batch) => batch.cycleId === id);
      if (harvests.length === 0) throw new HttpException('种植季尚未建立采收批次，不能结季', HttpStatus.CONFLICT);
      if (harvests.some((batch) => batch.qualityStatus === 'pending')) throw new HttpException('种植季仍有待质检采收批次，不能结季', HttpStatus.CONFLICT);
      if (!harvests.some((batch) => batch.qualityStatus === 'passed')) throw new HttpException('种植季没有质检合格的采收批次，不能结季', HttpStatus.CONFLICT);
    }
    const now = new Date().toISOString();
    const updated: CropCycle = {
      ...cycle, status, updatedAt: now,
      actualStart: status === 'in_progress' && !cycle.actualStart ? now : cycle.actualStart,
      actualHarvest: status === 'completed' ? now : cycle.actualHarvest,
    };
    const cancelledPlans = status === 'cancelled'
      ? openPlans.map((plan) => ({ ...plan, status: 'cancelled' as const, updatedAt: now, completedAt: null }))
      : [];
    this.database.transaction(() => {
      this.database.put('crop_cycles', updated);
      for (const plan of cancelledPlans) {
        this.database.put('production_plans', plan);
        this.database.appendAudit('production_plan', plan.id, 'status:cancelled', '种植季取消');
      }
      this.database.appendAudit('crop_cycle', id, `status:${status}`, cycle.code);
    });
    Object.assign(cycle, updated);
    for (const cancelled of cancelledPlans) Object.assign(this.requirePlan(cancelled.id), cancelled);
    return cycle;
  }

  createPlan(body: unknown): ProductionPlan {
    const input = this.objectBody(body);
    const cycleId = this.required(input, 'cycleId', 100);
    const cycle = this.requireCycle(cycleId);
    if (!['planned', 'in_progress'].includes(cycle.status)) throw new HttpException('只能为未开始或进行中的种植季创建计划', HttpStatus.CONFLICT);
    const now = new Date().toISOString();
    const plan: ProductionPlan = {
      id: randomUUID(), cycleId, fieldId: cycle.fieldId,
      title: this.required(input, 'title', 100),
      operationType: this.operationType(input),
      plannedDate: this.date(input, 'plannedDate'),
      assignee: this.required(input, 'assignee', 40),
      plannedCost: this.number(input, 'plannedCost', 0, 100000000),
      plannedMaterial: this.optional(input, 'plannedMaterial', 200),
      status: 'planned', notes: this.optional(input, 'notes', 500),
      createdAt: now, updatedAt: now, completedAt: null,
    };
    this.database.transaction(() => {
      this.database.put('production_plans', plan);
      this.database.appendAudit('production_plan', plan.id, 'create', `${plan.title}；负责人：${plan.assignee}`);
    });
    this.plans.push(plan);
    return plan;
  }

  updatePlanStatus(id: string, body: unknown): ProductionPlan {
    const plan = this.requirePlan(id);
    const status = this.enumValue<ProductionPlanStatus>(this.objectBody(body), 'status', ['in_progress', 'cancelled']);
    if (plan.status === status) return plan;
    const cycle = this.requireCycle(plan.cycleId);
    if (status !== 'cancelled' && !['in_progress', 'harvesting'].includes(cycle.status)) {
      throw new HttpException('种植季尚未开始或已经结束，不能执行生产计划', HttpStatus.CONFLICT);
    }
    const transitions: Record<ProductionPlanStatus, readonly ProductionPlanStatus[]> = {
      planned: ['in_progress', 'cancelled'],
      in_progress: ['cancelled'],
      completed: [], cancelled: [],
    };
    if (!transitions[plan.status].includes(status)) throw new HttpException(`生产计划不能从 ${plan.status} 变更为 ${status}`, HttpStatus.CONFLICT);
    const now = new Date().toISOString();
    const updated = { ...plan, status, updatedAt: now, completedAt: null };
    this.database.transaction(() => {
      this.database.put('production_plans', updated);
      this.database.appendAudit('production_plan', id, `status:${status}`, plan.title);
    });
    Object.assign(plan, updated);
    return plan;
  }

  createOperationLog(body: unknown): OperationLog {
    const input = this.objectBody(body);
    const cycleId = this.required(input, 'cycleId', 100);
    const cycle = this.requireCycle(cycleId);
    if (!['in_progress', 'harvesting'].includes(cycle.status)) throw new HttpException('种植季尚未开始或已经结束，不能登记农事实绩', HttpStatus.CONFLICT);
    const planId = this.optional(input, 'planId', 100);
    const plan = planId ? this.requirePlan(planId) : undefined;
    if (plan && (plan.cycleId !== cycleId || ['completed', 'cancelled'].includes(plan.status))) throw new HttpException('关联计划不属于该种植季或已结束', HttpStatus.CONFLICT);
    const operationType = this.operationType(input);
    if (plan && plan.operationType !== operationType) throw new HttpException('农事实绩类型必须与关联计划一致', HttpStatus.CONFLICT);
    const occurred = this.dateTime(input, 'occurredAt');
    const occurredAt = occurred.value;
    const cycleStartDate = cycle.actualStart ? this.localDateTimeKey(cycle.actualStart) : cycle.plannedStart;
    if (occurred.date < cycleStartDate) throw new HttpException('执行时间不能早于种植季实际开始日期', HttpStatus.BAD_REQUEST);
    if (occurred.date > this.localDateKey()) throw new HttpException('执行时间不能晚于当前日期', HttpStatus.BAD_REQUEST);
    const inventoryItemId = this.optional(input, 'inventoryItemId', 100);
    const materialQuantity = this.number(input, 'materialQuantity', 0, 100000000);
    const inventoryItem = inventoryItemId ? this.agriculture.getInventory().find((item) => item.id === inventoryItemId) : undefined;
    if (inventoryItemId && !inventoryItem) throw new NotFoundException(`库存项目 ${inventoryItemId} 不存在`);
    if (inventoryItemId && materialQuantity <= 0) throw new HttpException('选择库存农资后，领用数量必须大于 0', HttpStatus.BAD_REQUEST);
    if (!inventoryItemId && materialQuantity > 0) throw new HttpException('登记物料数量前必须选择库存农资', HttpStatus.BAD_REQUEST);
    const log: OperationLog = {
      id: randomUUID(), cycleId, planId: planId || null, fieldId: cycle.fieldId, inventoryItemId: inventoryItemId || null,
      operationType,
      occurredAt,
      executor: this.required(input, 'executor', 40),
      result: this.required(input, 'result', 800),
      laborHours: this.number(input, 'laborHours', 0, 10000),
      cost: this.number(input, 'cost', 0, 100000000),
      materialName: inventoryItem?.name || '',
      materialQuantity,
      materialUnit: inventoryItem?.unit || '',
      weather: this.optional(input, 'weather', 100),
      notes: this.optional(input, 'notes', 500),
      createdAt: new Date().toISOString(),
    };
    const updatedPlan = plan ? { ...plan, status: 'completed' as const, updatedAt: log.createdAt, completedAt: log.createdAt } : undefined;
    const persistProductionRecord = () => {
      this.database.put('operation_logs', log);
      if (updatedPlan) this.database.put('production_plans', updatedPlan);
      this.database.appendAudit('operation_log', log.id, 'create', `${log.result}；执行人：${log.executor}`);
    };
    if (inventoryItem) {
      this.agriculture.recordProductionUsage({
        itemId: inventoryItem.id,
        quantity: materialQuantity,
        fieldId: cycle.fieldId,
        operator: log.executor,
        reference: `农事实绩 ${log.id}`,
        notes: `${cycle.code} ${operationType}`,
      }, persistProductionRecord);
    } else {
      this.database.transaction(persistProductionRecord);
    }
    this.operationLogs.unshift(log);
    if (plan && updatedPlan) Object.assign(plan, updatedPlan);
    return log;
  }

  createHarvestBatch(body: unknown): HarvestBatch {
    const input = this.objectBody(body);
    const cycleId = this.required(input, 'cycleId', 100);
    const cycle = this.requireCycle(cycleId);
    if (!['in_progress', 'harvesting'].includes(cycle.status)) throw new HttpException('只能从进行中或采收中的种植季建立采收批次', HttpStatus.CONFLICT);
    const now = new Date().toISOString();
    const harvestedAt = this.date(input, 'harvestedAt');
    const cycleStartDate = cycle.actualStart ? this.localDateTimeKey(cycle.actualStart) : cycle.plannedStart;
    if (harvestedAt < cycleStartDate) throw new HttpException('采收日期不能早于种植季实际开始日期', HttpStatus.BAD_REQUEST);
    if (harvestedAt > this.localDateKey()) throw new HttpException('采收日期不能晚于当前日期', HttpStatus.BAD_REQUEST);
    let batch!: HarvestBatch;
    const updatedCycle = cycle.status === 'in_progress' ? { ...cycle, status: 'harvesting' as const, updatedAt: now } : undefined;
    this.database.transaction(() => {
      const sequence = this.nextSequence('harvest_batch_sequence', this.harvestBatches.length);
      batch = {
        id: randomUUID(), batchCode: `HB-${new Date().getFullYear()}-${String(sequence).padStart(3, '0')}`,
        traceCode: `TRACE-${new Date().getFullYear()}-${String(sequence).padStart(6, '0')}`,
        cycleId, fieldId: cycle.fieldId, product: cycle.crop,
        grade: this.optional(input, 'grade', 40),
        quantity: this.roundQuantity(this.number(input, 'quantity', 0.01, 100000000)),
        unit: this.required(input, 'unit', 20),
        harvestedAt,
        warehouse: this.required(input, 'warehouse', 100),
        qualityStatus: 'pending', inspector: '',
        notes: this.optional(input, 'notes', 500), createdAt: now, updatedAt: now,
      };
      this.database.put('harvest_batches', batch);
      if (updatedCycle) this.database.put('crop_cycles', updatedCycle);
      this.database.appendAudit('harvest_batch', batch.id, 'create', `${batch.batchCode} ${batch.quantity}${batch.unit}`);
    });
    this.harvestBatches.unshift(batch);
    if (updatedCycle) Object.assign(cycle, updatedCycle);
    return batch;
  }

  updateHarvestQuality(id: string, body: unknown): HarvestBatch {
    const batch = this.requireHarvest(id);
    if (batch.qualityStatus !== 'pending') throw new HttpException('该采收批次已经完成质检', HttpStatus.CONFLICT);
    const input = this.objectBody(body);
    const qualityStatus = this.enumValue<'passed' | 'rejected'>(input, 'qualityStatus', ['passed', 'rejected']);
    const inspector = this.required(input, 'inspector', 40);
    const updated = { ...batch, qualityStatus, inspector, notes: this.optional(input, 'notes', 500) || batch.notes, updatedAt: new Date().toISOString() };
    this.database.transaction(() => {
      this.database.put('harvest_batches', updated);
      this.database.appendAudit('harvest_batch', id, `quality:${qualityStatus}`, `${updated.notes}；质检人：${inspector}`);
    });
    Object.assign(batch, updated);
    return batch;
  }

  createSalesOrder(body: unknown): SalesOrder {
    const input = this.objectBody(body);
    const harvestBatchId = this.required(input, 'harvestBatchId', 100);
    const batch = this.requireHarvest(harvestBatchId);
    if (batch.qualityStatus !== 'passed') throw new HttpException('采收批次质检合格后才能销售', HttpStatus.CONFLICT);
    const quantity = this.roundQuantity(this.number(input, 'quantity', 0.01, 100000000));
    const soldUnits = this.salesOrders.filter((sale) => sale.harvestBatchId === harvestBatchId).reduce((sum, sale) => sum + this.quantityUnits(sale.quantity), 0);
    const availableUnits = this.quantityUnits(batch.quantity) - soldUnits;
    if (this.quantityUnits(quantity) > availableUnits) throw new HttpException(`可销售余量仅为 ${availableUnits / 10000} ${batch.unit}`, HttpStatus.CONFLICT);
    const unitPrice = this.number(input, 'unitPrice', 0, 10000000);
    const soldAt = this.date(input, 'soldAt');
    if (soldAt < batch.harvestedAt) throw new HttpException('销售日期不能早于采收日期', HttpStatus.BAD_REQUEST);
    if (soldAt > this.localDateKey()) throw new HttpException('销售日期不能晚于当前日期', HttpStatus.BAD_REQUEST);
    const now = new Date().toISOString();
    let sale!: SalesOrder;
    this.database.transaction(() => {
      const sequence = this.nextSequence('sales_order_sequence', this.salesOrders.length);
      sale = {
        id: randomUUID(), orderNo: `SO-${new Date().getFullYear()}-${String(sequence).padStart(3, '0')}`,
        harvestBatchId, customer: this.required(input, 'customer', 100), quantity, unit: batch.unit,
        unitPrice, amount: Number((quantity * unitPrice).toFixed(2)), soldAt,
        paymentStatus: 'unpaid', deliveryStatus: 'pending', notes: this.optional(input, 'notes', 500),
        createdAt: now, updatedAt: now,
      };
      this.database.put('sales_orders', sale);
      this.database.appendAudit('sales_order', sale.id, 'create', `${sale.orderNo} ${sale.customer}`);
    });
    this.salesOrders.unshift(sale);
    return sale;
  }

  updateSalesStatus(id: string, body: unknown): SalesOrder {
    const sale = this.salesOrders.find((item) => item.id === id);
    if (!sale) throw new NotFoundException(`销售订单 ${id} 不存在`);
    const input = this.objectBody(body);
    const paymentStatus = input.paymentStatus === undefined ? sale.paymentStatus : this.enumValue<SalesOrder['paymentStatus']>(input, 'paymentStatus', ['unpaid', 'partial', 'paid']);
    const deliveryStatus = input.deliveryStatus === undefined ? sale.deliveryStatus : this.enumValue<SalesOrder['deliveryStatus']>(input, 'deliveryStatus', ['pending', 'delivered']);
    if (sale.paymentStatus === 'paid' && paymentStatus !== 'paid') throw new HttpException('已收款订单不能回退收款状态', HttpStatus.CONFLICT);
    if (sale.deliveryStatus === 'delivered' && deliveryStatus !== 'delivered') throw new HttpException('已交付订单不能回退交付状态', HttpStatus.CONFLICT);
    const updated = { ...sale, paymentStatus, deliveryStatus, updatedAt: new Date().toISOString() };
    this.database.transaction(() => {
      this.database.put('sales_orders', updated);
      this.database.appendAudit('sales_order', id, 'update_status', `${paymentStatus}/${deliveryStatus}`);
    });
    Object.assign(sale, updated);
    return sale;
  }

  getTrace(code: string): TraceResult {
    const batch = this.harvestBatches.find((item) => item.traceCode === code || item.batchCode === code);
    if (!batch) throw new NotFoundException(`追溯码 ${code} 不存在`);
    const cycle = this.requireCycle(batch.cycleId);
    return {
      batch, cycle,
      operations: this.operationLogs
        .filter((log) => log.cycleId === cycle.id && this.localDateTimeKey(log.occurredAt) <= batch.harvestedAt)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
      sales: this.salesOrders.filter((sale) => sale.harvestBatchId === batch.id),
    };
  }

  createDocument(body: unknown): ComplianceDocument {
    const input = this.objectBody(body);
    const subjectId = this.optional(input, 'subjectId', 100) || null;
    const farmId = this.optional(input, 'farmId', 100) || null;
    const fieldId = this.optional(input, 'fieldId', 100) || null;
    const farm = farmId ? this.requireFarm(farmId) : undefined;
    const field = fieldId ? this.findField(fieldId) : undefined;
    if (subjectId) this.requireSubject(subjectId);
    if (subjectId && farm && farm.subjectId !== subjectId) throw new HttpException('农场不属于所选经营主体', HttpStatus.CONFLICT);
    if (farm && field && field.farmId !== farm.id) throw new HttpException('地块不属于所选农场', HttpStatus.CONFLICT);
    if (subjectId && field) {
      const fieldFarm = this.requireFarm(field.farmId);
      if (fieldFarm.subjectId !== subjectId) throw new HttpException('地块不属于所选经营主体', HttpStatus.CONFLICT);
    }
    const issueDate = this.optionalDate(input, 'issueDate');
    const expiryDate = this.optionalDate(input, 'expiryDate');
    if (issueDate && expiryDate && expiryDate < issueDate) throw new HttpException('有效期不能早于签发日期', HttpStatus.BAD_REQUEST);
    const now = new Date().toISOString();
    const document: ComplianceDocument = {
      id: randomUUID(), subjectId, farmId, fieldId,
      documentType: this.enumValue<ComplianceDocument['documentType']>(input, 'documentType', ['land', 'inspection', 'input_invoice', 'certification', 'insurance', 'other']),
      name: this.required(input, 'name', 120), documentNo: this.optional(input, 'documentNo', 80),
      issueDate, expiryDate, status: 'valid', custodian: this.required(input, 'custodian', 40),
      filePath: this.optional(input, 'filePath', 500), notes: this.optional(input, 'notes', 500),
      createdAt: now, updatedAt: now,
    };
    this.database.transaction(() => {
      this.database.put('compliance_documents', document);
      this.database.appendAudit('document', document.id, 'archive', `${document.name}；保管人：${document.custodian}`);
    });
    this.documents.push(document);
    return this.getDocuments().find((item) => item.id === document.id)!;
  }

  createContract(body: unknown): FarmContract {
    const input = this.objectBody(body);
    const subjectId = this.optional(input, 'subjectId', 100) || null;
    const farmId = this.optional(input, 'farmId', 100) || null;
    const farm = farmId ? this.requireFarm(farmId) : undefined;
    if (subjectId) this.requireSubject(subjectId);
    if (subjectId && farm && farm.subjectId !== subjectId) throw new HttpException('农场不属于所选经营主体', HttpStatus.CONFLICT);
    const startDate = this.date(input, 'startDate');
    const endDate = this.date(input, 'endDate');
    if (endDate < startDate) throw new HttpException('合同结束日期不能早于开始日期', HttpStatus.BAD_REQUEST);
    const now = new Date().toISOString();
    const contract: FarmContract = {
      id: randomUUID(), subjectId, farmId,
      contractType: this.enumValue<FarmContract['contractType']>(input, 'contractType', ['land_lease', 'purchase', 'outsource', 'sales', 'insurance', 'other']),
      contractNo: this.required(input, 'contractNo', 80), title: this.required(input, 'title', 120),
      counterparty: this.required(input, 'counterparty', 120), startDate, endDate,
      amount: this.number(input, 'amount', 0, 10000000000), status: 'draft',
      reminderDays: this.number(input, 'reminderDays', 1, 365), filePath: this.optional(input, 'filePath', 500),
      notes: this.optional(input, 'notes', 500), createdAt: now, updatedAt: now,
    };
    if (this.contracts.some((item) => item.contractNo === contract.contractNo)) throw new HttpException('合同编号已存在', HttpStatus.CONFLICT);
    this.database.transaction(() => {
      this.database.put('farm_contracts', contract);
      this.database.appendAudit('contract', contract.id, 'create', contract.contractNo);
    });
    this.contracts.push(contract);
    return contract;
  }

  updateContractStatus(id: string, body: unknown): FarmContract {
    const contract = this.contracts.find((item) => item.id === id);
    if (!contract) throw new NotFoundException(`合同 ${id} 不存在`);
    const status = this.enumValue<FarmContract['status']>(this.objectBody(body), 'status', ['draft', 'active', 'expired', 'terminated']);
    if (contract.status === status) return contract;
    const transitions: Record<FarmContract['status'], readonly FarmContract['status'][]> = {
      draft: ['active', 'terminated'], active: ['terminated'], expired: [], terminated: [],
    };
    if (!transitions[contract.status].includes(status)) throw new HttpException(`合同不能从 ${contract.status} 变更为 ${status}`, HttpStatus.CONFLICT);
    const updated = { ...contract, status, updatedAt: new Date().toISOString() };
    this.database.transaction(() => {
      this.database.put('farm_contracts', updated);
      this.database.appendAudit('contract', id, `status:${status}`, contract.contractNo);
    });
    Object.assign(contract, updated);
    return contract;
  }

  private requireSubject(id: string): BusinessSubject {
    const subject = this.subjects.find((item) => item.id === id);
    if (!subject) throw new NotFoundException(`经营主体 ${id} 不存在`);
    return subject;
  }
  private requireFarm(id: string): Farm {
    const farm = this.farms.find((item) => item.id === id);
    if (!farm) throw new NotFoundException(`农场 ${id} 不存在`);
    return farm;
  }
  private requireField(id: string): void {
    this.findField(id);
  }
  private findField(id: string): ReturnType<AgricultureService['getFields']>[number] {
    const field = this.agriculture.getFields().find((item) => item.id === id);
    if (!field) throw new NotFoundException(`地块 ${id} 不存在`);
    return field;
  }
  private requireCycle(id: string): CropCycle {
    const cycle = this.cycles.find((item) => item.id === id);
    if (!cycle) throw new NotFoundException(`种植季 ${id} 不存在`);
    return cycle;
  }
  private requirePlan(id: string): ProductionPlan {
    const plan = this.plans.find((item) => item.id === id);
    if (!plan) throw new NotFoundException(`生产计划 ${id} 不存在`);
    return plan;
  }
  private requireHarvest(id: string): HarvestBatch {
    const batch = this.harvestBatches.find((item) => item.id === id);
    if (!batch) throw new NotFoundException(`采收批次 ${id} 不存在`);
    return batch;
  }
  private nextSequence(key: string, initial: number): number {
    const next = Number(this.database.getOrCreateMetadata(key, () => String(initial))) + 1;
    this.database.setMetadata(key, String(next));
    return next;
  }
  private objectBody(body: unknown): Record<string, unknown> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpException('请求体必须是 JSON 对象', HttpStatus.BAD_REQUEST);
    return body as Record<string, unknown>;
  }
  private required(input: Record<string, unknown>, key: string, max: number): string {
    const value = input[key];
    if (typeof value !== 'string' || !value.trim()) throw new HttpException(`${key} 必须是非空字符串`, HttpStatus.BAD_REQUEST);
    if (value.trim().length > max) throw new HttpException(`${key} 长度不能超过 ${max}`, HttpStatus.BAD_REQUEST);
    return value.trim();
  }
  private optional(input: Record<string, unknown>, key: string, max: number): string {
    const value = input[key];
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') throw new HttpException(`${key} 必须是字符串`, HttpStatus.BAD_REQUEST);
    if (value.trim().length > max) throw new HttpException(`${key} 长度不能超过 ${max}`, HttpStatus.BAD_REQUEST);
    return value.trim();
  }
  private number(input: Record<string, unknown>, key: string, min: number, max: number): number {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new HttpException(`${key} 必须是 ${min} 到 ${max} 之间的数字`, HttpStatus.BAD_REQUEST);
    return value;
  }
  private enumValue<T extends string>(input: Record<string, unknown>, key: string, values: readonly T[]): T {
    const value = input[key];
    if (typeof value !== 'string' || !values.includes(value as T)) throw new HttpException(`${key} 必须是 ${values.join('、')} 之一`, HttpStatus.BAD_REQUEST);
    return value as T;
  }
  private operationType(input: Record<string, unknown>): OperationType {
    return this.enumValue<OperationType>(input, 'operationType', ['tillage', 'sowing', 'irrigation', 'fertilizing', 'pesticide', 'scouting', 'harvest', 'other']);
  }
  private date(input: Record<string, unknown>, key: string): string {
    return this.validDateKey(this.required(input, key, 30), key);
  }
  private optionalDate(input: Record<string, unknown>, key: string): string | null {
    const value = this.optional(input, key, 30);
    if (!value) return null;
    return this.validDateKey(value, key);
  }
  private dateTime(input: Record<string, unknown>, key: string): { value: string; date: string } {
    const value = this.required(input, key, 40);
    const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?$/.exec(value);
    if (!match) throw new HttpException(`${key} 必须是有效日期时间`, HttpStatus.BAD_REQUEST);
    this.validDateKey(match[1], key);
    if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59 || Number.isNaN(Date.parse(value))) {
      throw new HttpException(`${key} 必须是有效日期时间`, HttpStatus.BAD_REQUEST);
    }
    return { value: new Date(value).toISOString(), date: match[1] };
  }
  private localDateKey(): string {
    const value = new Date();
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  private localDateTimeKey(value: string): string {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  private addDays(date: string, days: number): string {
    const value = new Date(`${date}T12:00:00`);
    value.setDate(value.getDate() + days);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
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
  private roundQuantity(value: number): number { return this.quantityUnits(value) / 10000; }
  private quantityUnits(value: number): number { return Math.round((value + Number.EPSILON) * 10000); }
}
