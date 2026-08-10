import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { LocalDatabase } from './local-database'
import type {
  Barn, BarnStatus, FeedingRecord, HealthRecordType, LivestockBatch, LivestockBatchStatus,
  LivestockExitRecord, LivestockHealthRecord, LivestockSpecies, LivestockSummary,
} from './livestock.types'

const now = () => new Date().toISOString()
const iso = (value: string) => new Date(value).toISOString()
const dateKey = (value: string | Date) => { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }

@Injectable()
export class LivestockService {
  private barns: Barn[] = [
    { id: 'barn-001', farmId: 'farm-001', name: '东区育肥牛舍', code: 'CATTLE-A', species: 'cattle', capacity: 120, manager: '周牧', location: '丰域农场东区', status: 'active', temperature: 21.8, humidity: 61, createdAt: iso('2026-01-10'), updatedAt: iso('2026-08-09') },
    { id: 'barn-002', farmId: 'farm-001', name: '南区保育猪舍', code: 'PIG-B', species: 'pig', capacity: 300, manager: '郑安', location: '丰域农场南区', status: 'active', temperature: 25.4, humidity: 68, createdAt: iso('2026-02-06'), updatedAt: iso('2026-08-09') },
    { id: 'barn-003', farmId: 'farm-002', name: '西区隔离舍', code: 'ISO-01', species: 'sheep', capacity: 60, manager: '周牧', location: '河畔园区西侧', status: 'maintenance', temperature: 23.1, humidity: 64, createdAt: iso('2026-04-12'), updatedAt: iso('2026-08-08') },
  ]
  private batches: LivestockBatch[] = [
    { id: 'batch-001', barnId: 'barn-001', code: 'NC-2026-03', species: 'cattle', breed: '西门塔尔杂交牛', quantity: 86, averageWeight: 412.5, entryDate: '2026-03-18', targetExitDate: '2026-10-20', manager: '周牧', status: 'active', createdAt: iso('2026-03-18'), updatedAt: iso('2026-08-09') },
    { id: 'batch-002', barnId: 'barn-002', code: 'PIG-2026-06', species: 'pig', breed: '杜长大三元猪', quantity: 228, averageWeight: 48.2, entryDate: '2026-06-02', targetExitDate: '2026-11-10', manager: '郑安', status: 'active', createdAt: iso('2026-06-02'), updatedAt: iso('2026-08-09') },
    { id: 'batch-003', barnId: 'barn-003', code: 'SHEEP-Q08', species: 'sheep', breed: '湖羊', quantity: 18, averageWeight: 31.4, entryDate: '2026-08-05', targetExitDate: '2026-12-18', manager: '周牧', status: 'quarantine', createdAt: iso('2026-08-05'), updatedAt: iso('2026-08-09') },
  ]
  private feeding: FeedingRecord[] = [
    { id: 'feed-001', batchId: 'batch-001', feedName: '育肥牛全混合日粮', quantityKg: 1548, fedAt: iso('2026-08-10T06:30:00+08:00'), operator: '周牧', notes: '采食正常', createdAt: iso('2026-08-10T06:40:00+08:00') },
    { id: 'feed-002', batchId: 'batch-002', feedName: '中猪配合饲料', quantityKg: 684, fedAt: iso('2026-08-10T07:00:00+08:00'), operator: '郑安', notes: '自动料线运行正常', createdAt: iso('2026-08-10T07:05:00+08:00') },
  ]
  private health: LivestockHealthRecord[] = [
    { id: 'health-001', batchId: 'batch-001', type: 'vaccination', title: '口蹄疫疫苗加强免疫', occurredAt: '2026-07-16', affectedQuantity: 86, veterinarian: '吴医生', nextDueDate: '2026-10-16', notes: '批次免疫完成', createdAt: iso('2026-07-16') },
    { id: 'health-002', batchId: 'batch-003', type: 'inspection', title: '入场隔离检疫', occurredAt: '2026-08-05', affectedQuantity: 18, veterinarian: '吴医生', nextDueDate: '2026-08-12', notes: '等待复检后转群', createdAt: iso('2026-08-05') },
  ]
  private exits: LivestockExitRecord[] = []

  constructor(private readonly database: LocalDatabase) {
    this.barns = database.loadCollection('livestock_barns', this.barns)
    this.batches = database.loadCollection('livestock_batches', this.batches)
    this.feeding = database.loadCollection('livestock_feeding', this.feeding)
    this.health = database.loadCollection('livestock_health', this.health)
    this.exits = database.loadCollection('livestock_exits', this.exits)
  }

  summary(): LivestockSummary {
    const today = dateKey(new Date())
    const month = today.slice(0, 7)
    return {
      barns: this.barns.filter((item) => item.status === 'active').length,
      activeBatches: this.batches.filter((item) => item.status !== 'exited').length,
      currentAnimals: this.batches.filter((item) => item.status !== 'exited').reduce((sum, item) => sum + item.quantity, 0),
      quarantineBatches: this.batches.filter((item) => item.status === 'quarantine').length,
      feedTodayKg: this.feeding.filter((item) => dateKey(item.fedAt) === today).reduce((sum, item) => sum + item.quantityKg, 0),
      healthDue: this.health.filter((item) => item.nextDueDate && item.nextDueDate <= today).length,
      exitedThisMonth: this.exits.filter((item) => item.exitedAt.startsWith(month)).reduce((sum, item) => sum + item.quantity, 0),
    }
  }

  listBarns() { return this.barns }
  listBatches() { return this.batches }
  listFeeding() { return [...this.feeding].sort((a, b) => b.fedAt.localeCompare(a.fedAt)) }
  listHealth() { return [...this.health].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)) }
  listExits() { return [...this.exits].sort((a, b) => b.exitedAt.localeCompare(a.exitedAt)) }

  createBarn(body: unknown): Barn {
    const input = this.body(body)
    const farmId = this.text(input, 'farmId')
    if (!this.database.hasEntity('farms', farmId)) throw new NotFoundException('所属农场不存在')
    const code = this.text(input, 'code')
    if (this.barns.some((item) => item.code.toLowerCase() === code.toLowerCase())) throw new BadRequestException('圈舍编号已存在')
    const createdAt = now()
    const barn: Barn = {
      id: randomUUID(), farmId, name: this.text(input, 'name'), code,
      species: this.choice<LivestockSpecies>(input, 'species', ['cattle', 'pig', 'sheep', 'chicken', 'duck']),
      capacity: this.number(input, 'capacity', 1, 1_000_000), manager: this.text(input, 'manager'), location: this.text(input, 'location'),
      status: 'active', temperature: this.number(input, 'temperature', -30, 60), humidity: this.number(input, 'humidity', 0, 100), createdAt, updatedAt: createdAt,
    }
    this.persist('livestock_barns', barn, 'barn', `新增圈舍“${barn.name}”`)
    this.barns.push(barn)
    return barn
  }

  updateBarnStatus(id: string, body: unknown): Barn {
    const barn = this.requireBarn(id)
    barn.status = this.choice<BarnStatus>(this.body(body), 'status', ['active', 'maintenance', 'empty'])
    barn.updatedAt = now()
    this.persist('livestock_barns', barn, 'barn', `更新圈舍状态：${barn.status}`)
    return barn
  }

  createBatch(body: unknown): LivestockBatch {
    const input = this.body(body)
    const code = this.text(input, 'code')
    if (this.batches.some((item) => item.code.toLowerCase() === code.toLowerCase())) throw new BadRequestException('养殖批次编号已存在')
    const barn = this.requireBarn(this.text(input, 'barnId'))
    if (barn.status !== 'active') throw new BadRequestException('只能向启用圈舍添加养殖批次')
    const species = this.choice<LivestockSpecies>(input, 'species', ['cattle', 'pig', 'sheep', 'chicken', 'duck'])
    if (species !== barn.species) throw new BadRequestException('养殖批次物种与圈舍用途不一致')
    const quantity = this.number(input, 'quantity', 1, 1_000_000)
    const occupied = this.batches.filter((item) => item.barnId === barn.id && item.status !== 'exited').reduce((sum, item) => sum + item.quantity, 0)
    if (occupied + quantity > barn.capacity) throw new BadRequestException('批次数量超过圈舍剩余容量')
    const entryDate = this.date(input, 'entryDate')
    const targetExitDate = this.date(input, 'targetExitDate')
    if (targetExitDate < entryDate) throw new BadRequestException('预计出栏日期不能早于入场日期')
    const createdAt = now()
    const batch: LivestockBatch = {
      id: randomUUID(), barnId: barn.id, code, species, breed: this.text(input, 'breed'), quantity,
      averageWeight: this.number(input, 'averageWeight', 0.01, 10_000), entryDate, targetExitDate, manager: this.text(input, 'manager'),
      status: this.choice<LivestockBatchStatus>(input, 'status', ['active', 'quarantine']), createdAt, updatedAt: createdAt,
    }
    this.persist('livestock_batches', batch, 'livestock_batch', `新增养殖批次“${batch.code}”`)
    this.batches.push(batch)
    return batch
  }

  updateBatchStatus(id: string, body: unknown): LivestockBatch {
    const batch = this.requireBatch(id)
    const status = this.choice<LivestockBatchStatus>(this.body(body), 'status', ['active', 'quarantine', 'exited'])
    if (status === 'exited' && batch.quantity > 0) throw new BadRequestException('仍有存栏时不能直接结束批次，请先登记出栏')
    batch.status = status
    batch.updatedAt = now()
    this.persist('livestock_batches', batch, 'livestock_batch', `更新批次状态：${status}`)
    return batch
  }

  createFeeding(body: unknown): FeedingRecord {
    const input = this.body(body)
    const batch = this.requireActiveBatch(this.text(input, 'batchId'))
    const record: FeedingRecord = { id: randomUUID(), batchId: batch.id, feedName: this.text(input, 'feedName'), quantityKg: this.number(input, 'quantityKg', 0.01, 1_000_000), fedAt: this.datetime(input, 'fedAt'), operator: this.text(input, 'operator'), notes: this.optional(input, 'notes'), createdAt: now() }
    this.persist('livestock_feeding', record, 'livestock_feeding', `登记饲喂：${record.feedName} ${record.quantityKg}kg`)
    this.feeding.push(record)
    return record
  }

  createHealth(body: unknown): LivestockHealthRecord {
    const input = this.body(body)
    const batch = this.requireActiveBatch(this.text(input, 'batchId'))
    const affectedQuantity = this.number(input, 'affectedQuantity', 1, batch.quantity)
    const type = this.choice<HealthRecordType>(input, 'type', ['vaccination', 'medication', 'inspection', 'disinfection', 'mortality'])
    const record: LivestockHealthRecord = {
      id: randomUUID(), batchId: batch.id,
      type,
      title: this.text(input, 'title'), occurredAt: this.date(input, 'occurredAt'), affectedQuantity,
      veterinarian: this.text(input, 'veterinarian'), nextDueDate: this.optionalDate(input, 'nextDueDate'), notes: this.optional(input, 'notes'), createdAt: now(),
    }
    if (type === 'mortality') {
      batch.quantity -= affectedQuantity
      if (batch.quantity === 0) batch.status = 'exited'
      batch.updatedAt = now()
      this.database.transaction(() => {
        this.database.put('livestock_health', record)
        this.database.put('livestock_batches', batch)
        this.database.appendAudit('livestock_health', record.id, 'create', `登记死亡事件“${record.title}”；数量 ${affectedQuantity}`)
      })
    } else {
      this.persist('livestock_health', record, 'livestock_health', `登记健康事件“${record.title}”`)
    }
    this.health.push(record)
    return record
  }

  createExit(body: unknown): LivestockExitRecord {
    const input = this.body(body)
    const batch = this.requireActiveBatch(this.text(input, 'batchId'))
    const quantity = this.number(input, 'quantity', 1, batch.quantity)
    const record: LivestockExitRecord = {
      id: randomUUID(), batchId: batch.id, quantity, averageWeight: this.number(input, 'averageWeight', 0.01, 10_000),
      destination: this.text(input, 'destination'), exitedAt: this.date(input, 'exitedAt'), traceCode: `LIVE-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      inspector: this.text(input, 'inspector'), notes: this.optional(input, 'notes'), createdAt: now(),
    }
    batch.quantity -= quantity
    if (batch.quantity === 0) batch.status = 'exited'
    batch.updatedAt = now()
    this.database.transaction(() => {
      this.database.put('livestock_exits', record)
      this.database.put('livestock_batches', batch)
      this.database.appendAudit('livestock_exit', record.id, 'create', `批次 ${batch.code} 出栏 ${quantity} 头/只`)
    })
    this.exits.push(record)
    return record
  }

  private persist(collection: string, entity: { id: string }, domain: string, detail: string) {
    this.database.transaction(() => { this.database.put(collection, entity); this.database.appendAudit(domain, entity.id, 'create', detail) })
  }
  private requireBarn(id: string) { const item = this.barns.find((row) => row.id === id); if (!item) throw new NotFoundException('圈舍不存在'); return item }
  private requireBatch(id: string) { const item = this.batches.find((row) => row.id === id); if (!item) throw new NotFoundException('养殖批次不存在'); return item }
  private requireActiveBatch(id: string) { const item = this.requireBatch(id); if (item.status === 'exited') throw new BadRequestException('已结束批次不能新增记录'); return item }
  private body(body: unknown): Record<string, unknown> { if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('请求数据格式无效'); return body as Record<string, unknown> }
  private text(input: Record<string, unknown>, key: string) { const value = typeof input[key] === 'string' ? input[key].trim() : ''; if (!value || value.length > 100) throw new BadRequestException(`${key} 无效`); return value }
  private optional(input: Record<string, unknown>, key: string) { const value = input[key]; if (value === undefined || value === null) return ''; if (typeof value !== 'string' || value.length > 500) throw new BadRequestException(`${key} 无效`); return value.trim() }
  private number(input: Record<string, unknown>, key: string, min: number, max: number) { const value = Number(input[key]); if (!Number.isFinite(value) || value < min || value > max) throw new BadRequestException(`${key} 超出范围`); return value }
  private choice<T extends string>(input: Record<string, unknown>, key: string, values: readonly T[]) { const value = input[key]; if (typeof value !== 'string' || !values.includes(value as T)) throw new BadRequestException(`${key} 取值无效`); return value as T }
  private date(input: Record<string, unknown>, key: string) { const value = this.text(input, key); if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))) throw new BadRequestException(`${key} 日期无效`); return value }
  private datetime(input: Record<string, unknown>, key: string) { const value = this.text(input, key); const parsed = Date.parse(value); if (!Number.isFinite(parsed)) throw new BadRequestException(`${key} 时间无效`); return new Date(parsed).toISOString() }
  private optionalDate(input: Record<string, unknown>, key: string) { const value = input[key]; if (value === '' || value === undefined || value === null) return null; return this.date(input, key) }
}
