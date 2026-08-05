const assert = require('node:assert/strict')
const { existsSync, mkdirSync, mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { backup, DatabaseSync } = require('node:sqlite')
const { randomUUID } = require('node:crypto')
const { AgricultureService } = require('../desktop/server/dist/agriculture.service.js')
const { LocalDatabase } = require('../desktop/server/dist/local-database.js')
const { ProductionService } = require('../desktop/server/dist/production.service.js')

async function verify() {
  const root = mkdtempSync(path.join(tmpdir(), 'fengyu-local-sync-'))
  const targetDirectory = path.join(root, 'target')
  const sourceDirectory = path.join(root, 'source')
  let target
  let source
  let compatibility

  try {
  process.env.AGRI_DATA_DIR = targetDirectory
  target = new LocalDatabase()
  const targetAgriculture = new AgricultureService(target)
  new ProductionService(target, targetAgriculture)
  target.setMetadata('server_id', 'target-server-id')
  const field = (id, name) => ({ id, farmId: 'farm-001', name, crop: '小麦', area: 5, location: '测试区', status: 'healthy', plantedAt: '2026-01-01', expectedHarvestAt: '2026-06-01', soilMoisture: 50, manager: '测试员', createdAt: '2026-01-01T00:00:00.000Z' })
  target.put('fields', field('field-shared', '同步前名称'))

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
  process.env.AGRI_DATA_DIR = sourceDirectory
  source = new LocalDatabase()
  const sourceAgriculture = new AgricultureService(source)
  new ProductionService(source, sourceAgriculture)
  source.put('fields', field('field-shared', '同步后名称'))
  source.put('fields', field('field-imported', '外部新增地块'))
  source.appendTelemetry('DEV-IMPORT', { temperature: 26.5 }, new Date().toISOString())
  source.appendAudit('field', 'field-imported', 'create', '本地同步回归数据')
  const sourceBackup = source.createBackup()
  source.onModuleDestroy()
  source = undefined

  async function stage(dataDirectory, sourcePath) {
    const importId = randomUUID()
    const importDirectory = path.join(dataDirectory, 'imports')
    const stagedPath = path.join(importDirectory, `${importId}.db`)
    mkdirSync(importDirectory, { recursive: true })
    const snapshotSource = new DatabaseSync(sourcePath, { readOnly: true })
    await backup(snapshotSource, stagedPath)
    snapshotSource.close()
    return { importId, stagedPath }
  }

  const compatibilityDirectory = path.join(root, 'compatibility')
  process.env.AGRI_DATA_DIR = compatibilityDirectory
  compatibility = new LocalDatabase()
  const compatibilityStage = await stage(compatibilityDirectory, sourceBackup.path)
  const compatibilityResult = compatibility.syncFromStagedFile(compatibilityStage.importId, sourceBackup.name)
  assert.ok(compatibilityResult.inserted >= 50, '全部业务集合应能导入空数据库')
  compatibility.onModuleDestroy()
  compatibility = undefined

  const firstStage = await stage(targetDirectory, sourceBackup.path)
  const result = target.syncFromStagedFile(firstStage.importId, sourceBackup.name)
  assert.equal(result.inserted, 1)
  assert.equal(result.updated, 1)
  assert.equal(result.telemetryImported, 1)
  assert.equal(result.auditImported, 1)
  assert.equal(target.getMetadata('server_id'), 'target-server-id')
  assert.equal(target.listBackups().length, 1)
  assert.equal(existsSync(firstStage.stagedPath), false)
  assert.equal(
    entityUpdatedAt(target.filePath, 'fields', 'field-shared'),
    entityUpdatedAt(sourceBackup.path, 'fields', 'field-shared'),
    '导入后必须保留源记录更新时间，避免较新的离线镜像被错误跳过',
  )

  const fields = target.loadCollection('fields', [])
  assert.equal(fields.find((item) => item.id === 'field-shared')?.name, '同步后名称')
  assert.equal(fields.find((item) => item.id === 'field-imported')?.name, '外部新增地块')

  target.put('fields', field('field-shared', '本机后续修改'))
  const repeatStage = await stage(targetDirectory, sourceBackup.path)
  const repeatResult = target.syncFromStagedFile(repeatStage.importId, sourceBackup.name)
  assert.equal(repeatResult.inserted, 0)
  assert.equal(repeatResult.updated, 0)
  assert.equal(target.loadCollection('fields', []).find((item) => item.id === 'field-shared')?.name, '本机后续修改')

  const malformedPath = path.join(root, 'malformed.db')
  const malformedSource = new DatabaseSync(sourceBackup.path, { readOnly: true })
  await backup(malformedSource, malformedPath)
  malformedSource.close()
  const malformed = new DatabaseSync(malformedPath)
  malformed.prepare('INSERT INTO entities (collection, id, payload, updated_at) VALUES (?, ?, ?, ?)').run(
    'fields',
    'field-rollback',
    JSON.stringify(field('field-rollback', '事务回滚地块')),
    new Date(Date.now() + 1000).toISOString(),
  )
  malformed.prepare('INSERT INTO telemetry_samples (id, device_id, recorded_at, payload) VALUES (?, ?, ?, ?)').run(
    'telemetry-rollback', 'DEV-IMPORT', new Date().toISOString(), JSON.stringify({ temperature: 27 }),
  )
  malformed.prepare('INSERT INTO audit_logs (id, domain, record_id, action, detail, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'audit-invalid', 'field', 'field-rollback', 'x'.repeat(100_001), '', '测试员', new Date().toISOString(),
  )
  malformed.close()
  const beforeRollback = databaseCounts(target.filePath)
  const malformedStage = await stage(targetDirectory, malformedPath)
  assert.throws(() => target.syncFromStagedFile(malformedStage.importId, 'malformed.db'), /审计数据字段超过长度限制/)
  assert.deepEqual(databaseCounts(target.filePath), beforeRollback)
  assert.equal(target.hasEntity('fields', 'field-rollback'), false)
  assert.equal(target.loadCollection('fields', []).find((item) => item.id === 'field-imported')?.name, '外部新增地块')

  const targetPath = target.filePath
  target.onModuleDestroy()
  target = undefined
  const verification = new DatabaseSync(targetPath, { readOnly: true })
  assert.equal(verification.prepare('SELECT COUNT(*) AS count FROM telemetry_samples').get().count, 1)
  assert.equal(verification.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'local_sync'").get().count, 2)
  verification.close()

  console.log(`本地文件同步验证通过：新增 ${result.inserted}，更新 ${result.updated}，安全备份 ${result.safetyBackup.name}`)
  } finally {
    source?.onModuleDestroy()
    target?.onModuleDestroy()
    compatibility?.onModuleDestroy()
    rmSync(root, { recursive: true, force: true })
  }
}

function databaseCounts(filePath) {
  const database = new DatabaseSync(filePath, { readOnly: true })
  const count = (table) => database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count
  const result = {
    entities: count('entities'),
    telemetry: count('telemetry_samples'),
    audits: count('audit_logs'),
    outbox: count('sync_outbox'),
  }
  database.close()
  return result
}

function entityUpdatedAt(filePath, collection, id) {
  const database = new DatabaseSync(filePath, { readOnly: true })
  const row = database.prepare('SELECT updated_at AS updatedAt FROM entities WHERE collection = ? AND id = ?').get(collection, id)
  database.close()
  return row?.updatedAt
}

verify().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
