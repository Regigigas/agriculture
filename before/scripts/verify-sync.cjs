const { randomUUID } = require('node:crypto')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { spawn } = require('node:child_process')
const { createServer } = require('node:net')

const root = resolve(__dirname, '../..')
const temporaryRoot = mkdtempSync(join(tmpdir(), 'fengyu-sync-test-'))
const children = []

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => error ? reject(error) : resolvePort(port))
    })
  })
}

function start(entry, cwd, env) {
  const child = spawn(process.execPath, [entry], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })
  child.output = () => output
  children.push(child)
  return child
}

async function request(url, options = {}) {
  const response = await fetch(url, options)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${url} -> ${response.status}: ${payload.message || JSON.stringify(payload)}`)
  return payload
}

async function waitForHealth(url, child) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`服务提前退出 (${child.exitCode})\n${child.output()}`)
    try {
      await request(url)
      return
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 150))
    }
  }
  throw new Error(`服务启动超时：${url}\n${child.output()}`)
}

function expect(value, message) {
  if (!value) throw new Error(message)
}

function verifyLocalOutbox() {
  const previousDataDirectory = process.env.AGRI_DATA_DIR
  process.env.AGRI_DATA_DIR = join(temporaryRoot, 'database-unit')
  const { LocalDatabase } = require(resolve(root, 'before/server/dist/local-database.js'))
  const database = new LocalDatabase()
  try {
    database.put('tasks', { id: 'race-task', value: 'first' })
    const firstEvent = database.listSyncEvents().find((event) => event.entityId === 'race-task')
    database.put('tasks', { id: 'race-task', value: 'second' })
    database.acceptSyncResult(firstEvent, { eventId: firstEvent.eventId, status: 'accepted', revision: 1, payload: firstEvent.payload })
    const pending = database.listSyncEvents().find((event) => event.entityId === 'race-task')
    expect(pending?.payload.value === 'second', '在途写入被旧同步回执删除')
    expect(pending?.baseRevision === 1, '在途写入没有更新云端基础版本')

    database.put('tasks', { id: 'conflict-task', value: 'local' })
    const conflictEvent = database.listSyncEvents().find((event) => event.entityId === 'conflict-task')
    database.recordSyncConflict(conflictEvent, {
      eventId: conflictEvent.eventId,
      status: 'conflict',
      revision: 1,
      payload: { id: 'conflict-task', value: 'remote-1' },
    })
    database.applyRemoteChange({
      cursor: 2,
      collection: 'tasks',
      entityId: 'conflict-task',
      revision: 2,
      payload: { id: 'conflict-task', value: 'remote-2' },
      sourceClientId: 'remote',
      changedAt: new Date().toISOString(),
    })
    const conflict = database.listSyncConflicts().find((item) => item.entityId === 'conflict-task')
    expect(conflict?.remoteRevision === 2 && conflict.remotePayload.value === 'remote-2', '冲突没有跟进最新云端版本')
    database.put('tasks', { id: 'conflict-task', value: 'local-newer' })
    database.applyRemoteChange({
      cursor: 3,
      collection: 'tasks',
      entityId: 'conflict-task',
      revision: 3,
      payload: { id: 'conflict-task', value: 'remote-3' },
      sourceClientId: 'remote',
      changedAt: new Date().toISOString(),
    })
    const updatedConflict = database.listSyncConflicts().find((item) => item.entityId === 'conflict-task')
    expect(updatedConflict?.localPayload.value === 'local-newer', '冲突期间的新本地编辑被旧快照覆盖')
    expect(updatedConflict?.remotePayload.value === 'remote-3', '冲突没有保存最新远端快照')
    database.resolveSyncConflict(updatedConflict.id, 'remote')
    const conflictTask = database.loadCollection('tasks', []).find((item) => item.id === 'conflict-task')
    expect(conflictTask?.value === 'remote-3', '采用云端时没有应用最新冲突版本')

    database.put('compliance_documents', { id: 'document-race', name: '档案', filePath: 'C:\\private\\document.pdf' })
    const documentEvent = database.listSyncEvents().find((event) => event.entityId === 'document-race')
    expect(documentEvent?.payload.filePath === '', '附件本机路径进入了同步载荷')
    database.recordSyncConflict(documentEvent, {
      eventId: documentEvent.eventId,
      status: 'conflict',
      revision: 1,
      payload: { id: 'document-race', name: '云端档案', filePath: '' },
    })
    const documentConflict = database.listSyncConflicts().find((item) => item.entityId === 'document-race')
    database.resolveSyncConflict(documentConflict.id, 'local')
    const document = database.loadCollection('compliance_documents', []).find((item) => item.id === 'document-race')
    expect(document?.filePath === 'C:\\private\\document.pdf', '保留本机版本时附件路径丢失')

    database.setMetadata('cloud_sync_server_id', 'rollback-server')
    database.setMetadata('cloud_sync_cursor', '10')
    database.setMetadata('cloud_sync_bootstrapped', '1')
    const reset = database.configureSyncServer('rollback-server', 5)
    expect(reset && database.syncCursor() === 0 && database.pendingSyncCount() === 0, '云端游标回滚没有重置本地同步状态')
  } finally {
    database.onModuleDestroy()
    if (previousDataDirectory === undefined) delete process.env.AGRI_DATA_DIR
    else process.env.AGRI_DATA_DIR = previousDataDirectory
  }
}

async function main() {
  verifyLocalOutbox()
  const cloudPort = await freePort()
  const localPort = await freePort()
  const cloudBase = `http://127.0.0.1:${cloudPort}/api`
  const localBase = `http://127.0.0.1:${localPort}/api`
  const cloudToken = 'cloud-sync-verification-token'
  const localToken = 'local-sync-verification-token'

  const cloud = start(resolve(root, 'after/dist/main.js'), resolve(root, 'after'), {
    HOST: '127.0.0.1',
    PORT: String(cloudPort),
    DEMO_TOKEN: cloudToken,
    AGRI_CLOUD_DATA_DIR: join(temporaryRoot, 'cloud'),
  })
  const local = start(resolve(root, 'before/server/dist/main.js'), resolve(root, 'before/server'), {
    HOST: '127.0.0.1',
    PORT: String(localPort),
    DEMO_TOKEN: localToken,
    ADMIN_PASSWORD: 'verification-password',
    DEVICE_KEY: 'verification-device-key',
    AGRI_DATA_DIR: join(temporaryRoot, 'local'),
    CLOUD_SYNC_URL: cloudBase,
    CLOUD_SYNC_TOKEN: cloudToken,
    CLOUD_SYNC_AUTO: 'false',
  })

  await Promise.all([
    waitForHealth(`${cloudBase}/health`, cloud),
    waitForHealth(`${localBase}/health`, local),
  ])

  const localHeaders = { Authorization: `Bearer ${localToken}`, 'Content-Type': 'application/json' }
  const cloudHeaders = { Authorization: `Bearer ${cloudToken}`, 'Content-Type': 'application/json' }
  const first = await request(`${localBase}/system/sync/run`, { method: 'POST', headers: localHeaders })
  expect(first.pendingCount === 0, '首次同步后仍有待上传数据')
  expect(first.conflictCount === 0, '首次同步不应产生冲突')
  expect(first.cursor > 0, '首次同步没有推进云端游标')
  expect(first.running === false, '同步完成后状态仍显示运行中')

  await request(`${localBase}/tasks/task-002/status`, {
    method: 'PATCH',
    headers: { ...localHeaders, 'x-operation-id': randomUUID() },
    body: JSON.stringify({ status: 'in_progress' }),
  })
  await request(`${localBase}/system/sync/run`, { method: 'POST', headers: localHeaders })

  const verifier = await request(`${cloudBase}/sync/exchange`, {
    method: 'POST',
    headers: cloudHeaders,
    body: JSON.stringify({ clientId: 'sync-verifier', cursor: 0, schemaVersion: 1, events: [], limit: 200 }),
  })
  const taskChange = [...verifier.changes].reverse().find((change) => change.collection === 'tasks' && change.entityId === 'task-002')
  expect(taskChange?.payload.status === 'in_progress', '云端没有收到任务增量更新')

  const remoteEvent = {
    eventId: randomUUID(),
    collection: 'tasks',
    entityId: 'task-002',
    payload: { ...taskChange.payload, status: 'completed', description: '云端冲突版本', completedAt: new Date().toISOString() },
    baseRevision: taskChange.revision,
    occurredAt: new Date().toISOString(),
  }
  const remote = await request(`${cloudBase}/sync/exchange`, {
    method: 'POST',
    headers: cloudHeaders,
    body: JSON.stringify({ clientId: 'remote-editor', cursor: verifier.nextCursor, schemaVersion: 1, events: [remoteEvent], limit: 200 }),
  })
  expect(remote.results[0]?.status === 'accepted', '远端并发更新未被接受')
  const duplicate = await request(`${cloudBase}/sync/exchange`, {
    method: 'POST',
    headers: cloudHeaders,
    body: JSON.stringify({ clientId: 'remote-editor', cursor: remote.nextCursor, schemaVersion: 1, events: [remoteEvent], limit: 200 }),
  })
  expect(duplicate.results[0]?.status === 'duplicate', '重复事件没有命中幂等回执')

  await request(`${localBase}/tasks/task-002/status`, {
    method: 'PATCH',
    headers: { ...localHeaders, 'x-operation-id': randomUUID() },
    body: JSON.stringify({ status: 'completed' }),
  })
  const conflicted = await request(`${localBase}/system/sync/run`, { method: 'POST', headers: localHeaders })
  expect(conflicted.conflictCount === 1, '并发更新没有产生可处理冲突')
  const conflicts = await request(`${localBase}/system/sync/conflicts`, { headers: localHeaders })
  expect(conflicts.length === 1 && conflicts[0].entityId === 'task-002', '冲突记录不完整')
  const resolved = await request(`${localBase}/system/sync/conflicts/${encodeURIComponent(conflicts[0].id)}/resolve`, {
    method: 'POST',
    headers: localHeaders,
    body: JSON.stringify({ strategy: 'remote' }),
  })
  expect(resolved.conflictCount === 0, '采用云端版本后冲突未清除')
  const tasks = await request(`${localBase}/tasks`, { headers: localHeaders })
  const resolvedTask = tasks.find((task) => task.id === 'task-002')
  expect(resolvedTask?.status === 'completed' && resolvedTask.description === '云端冲突版本', '云端版本没有回放到本地业务模型')

  console.log(`同步验收通过：首次游标 ${first.cursor}，任务云端版本 ${remote.results[0].revision}，冲突已处理`)
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
}).finally(async () => {
  for (const child of children) {
    if (child.exitCode === null) child.kill()
  }
  await Promise.all(children.map((child) => child.exitCode === null
    ? new Promise((resolveExit) => child.once('exit', resolveExit))
    : Promise.resolve()))
  rmSync(temporaryRoot, { recursive: true, force: true })
})
