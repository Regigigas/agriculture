import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LivestockService } from '../src/livestock.service'
import { LocalDatabase } from '../src/local-database'

describe('畜牧养殖业务', () => {
  let directory: string
  let database: LocalDatabase
  let service: LivestockService

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'agriculture-livestock-'))
    process.env.AGRI_DATA_DIR = directory
    database = new LocalDatabase()
    database.put('farms', { id: 'farm-001', name: '测试农场' })
    service = new LivestockService(database)
  })

  afterEach(() => {
    database.onModuleDestroy()
    rmSync(directory, { recursive: true, force: true })
    delete process.env.AGRI_DATA_DIR
  })

  it('建立圈舍、养殖批次并持久化饲喂和健康记录', () => {
    const barn = service.createBarn({ farmId: 'farm-001', name: '测试羊舍', code: 'S-TEST', species: 'sheep', capacity: 100, manager: '测试员', location: '测试区', temperature: 22, humidity: 60 })
    const batch = service.createBatch({ barnId: barn.id, code: 'SHEEP-TEST', species: 'sheep', breed: '湖羊', quantity: 40, averageWeight: 28, entryDate: '2026-08-01', targetExitDate: '2026-12-01', manager: '测试员', status: 'active' })
    service.createFeeding({ batchId: batch.id, feedName: '羊全价料', quantityKg: 80, fedAt: '2026-08-10T08:00:00+08:00', operator: '测试员', notes: '' })
    service.createHealth({ batchId: batch.id, type: 'vaccination', title: '小反刍兽疫免疫', occurredAt: '2026-08-10', affectedQuantity: 40, veterinarian: '兽医', nextDueDate: '2027-08-10', notes: '' })
    expect(service.listFeeding().some((item) => item.batchId === batch.id)).toBe(true)
    expect(service.listHealth().some((item) => item.batchId === batch.id)).toBe(true)
    expect(database.hasEntity('livestock_batches', batch.id)).toBe(true)
  })

  it('出栏扣减存栏并阻止超量出栏', () => {
    const batch = service.listBatches()[0]
    const before = batch.quantity
    service.createExit({ batchId: batch.id, quantity: 5, averageWeight: 520, destination: '合规屠宰场', exitedAt: '2026-08-10', inspector: '检疫员', notes: '' })
    expect(batch.quantity).toBe(before - 5)
    expect(() => service.createExit({ batchId: batch.id, quantity: before, averageWeight: 520, destination: '合规屠宰场', exitedAt: '2026-08-10', inspector: '检疫员', notes: '' })).toThrow('quantity 超出范围')
  })

  it('阻止物种不匹配或超过容量的批次入舍', () => {
    const pigBarn = service.listBarns().find((item) => item.species === 'pig')!
    expect(() => service.createBatch({ barnId: pigBarn.id, code: 'BAD', species: 'cattle', breed: '肉牛', quantity: 1, averageWeight: 300, entryDate: '2026-08-01', targetExitDate: '2026-12-01', manager: '测试员', status: 'active' })).toThrow('物种与圈舍用途不一致')
    expect(() => service.createBatch({ barnId: pigBarn.id, code: 'FULL', species: 'pig', breed: '三元猪', quantity: 1000, averageWeight: 30, entryDate: '2026-08-01', targetExitDate: '2026-12-01', manager: '测试员', status: 'active' })).toThrow('超过圈舍剩余容量')
  })
})
