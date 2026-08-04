const { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell, utilityProcess } = require('electron')
const { randomBytes, randomUUID } = require('node:crypto')
const { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const isDevelopment = process.argv.includes('--dev')
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
    return JSON.parse(safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64')))
  }

  const secrets = {
    adminPassword: randomBytes(9).toString('base64url'),
    token: randomBytes(32).toString('base64url'),
    deviceKey: randomBytes(24).toString('base64url'),
    cloudSync: { url: '', token: '' },
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
  return path.join(app.getAppPath(), 'renderer', 'dist', 'index.html')
}

function managedDocumentDirectory() {
  return path.join(app.getPath('userData'), 'documents')
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
      const secrets = loadOrCreateSecrets()
      localSecrets = secrets
      ipcMain.handle('local-admin-password', (event) => {
        if (!trustedRendererUrl(event.senderFrame.url)) throw new Error('不允许的凭据请求来源')
        return localSecrets?.adminPassword || ''
      })
      ipcMain.handle('cloud-sync-config', (event) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的云同步配置请求来源')
        return {
          url: localSecrets?.cloudSync?.url || '',
          tokenConfigured: Boolean(localSecrets?.cloudSync?.token),
        }
      })
      ipcMain.handle('set-cloud-sync-config', (event, input) => {
        const sourceUrl = event.senderFrame?.url || event.sender.getURL()
        if (!trustedRendererUrl(sourceUrl)) throw new Error('不允许的云同步配置请求来源')
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
      configureBluetooth()
      startBackend(secrets)
      await waitForBackend()
      backendReady = true
      await createWindow()
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
