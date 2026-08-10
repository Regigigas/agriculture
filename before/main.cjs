const { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell, utilityProcess } = require('electron')
const { randomBytes, randomUUID } = require('node:crypto')
const { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statfsSync, statSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const { backup, DatabaseSync } = require('node:sqlite')
const { pathToFileURL } = require('node:url')
const { autoUpdater } = require('electron-updater')

const isDevelopment = process.argv.includes('--dev')
app.setAppUserModelId('com.fengyu.agriculture')
if (isDevelopment) {
  app.setPath('userData', path.join(app.getPath('appData'), 'fengyu-agriculture-desktop-dev'))
}
const apiPort = Number(process.env.AGRI_PORT || (isDevelopment ? 3101 : 3100))
const apiBaseUrl = `http://127.0.0.1:${apiPort}/api`
const appIcon = path.join(__dirname, 'build', 'icon.ico')

let apiProcess = null
let mainWindow = null
let correctionWindow = null
let pendingCorrectionContext = ''
let quitting = false
let backendReady = false
let shutdownStarted = false
let localSecrets = null
const instanceId = randomUUID()
const currentSchemaVersion = 3
let updateState = { phase: 'idle', version: '', percent: 0, transferred: 0, total: 0, message: '' }

function backendEntry() {
  return isDevelopment
    ? path.resolve(__dirname, 'server', 'dist', 'main.js')
    : path.join(app.getAppPath(), 'server', 'dist', 'main.js')
}

function loadOrCreateSecrets() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows 安全存储不可用，无法保护本地服务凭据。')
  }

  const configDirectory = path.join(app.getPath('userData'), 'config')
  const filePath = path.join(configDirectory, 'local-secrets.json')
  if (existsSync(filePath)) {
    const stored = JSON.parse(readFileSync(filePath, 'utf8'))
    const secrets = JSON.parse(safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64')))
    return {
      ...secrets,
      cloudSync: secrets.cloudSync || { url: '', token: '' },
      customBackupDirectory: secrets.customBackupDirectory || '',
    }
  }

  const secrets = {
    adminPassword: randomBytes(9).toString('base64url'),
    token: randomBytes(32).toString('base64url'),
    deviceKey: randomBytes(24).toString('base64url'),
    cloudSync: { url: '', token: '' },
    customBackupDirectory: '',
    initialPasswordPresentedAt: '',
  }
  persistSecrets(secrets)
  return secrets
}

function persistSecrets(secrets) {
  const configDirectory = path.join(app.getPath('userData'), 'config')
  const filePath = path.join(configDirectory, 'local-secrets.json')
  mkdirSync(configDirectory, { recursive: true })
  const encrypted = safeStorage.encryptString(JSON.stringify(secrets)).toString('base64')
  writeFileSync(filePath, JSON.stringify({ version: 1, encrypted }), { encoding: 'utf8', mode: 0o600 })
}

async function presentInitialAdminPassword(secrets) {
  if (process.env.AGRI_SKIP_INITIAL_PASSWORD_DIALOG === 'true') return
  if (secrets.initialPasswordPresentedAt) return
  const databasePath = path.join(localDataDirectory(), 'agriculture.db')
  let initialPasswordIsCurrent = true
  let database
  try {
    if (existsSync(databasePath)) {
      database = new DatabaseSync(databasePath, { readOnly: true, timeout: 5000 })
      const hasUsers = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()
      if (hasUsers) {
        const administrator = database.prepare(`
          SELECT created_at AS createdAt, updated_at AS updatedAt FROM users WHERE username = 'admin' COLLATE NOCASE
        `).get()
        initialPasswordIsCurrent = !administrator || administrator.createdAt === administrator.updatedAt
      }
    }
  } catch {
    initialPasswordIsCurrent = false
  } finally {
    database?.close()
  }

  if (initialPasswordIsCurrent) {
    await dialog.showMessageBox({
      type: 'warning',
      title: '记录初始管理员密码',
      message: `本机管理员账号：admin\n初始密码：${secrets.adminPassword}`,
      detail: '此密码仅显示一次。请妥善记录，登录后立即在账号设置中修改密码。',
      buttons: ['我已记录'],
      defaultId: 0,
      noLink: true,
    })
  }
  secrets.initialPasswordPresentedAt = new Date().toISOString()
  persistSecrets(secrets)
}

function normalizeCloudUrl(value) {
  const normalized = typeof value === 'string' ? value.trim().replace(/\/$/, '') : ''
  if (!normalized) return ''
  const url = new URL(normalized)
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !localHttp) throw new Error('云端地址必须使用 HTTPS，本机调试可使用 localhost HTTP')
  if (url.username || url.password) throw new Error('云端地址不能包含用户名或密码')
  if (url.search || url.hash) throw new Error('云端地址不能包含查询参数或片段')
  return normalized
}

function startBackend(secrets) {
  apiProcess = utilityProcess.fork(backendEntry(), [], {
    env: {
      ...process.env,
      HOST: '0.0.0.0',
      PORT: String(apiPort),
      AGRI_DATA_DIR: path.join(app.getPath('userData'), 'data'),
      AGRI_INSTANCE_ID: instanceId,
      ADMIN_PASSWORD: secrets.adminPassword,
      DEMO_TOKEN: secrets.token,
      DEVICE_KEY: secrets.deviceKey,
      CLOUD_SYNC_URL: secrets.cloudSync?.url || '',
      CLOUD_SYNC_TOKEN: secrets.cloudSync?.token || '',
    },
    serviceName: '丰域农业本地数据服务',
    stdio: 'pipe',
  })

  apiProcess.stdout?.on('data', (data) => console.log(`[api] ${data.toString().trimEnd()}`))
  apiProcess.stderr?.on('data', (data) => console.error(`[api] ${data.toString().trimEnd()}`))
  apiProcess.on('exit', (code) => {
    apiProcess = null
    if (!quitting && backendReady) {
      void dialog.showMessageBox({
        type: 'error',
        title: '本地服务已停止',
        message: `本地数据服务异常退出（代码 ${code ?? '未知'}）。`,
        detail: '请关闭应用后重新启动；数据已保存在本机 SQLite 数据库中。',
      })
    }
  })
}

async function waitForBackend(timeoutMs = 15000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${apiBaseUrl}/health`)
      if (response.ok) {
        const health = await response.json()
        if (health.instanceId === instanceId) return
      }
    } catch {
      // The sidecar needs a short startup window before accepting requests.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`无法在 ${timeoutMs / 1000} 秒内启动本地服务，端口 ${apiPort} 可能已被占用。`)
}

function frontendEntry() {
  return path.join(app.getAppPath(), 'dist', 'index.html')
}

function managedDocumentDirectory() {
  return path.join(app.getPath('userData'), 'documents')
}

function localDataDirectory() {
  return path.join(app.getPath('userData'), 'data')
}

function localBackupDirectory() {
  return path.join(localDataDirectory(), 'backups')
}

function validateCustomBackupDirectory(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('尚未选择镜像备份目录')
  const directory = realpathSync(path.resolve(value.trim()))
  if (!statSync(directory).isDirectory()) throw new Error('镜像备份位置不是有效目录')
  const dataDirectory = realpathSync(localDataDirectory())
  const normalized = directory.toLowerCase()
  const controlled = dataDirectory.toLowerCase()
  if (normalized === controlled || normalized.startsWith(`${controlled}${path.sep}`)) {
    throw new Error('镜像备份目录必须位于程序数据目录之外')
  }
  return directory
}

function controlledBackupPath(name) {
  if (typeof name !== 'string' || !/^agriculture-.+\.db$/.test(name)) throw new Error('备份文件名无效')
  const directory = path.resolve(localBackupDirectory())
  const filePath = path.resolve(directory, name)
  if (path.dirname(filePath).toLowerCase() !== directory.toLowerCase() || !existsSync(filePath)) {
    throw new Error('备份文件不存在或不在受控目录')
  }
  return filePath
}

function pendingRestorePath() {
  return path.join(app.getPath('userData'), 'config', 'pending-database-restore.json')
}

function validateAgricultureDatabase(filePath) {
  let database
  try {
    database = new DatabaseSync(filePath, { readOnly: true, timeout: 5000 })
    const check = database.prepare('PRAGMA quick_check').all()
    if (check.length !== 1 || check[0].quick_check !== 'ok') {
      throw new Error(`数据库完整性检查失败：${check.map((row) => row.quick_check).join('；')}`)
    }
    for (const table of ['metadata', 'entities', 'schema_migrations']) {
      if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) {
        throw new Error(`备份缺少必要数据表 ${table}`)
      }
    }
    const versions = database.prepare('SELECT version FROM schema_migrations ORDER BY version ASC').all()
      .map((row) => row.version)
    if (!versions.length || versions.some((version, index) => !Number.isInteger(version) || version !== index + 1)) {
      throw new Error('数据库迁移记录不完整')
    }
    const schemaVersion = versions.at(-1)
    if (schemaVersion > currentSchemaVersion) {
      throw new Error(`数据库结构版本 ${schemaVersion} 高于当前支持版本 ${currentSchemaVersion}`)
    }
    const requiredTables = [
      ...(schemaVersion >= 1 ? ['audit_logs'] : []),
      ...(schemaVersion >= 2 ? ['sync_outbox', 'sync_entity_state', 'sync_conflicts'] : []),
      ...(schemaVersion >= 3 ? ['users', 'sessions', 'conversations', 'conversation_members', 'messages', 'operation_authorizations'] : []),
    ]
    for (const table of requiredTables) {
      if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) {
        throw new Error(`数据库结构版本 ${schemaVersion} 缺少数据表 ${table}`)
      }
    }
  } finally {
    database?.close()
  }
}

function cleanupExpiredImports() {
  const directory = path.join(localDataDirectory(), 'imports')
  if (!existsSync(directory)) return
  const expiresBefore = Date.now() - 24 * 60 * 60 * 1000
  for (const name of readdirSync(directory)) {
    if (!/^[0-9a-f-]+\.db(?:-wal|-shm)?$/i.test(name)) continue
    const filePath = path.join(directory, name)
    if (statSync(filePath).mtimeMs < expiresBefore) rmSync(filePath, { force: true })
  }
}

async function applyPendingRestore() {
  const requestPath = pendingRestorePath()
  if (!existsSync(requestPath)) return null

  const dataDirectory = localDataDirectory()
  const currentPath = path.join(dataDirectory, 'agriculture.db')
  const temporaryPath = path.join(dataDirectory, `restore-${randomUUID()}.db`)
  let safetyBackupName = ''
  let safetyBackupPath = ''
  let replacementStarted = false
  let hadCurrentDatabase = false
  try {
    const request = JSON.parse(readFileSync(requestPath, 'utf8'))
    const sourcePath = controlledBackupPath(request.name)
    await snapshotLocalDataFile(sourcePath, temporaryPath)
    validateAgricultureDatabase(temporaryPath)

    if (existsSync(currentPath)) {
      hadCurrentDatabase = true
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      safetyBackupName = `agriculture-before-restore-${stamp}-${randomUUID().slice(0, 8)}.db`
      safetyBackupPath = path.join(localBackupDirectory(), safetyBackupName)
      await snapshotLocalDataFile(currentPath, safetyBackupPath)
      validateAgricultureDatabase(safetyBackupPath)
    }
    replacementStarted = true
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${currentPath}${suffix}`, { force: true })
    renameSync(temporaryPath, currentPath)
    validateAgricultureDatabase(currentPath)
    return { restored: true, name: request.name, safetyBackupName }
  } catch (error) {
    if (replacementStarted) {
      for (const suffix of ['', '-wal', '-shm']) rmSync(`${currentPath}${suffix}`, { force: true })
      if (hadCurrentDatabase && safetyBackupPath && existsSync(safetyBackupPath)) {
        copyFileSync(safetyBackupPath, currentPath)
      }
    }
    return { restored: false, error: error instanceof Error ? error.message : '数据库备份恢复失败' }
  } finally {
    rmSync(temporaryPath, { force: true })
    rmSync(requestPath, { force: true })
  }
}

async function snapshotLocalDataFile(sourcePath, targetPath) {
  const sourceSize = statSync(sourcePath).size
  if (sourceSize < 100 || sourceSize > 2 * 1024 * 1024 * 1024) throw new Error('数据文件大小无效或超过 2 GB 限制')
  const walSize = existsSync(`${sourcePath}-wal`) ? statSync(`${sourcePath}-wal`).size : 0
  const currentPath = path.join(localDataDirectory(), 'agriculture.db')
  const currentSize = existsSync(currentPath) ? statSync(currentPath).size : 0
  const disk = statfsSync(path.dirname(targetPath))
  const available = Number(disk.bavail) * Number(disk.bsize)
  const required = (sourceSize + walSize) * 3 + currentSize * 2 + 256 * 1024 * 1024
  if (available < required) throw new Error('本机可用磁盘空间不足，无法创建同步快照和安全备份')
  let source
  try {
    source = new DatabaseSync(sourcePath, { readOnly: true, timeout: 5000 })
    await backup(source, targetPath)
  } finally {
    source?.close()
  }
}

async function requireAdminAccess(accessToken) {
  if (typeof accessToken !== 'string' || !accessToken || accessToken.length > 512) {
    throw new Error('缺少有效的管理员访问令牌')
  }
  let response
  try {
    response = await fetch(`${apiBaseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    throw new Error('无法验证管理员身份，请确认本地服务正在运行')
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.message || '管理员登录已失效，请重新登录')
  if (payload?.role !== 'admin') throw new Error('仅管理员可执行此操作')
}

function trustedRendererUrl(value) {
  try {
    const url = new URL(value)
    if (isDevelopment) {
      return url.protocol === 'http:' &&
        (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
        url.port === '5173' && !url.username && !url.password
    }

    const expected = new URL(pathToFileURL(frontendEntry()).href)
    return url.protocol === 'file:' && url.host === expected.host && url.pathname === expected.pathname
  } catch {
    return false
  }
}

function trustedPermissionOrigin(origin) {
  return (!isDevelopment && origin === 'file://') || trustedRendererUrl(origin)
}

function configureBluetooth() {
  const currentSession = session.defaultSession
  currentSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => (
    permission === 'bluetooth' && trustedPermissionOrigin(requestingOrigin)
  ))
  currentSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'bluetooth' && trustedRendererUrl(webContents.getURL()))
  })
  currentSession.setDevicePermissionHandler((details) => (
    details.deviceType === 'bluetooth' && trustedPermissionOrigin(details.origin)
  ))

  const discovered = new Map()
  let selectionTimer = null
  let selectionCallback = null

  currentSession.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault()
    selectionCallback = callback
    for (const device of devices) discovered.set(device.deviceId, device.deviceName || '未命名蓝牙设备')
    if (selectionTimer) return

    selectionTimer = setTimeout(async () => {
      const choices = [...discovered.entries()]
      const cancelId = choices.length
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: '选择蓝牙设备',
        message: choices.length ? '选择要连接的现场设备' : '没有发现可用的蓝牙设备',
        buttons: [...choices.map(([, name]) => name), '取消'],
        cancelId,
        defaultId: 0,
        noLink: true,
      })
      selectionCallback?.(result.response < choices.length ? choices[result.response][0] : '')
      discovered.clear()
      selectionCallback = null
      selectionTimer = null
    }, 4000)
  })
}

function publishUpdateState(patch) {
  updateState = { ...updateState, ...patch }
  for (const window of [mainWindow, correctionWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send('desktop-update-state', updateState)
  }
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => publishUpdateState({ phase: 'checking', message: '正在检查更新...' }))
  autoUpdater.on('update-available', (info) => publishUpdateState({
    phase: 'available', version: info.version, percent: 0, message: `发现版本 ${info.version}`,
  }))
  autoUpdater.on('update-not-available', (info) => publishUpdateState({
    phase: 'current', version: info.version, percent: 0, message: '当前已是最新版本',
  }))
  autoUpdater.on('download-progress', (progress) => publishUpdateState({
    phase: 'downloading',
    percent: Math.round(progress.percent),
    transferred: progress.transferred,
    total: progress.total,
    message: `正在下载 ${Math.round(progress.percent)}%`,
  }))
  autoUpdater.on('update-downloaded', (info) => publishUpdateState({
    phase: 'downloaded', version: info.version, percent: 100, message: '更新已下载，可以重启安装',
  }))
  autoUpdater.on('error', (error) => publishUpdateState({
    phase: 'error', message: error instanceof Error ? error.message : '桌面更新失败',
  }))
}

async function createWindow() {
  process.env.AGRI_API_BASE_URL = apiBaseUrl
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#f3f5f3',
    icon: appIcon,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow.setMenu(null)
  mainWindow.on('closed', () => {
    mainWindow = null
    correctionWindow?.close()
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!trustedRendererUrl(url)) event.preventDefault()
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.once('ready-to-show', () => mainWindow?.show())

  if (isDevelopment) {
    await mainWindow.loadURL('http://127.0.0.1:5173')
  } else {
    await mainWindow.loadFile(frontendEntry())
  }
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
    mainWindow.show()
    mainWindow.focus()
  }
}

async function createCorrectionWindow(contextRoute = '') {
  if (contextRoute) pendingCorrectionContext = contextRoute
  if (correctionWindow && !correctionWindow.isDestroyed()) {
    if (correctionWindow.isMinimized()) correctionWindow.restore()
    correctionWindow.show()
    correctionWindow.focus()
    if (pendingCorrectionContext && !correctionWindow.webContents.isLoading()) {
      correctionWindow.webContents.send('correction-context', pendingCorrectionContext)
      pendingCorrectionContext = ''
    }
    return
  }

  correctionWindow = new BrowserWindow({
    width: 680,
    height: 820,
    minWidth: 560,
    minHeight: 620,
    backgroundColor: '#f3f5f3',
    icon: appIcon,
    show: false,
    title: '丰域农业 - 纠错中心',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  correctionWindow.setMenu(null)
  correctionWindow.webContents.on('will-navigate', (event, url) => {
    if (!trustedRendererUrl(url)) event.preventDefault()
  })
  correctionWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  correctionWindow.webContents.once('did-finish-load', () => {
    if (pendingCorrectionContext) {
      correctionWindow?.webContents.send('correction-context', pendingCorrectionContext)
      pendingCorrectionContext = ''
    }
  })
  correctionWindow.once('ready-to-show', () => correctionWindow?.show())
  correctionWindow.on('closed', () => {
    correctionWindow = null
    pendingCorrectionContext = ''
  })

  if (isDevelopment) {
    await correctionWindow.loadURL('http://127.0.0.1:5173/#/corrections')
  } else {
    await correctionWindow.loadFile(frontendEntry(), { hash: '/corrections' })
  }
  if (correctionWindow && !correctionWindow.isDestroyed() && !correctionWindow.isVisible()) {
    correctionWindow.show()
    correctionWindow.focus()
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    try {
      mkdirSync(localDataDirectory(), { recursive: true })
      mkdirSync(localBackupDirectory(), { recursive: true })
      cleanupExpiredImports()
      const restoreResult = await applyPendingRestore()
      const secrets = loadOrCreateSecrets()
      localSecrets = secrets
      await presentInitialAdminPassword(secrets)
      configureAutoUpdater()
      ipcMain.handle('desktop-update-state', async (event, accessToken) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的更新状态请求来源')
        await requireAdminAccess(accessToken)
        return { ...updateState, currentVersion: app.getVersion(), supported: !isDevelopment }
      })
      ipcMain.handle('check-desktop-update', async (event, accessToken) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的更新检查来源')
        await requireAdminAccess(accessToken)
        if (isDevelopment) throw new Error('开发模式不检查安装包更新')
        await autoUpdater.checkForUpdates()
        return updateState
      })
      ipcMain.handle('download-desktop-update', async (event, accessToken) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的更新下载来源')
        await requireAdminAccess(accessToken)
        if (updateState.phase !== 'available') throw new Error('当前没有可下载的更新')
        await autoUpdater.downloadUpdate()
        return updateState
      })
      ipcMain.handle('install-desktop-update', async (event, accessToken) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的更新安装来源')
        await requireAdminAccess(accessToken)
        if (updateState.phase !== 'downloaded') throw new Error('更新尚未下载完成')
        quitting = true
        setImmediate(() => autoUpdater.quitAndInstall(false, true))
      })
      ipcMain.handle('cloud-sync-config', async (event, accessToken) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的云同步配置请求来源')
        await requireAdminAccess(accessToken)
        return {
          url: localSecrets?.cloudSync?.url || '',
          tokenConfigured: Boolean(localSecrets?.cloudSync?.token),
        }
      })
      ipcMain.handle('custom-backup-config', async (event, accessToken) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的备份配置请求来源')
        await requireAdminAccess(accessToken)
        const directory = localSecrets?.customBackupDirectory || ''
        return { directory, available: Boolean(directory && existsSync(directory)) }
      })
      ipcMain.handle('select-custom-backup-directory', async (event, accessToken) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的备份目录选择来源')
        await requireAdminAccess(accessToken)
        const result = await dialog.showOpenDialog(mainWindow, {
          title: '选择数据库镜像备份目录',
          defaultPath: localSecrets?.customBackupDirectory || app.getPath('documents'),
          properties: ['openDirectory', 'createDirectory'],
        })
        if (result.canceled || !result.filePaths[0]) return { canceled: true }
        const directory = validateCustomBackupDirectory(result.filePaths[0])
        localSecrets = { ...localSecrets, customBackupDirectory: directory }
        persistSecrets(localSecrets)
        return { canceled: false, directory }
      })
      ipcMain.handle('backup-to-custom-directory', async (event, accessToken) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的镜像备份请求来源')
        await requireAdminAccess(accessToken)
        const directory = validateCustomBackupDirectory(localSecrets?.customBackupDirectory)
        const sourcePath = path.join(localDataDirectory(), 'agriculture.db')
        if (!existsSync(sourcePath)) throw new Error('本地农业数据库尚未建立')
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const name = `agriculture-mirror-${stamp}-${randomUUID().slice(0, 8)}.db`
        const targetPath = path.join(directory, name)
        try {
          await snapshotLocalDataFile(sourcePath, targetPath)
          validateAgricultureDatabase(targetPath)
          return { name, filePath: targetPath, size: statSync(targetPath).size, createdAt: new Date().toISOString() }
        } catch (error) {
          rmSync(targetPath, { force: true })
          throw error
        }
      })
      ipcMain.handle('open-custom-backup-directory', async (event, accessToken) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的镜像备份目录请求来源')
        await requireAdminAccess(accessToken)
        const directory = validateCustomBackupDirectory(localSecrets?.customBackupDirectory)
        const error = await shell.openPath(directory)
        if (error) throw new Error(error)
      })
      ipcMain.handle('set-cloud-sync-config', async (event, accessToken, input) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的云同步配置请求来源')
        await requireAdminAccess(accessToken)
        const url = normalizeCloudUrl(input?.url)
        const enteredToken = typeof input?.token === 'string' ? input.token.trim() : ''
        const token = enteredToken || (url && url === localSecrets?.cloudSync?.url ? localSecrets.cloudSync.token : '')
        if ((url && !token) || (!url && token)) throw new Error('云端地址和同步令牌必须同时填写')
        if (token.length > 500) throw new Error('同步令牌长度不能超过 500 个字符')
        localSecrets = { ...localSecrets, cloudSync: { url, token } }
        persistSecrets(localSecrets)
        apiProcess?.postMessage({ type: 'cloud-sync-config', cloudUrl: url, cloudToken: token })
        return { url, tokenConfigured: Boolean(token) }
      })
      ipcMain.handle('open-correction-window', async (event, contextRoute) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的窗口请求来源')
        const safeContext = typeof contextRoute === 'string' ? contextRoute.slice(0, 200) : ''
        await createCorrectionWindow(safeContext)
      })
      ipcMain.handle('select-managed-document', async (event) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的文件选择来源')
        const result = await dialog.showOpenDialog(mainWindow, {
          title: '选择农业档案附件',
          properties: ['openFile'],
          filters: [
            { name: '档案文件', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png'] },
            { name: '所有文件', extensions: ['*'] },
          ],
        })
        if (result.canceled || !result.filePaths[0]) return { canceled: true }
        const sourcePath = result.filePaths[0]
        const directory = managedDocumentDirectory()
        mkdirSync(directory, { recursive: true })
        const fileName = path.basename(sourcePath)
        const managedName = `${Date.now()}-${randomUUID()}${path.extname(fileName)}`
        const filePath = path.join(directory, managedName)
        copyFileSync(sourcePath, filePath)
        return { canceled: false, filePath, fileName }
      })
      ipcMain.handle('open-managed-document', async (event, requestedPath) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的文件打开来源')
        if (typeof requestedPath !== 'string' || !requestedPath) throw new Error('附件路径无效')
        const directory = `${path.resolve(managedDocumentDirectory()).toLowerCase()}${path.sep}`
        const filePath = path.resolve(requestedPath)
        if (!`${filePath.toLowerCase()}`.startsWith(directory) || !existsSync(filePath)) throw new Error('附件不在受控档案目录或已丢失')
        const error = await shell.openPath(filePath)
        if (error) throw new Error(error)
      })
      ipcMain.handle('select-local-data-file', async (event, accessToken) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的本地数据文件选择来源')
        await requireAdminAccess(accessToken)
        const result = await dialog.showOpenDialog(mainWindow, {
          title: '选择要同步的 SQLite 数据文件',
          properties: ['openFile'],
          filters: [
            { name: 'SQLite 数据文件', extensions: ['db', 'sqlite', 'sqlite3'] },
          ],
        })
        if (result.canceled || !result.filePaths[0]) return { canceled: true }
        const selectedPath = result.filePaths[0]
        if (!['.db', '.sqlite', '.sqlite3'].includes(path.extname(selectedPath).toLowerCase())) {
          throw new Error('只支持 .db、.sqlite 或 .sqlite3 数据文件')
        }
        const importId = randomUUID()
        const importDirectory = path.join(localDataDirectory(), 'imports')
        const stagedPath = path.join(importDirectory, `${importId}.db`)
        mkdirSync(importDirectory, { recursive: true })
        try {
          await snapshotLocalDataFile(selectedPath, stagedPath)
          return {
            canceled: false,
            importId,
            fileName: path.basename(selectedPath),
            size: statSync(stagedPath).size,
          }
        } catch (error) {
          rmSync(stagedPath, { force: true })
          throw error
        }
      })
      ipcMain.handle('export-backup', async (event, accessToken, name) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的备份导出来源')
        await requireAdminAccess(accessToken)
        const sourcePath = controlledBackupPath(name)
        const result = await dialog.showSaveDialog(mainWindow, {
          title: '导出数据库备份',
          defaultPath: path.join(app.getPath('documents'), name),
          filters: [{ name: 'SQLite 数据库备份', extensions: ['db'] }],
        })
        if (result.canceled || !result.filePath) return { canceled: true }
        const destination = path.resolve(result.filePath)
        const backupDirectory = realpathSync(localBackupDirectory())
        const destinationDirectory = realpathSync(path.dirname(destination))
        if (
          destinationDirectory.toLowerCase() === backupDirectory.toLowerCase() ||
          destinationDirectory.toLowerCase().startsWith(`${backupDirectory.toLowerCase()}${path.sep}`)
        ) {
          throw new Error('不能覆盖程序受控备份目录中的历史备份，请选择其他位置')
        }
        if (existsSync(destination)) {
          const destinationStats = statSync(destination)
          for (const backupName of readdirSync(backupDirectory)) {
            if (!/^agriculture-.+\.db$/.test(backupName)) continue
            const backupStats = statSync(path.join(backupDirectory, backupName))
            if (backupStats.dev === destinationStats.dev && backupStats.ino === destinationStats.ino) {
              throw new Error('导出位置不能指向程序受控目录中的备份文件')
            }
          }
        }
        copyFileSync(sourcePath, destination)
        return { canceled: false, filePath: result.filePath }
      })
      ipcMain.handle('open-backup-directory', async (event, accessToken) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的备份目录请求来源')
        await requireAdminAccess(accessToken)
        const directory = localBackupDirectory()
        mkdirSync(directory, { recursive: true })
        const error = await shell.openPath(directory)
        if (error) throw new Error(error)
      })
      ipcMain.handle('restore-backup', async (event, input) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的备份恢复来源')
        const name = input?.name
        const accessToken = typeof input?.accessToken === 'string' ? input.accessToken : ''
        const operationToken = typeof input?.operationToken === 'string' ? input.operationToken : ''
        if (!accessToken || !operationToken) throw new Error('缺少数据库恢复多重验证凭据')
        const authorizationResponse = await fetch(`${apiBaseUrl}/system/authorize-database-restore`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'x-operation-authorization': operationToken,
          },
        })
        if (!authorizationResponse.ok) {
          const payload = await authorizationResponse.json().catch(() => ({}))
          throw new Error(payload?.message || '数据库恢复授权无效或已过期')
        }
        const sourcePath = controlledBackupPath(name)
        validateAgricultureDatabase(sourcePath)
        const requestPath = pendingRestorePath()
        mkdirSync(path.dirname(requestPath), { recursive: true })
        writeFileSync(requestPath, JSON.stringify({ name, requestedAt: new Date().toISOString() }), { encoding: 'utf8', mode: 0o600 })
        setImmediate(() => {
          app.relaunch()
          app.quit()
        })
        return { scheduled: true }
      })
      configureBluetooth()
      startBackend(secrets)
      await waitForBackend()
      backendReady = true
      await createWindow()
      if (!isDevelopment) {
        setTimeout(() => autoUpdater.checkForUpdates().catch(() => undefined), 8000)
      }
      if (restoreResult?.restored) {
        await dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: '数据库已恢复',
          message: `已从 ${restoreResult.name} 恢复本地数据。`,
          detail: restoreResult.safetyBackupName ? `恢复前数据已另存为 ${restoreResult.safetyBackupName}。` : '',
        })
      } else if (restoreResult) {
        await dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: '数据库恢复失败',
          message: restoreResult.error,
          detail: '原数据库未被替换，可以继续使用。',
        })
      }
    } catch (error) {
      await dialog.showMessageBox({
        type: 'error',
        title: '丰域农业启动失败',
        message: error instanceof Error ? error.message : '桌面应用启动失败',
      })
      app.quit()
    }
  })
}

app.on('window-all-closed', () => app.quit())
app.on('before-quit', (event) => {
  if (!apiProcess || shutdownStarted) return
  event.preventDefault()
  quitting = true
  shutdownStarted = true
  const child = apiProcess
  const shutdownTimeout = setTimeout(() => {
    child.kill()
    app.exit(0)
  }, 5000)
  child.once('exit', () => {
    clearTimeout(shutdownTimeout)
    app.exit(0)
  })
  child.postMessage({ type: 'shutdown' })
})
