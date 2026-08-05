import { getApiBaseUrl } from './request'

// #ifdef APP-PLUS
import { chooseUpdatePackage, inspectUpdatePackage } from '@/uni_modules/agri-update-picker'
// #endif

const UPDATE_SETTINGS_KEY = 'agriculture_update_settings'
const configuredUpdateUrl = String(import.meta.env.VITE_APP_UPDATE_URL || '').trim()

export function getDefaultUpdateUrl() {
  return configuredUpdateUrl || `${getApiBaseUrl()}/app-update/latest`
}

function parseUrl(value, label = '更新地址') {
  const text = String(value || '').trim()
  if (!text) throw new Error(`请输入${label}`)

  let parsed
  try {
    parsed = new URL(text)
  } catch {
    throw new Error(`${label}格式不正确`)
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${label}仅支持 HTTP 或 HTTPS`)
  }
  const hostname = parsed.hostname.toLowerCase()
  const privateAddress = hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname.endsWith('.local')
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  if (parsed.protocol === 'http:' && !privateAddress) {
    throw new Error(`${label}在公网环境必须使用 HTTPS`)
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label}不能包含账号或密码`)
  }
  parsed.hash = ''
  return parsed
}

function resolvePackageUrl(value, sourceUrl) {
  const text = String(value || '').trim()
  if (!text) return ''
  try {
    return parseUrl(new URL(text, sourceUrl).toString(), '安装包地址').toString()
  } catch {
    throw new Error('服务端返回的安装包地址无效')
  }
}

function appendQuery(url, params) {
  const parsed = parseUrl(url)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) {
      parsed.searchParams.set(key, String(value))
    }
  })
  return parsed.toString()
}

function compareVersions(left, right) {
  const normalize = (value) => String(value || '0')
    .split(/[.-]/)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()))
  const leftParts = normalize(left)
  const rightParts = normalize(right)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0
    if (leftPart === rightPart) continue
    if (typeof leftPart === 'number' && typeof rightPart === 'number') return leftPart > rightPart ? 1 : -1
    if (typeof leftPart === 'number') return 1
    if (typeof rightPart === 'number') return -1
    return leftPart > rightPart ? 1 : -1
  }
  return 0
}

function normalizeDescription(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).join('\n')
  return String(value || '')
}

function normalizeType(value, code) {
  const type = String(value || '').toLowerCase()
  if (['wgt', 'hotfix', 'resource'].includes(type) || Number(code) === 101) return 'wgt'
  if (['store', 'appstore'].includes(type)) return 'store'
  return 'apk'
}

function normalizeUpdateResponse(responseData, runtime, sourceUrl) {
  if (!responseData || typeof responseData !== 'object') throw new Error('更新服务返回的数据格式不正确')

  const code = Number(responseData.code)
  const payload = responseData.data && typeof responseData.data === 'object'
    ? responseData.data
    : responseData

  if (code === 0 || payload.hasUpdate === false || payload.available === false) {
    return {
      available: false,
      message: String(responseData.message || payload.message || '当前已是最新版本')
    }
  }

  const type = normalizeType(payload.type || payload.updateType, code)
  const versionName = String(payload.versionName || payload.version || '').trim()
  const versionCode = Number(payload.versionCode || payload.version_code || 0)
  const serverDeclaresUpdate = [101, 102].includes(code) || payload.hasUpdate === true || payload.available === true
  const newer = type === 'wgt'
    ? compareVersions(versionName, runtime.wgtVersion || runtime.appVersion) > 0
    : versionCode > runtime.versionCode

  if (type === 'wgt' && !newer) {
    return { available: false, message: '当前已是最新版本' }
  }
  if (!serverDeclaresUpdate && !newer) {
    return { available: false, message: '当前已是最新版本' }
  }
  if (type !== 'wgt' && versionCode > 0 && versionCode <= runtime.versionCode) {
    return { available: false, message: '当前已是最新版本' }
  }

  const packageUrl = resolvePackageUrl(
    payload.downloadUrl || payload.packageUrl || payload.url || payload.storeUrl,
    sourceUrl
  )
  if (!packageUrl) throw new Error('更新服务未提供安装包地址')
  if (!versionName) throw new Error('更新服务未提供版本名称')
  if (type !== 'wgt' && (!Number.isInteger(versionCode) || versionCode <= 0)) {
    throw new Error('更新服务返回的版本号无效')
  }

  const sha256 = String(payload.sha256 || '').trim().toLowerCase()
  if (sha256 && !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('更新服务返回的 SHA-256 无效')
  if (type === 'wgt' && !sha256) throw new Error('WGT 更新必须提供 SHA-256 校验值')

  return {
    available: true,
    type,
    versionName,
    versionCode,
    title: String(payload.title || `发现新版本 ${versionName}`),
    description: normalizeDescription(payload.description || payload.contents || payload.releaseNotes),
    packageUrl,
    storeUrl: resolvePackageUrl(payload.storeUrl || '', sourceUrl),
    size: Math.max(0, Number(payload.size || 0)),
    sha256,
    mandatory: Boolean(payload.mandatory ?? payload.isMandatory),
    publishedAt: String(payload.publishedAt || payload.published_at || ''),
    sourceHost: parseUrl(sourceUrl).host
  }
}

export function getUpdateSettings() {
  const stored = uni.getStorageSync(UPDATE_SETTINGS_KEY)
  if (!stored || typeof stored !== 'object') return { source: 'default', customUrl: '' }
  return {
    source: stored.source === 'custom' ? 'custom' : 'default',
    customUrl: String(stored.customUrl || '').trim()
  }
}

export function saveUpdateSettings(settings) {
  const source = settings.source === 'custom' ? 'custom' : 'default'
  const customUrl = String(settings.customUrl || '').trim()
  if (source === 'custom') parseUrl(customUrl, '自定义更新地址')
  const normalized = { source, customUrl }
  uni.setStorageSync(UPDATE_SETTINGS_KEY, normalized)
  return normalized
}

export function getActiveUpdateUrl(settings = getUpdateSettings()) {
  return settings.source === 'custom'
    ? parseUrl(settings.customUrl, '自定义更新地址').toString()
    : parseUrl(getDefaultUpdateUrl(), '默认更新地址').toString()
}

export function getRuntimeInfo() {
  let appBaseInfo = {}
  let systemInfo = {}
  try {
    appBaseInfo = typeof uni.getAppBaseInfo === 'function' ? uni.getAppBaseInfo() : {}
    systemInfo = uni.getSystemInfoSync()
  } catch {
    // Older runtimes may not expose getAppBaseInfo.
  }

  return new Promise((resolve) => {
    const finish = (runtimeProperties = {}) => {
      const platform = String(runtimeProperties.platform || systemInfo.uniPlatform || systemInfo.platform || 'unknown').toLowerCase()
      resolve({
        appId: String(appBaseInfo.appId || runtimeProperties.appid || ''),
        appName: String(appBaseInfo.appName || runtimeProperties.name || '田间管理'),
        appVersion: String(runtimeProperties.version || appBaseInfo.appVersion || '1.0.0'),
        versionCode: Number(runtimeProperties.versionCode || appBaseInfo.appVersionCode || 0),
        wgtVersion: String(runtimeProperties.version || appBaseInfo.appVersion || '1.0.0'),
        platform
      })
    }

    // #ifdef APP-PLUS
    plus.runtime.getProperty(plus.runtime.appid, (properties) => finish({
      ...properties,
      appid: plus.runtime.appid,
      platform: plus.os.name
    }))
    // #endif

    // #ifndef APP-PLUS
    finish()
    // #endif
  })
}

export async function checkForUpdate(updateUrl, runtime) {
  const currentRuntime = runtime || await getRuntimeInfo()
  const requestUrl = appendQuery(updateUrl, {
    appid: currentRuntime.appId,
    platform: currentRuntime.platform,
    appVersion: currentRuntime.appVersion,
    versionCode: currentRuntime.versionCode,
    wgtVersion: currentRuntime.wgtVersion
  })

  const responseData = await new Promise((resolve, reject) => {
    uni.request({
      url: requestUrl,
      method: 'GET',
      timeout: 15000,
      header: { Accept: 'application/json' },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data)
          return
        }
        reject(new Error(response.data?.message || `更新服务请求失败（${response.statusCode}）`))
      },
      fail(error) {
        reject(new Error(error.errMsg || '无法连接更新服务'))
      }
    })
  })

  return normalizeUpdateResponse(responseData, currentRuntime, updateUrl)
}

export function createUpdateDownload(packageUrl, onProgress) {
  let downloadTask
  const promise = new Promise((resolve, reject) => {
    downloadTask = uni.downloadFile({
      url: parseUrl(packageUrl, '安装包地址').toString(),
      timeout: 10 * 60 * 1000,
      success(result) {
        if (result.statusCode === 200 && result.tempFilePath) {
          resolve(result.tempFilePath)
          return
        }
        reject(new Error(`安装包下载失败（${result.statusCode || '未知状态'}）`))
      },
      fail(error) {
        if (String(error.errMsg || '').includes('abort')) {
          reject(new Error('下载已取消'))
          return
        }
        reject(new Error(error.errMsg || '安装包下载失败'))
      }
    })
    if (downloadTask && typeof downloadTask.onProgressUpdate === 'function') {
      downloadTask.onProgressUpdate((progress) => onProgress?.(Math.max(0, Math.min(100, progress.progress || 0))))
    }
  })

  return {
    promise,
    abort() {
      downloadTask?.abort()
    }
  }
}

export function installUpdatePackage(filePath, type) {
  return new Promise((resolve, reject) => {
    // #ifdef APP-PLUS
    plus.runtime.install(
      filePath,
      { force: false },
      () => {
        if (type === 'wgt') {
          plus.runtime.restart()
          return
        }
        resolve()
      },
      (error) => reject(new Error(error.message || '安装更新失败'))
    )
    // #endif

    // #ifndef APP-PLUS
    reject(new Error('当前平台不支持直接安装更新包'))
    // #endif
  })
}

export function verifyUpdatePackage(filePath, update) {
  return new Promise((resolve, reject) => {
    // #ifdef APP-PLUS
    if (plus.os.name !== 'Android') {
      resolve()
      return
    }
    if (!update.size && !update.sha256) {
      resolve()
      return
    }
    const absolutePath = plus.io.convertLocalFileSystemURL(filePath)
    inspectUpdatePackage({
      path: absolutePath,
      success(result) {
        if (update.size > 0 && Number(result.size) !== Number(update.size)) {
          reject(new Error('安装包大小与更新信息不一致'))
          return
        }
        if (update.sha256 && String(result.sha256).toLowerCase() !== update.sha256) {
          reject(new Error('安装包 SHA-256 校验失败'))
          return
        }
        resolve()
      },
      fail: (error) => reject(new Error(error.errMsg || '无法校验安装包'))
    })
    // #endif

    // #ifndef APP-PLUS
    resolve()
    // #endif
  })
}

export function openExternalUrl(url) {
  const targetUrl = parseUrl(url, '跳转地址').toString()
  // #ifdef APP-PLUS
  plus.runtime.openURL(targetUrl)
  // #endif

  // #ifdef H5
  window.location.assign(targetUrl)
  // #endif
}

export function chooseLocalUpdatePackage() {
  return new Promise((resolve, reject) => {
    // #ifdef APP-PLUS
    if (plus.os.name !== 'Android') {
      reject(new Error('本地更新仅支持 Android App'))
      return
    }
    chooseUpdatePackage({
      success: resolve,
      fail: (error) => reject(new Error(error.errMsg || '未能读取更新包'))
    })
    // #endif

    // #ifndef APP-PLUS
    reject(new Error('本地更新仅支持 Android App'))
    // #endif
  })
}

export function getPackageType(fileName) {
  const lowerName = String(fileName || '').toLowerCase()
  if (lowerName.endsWith('.apk')) return 'apk'
  if (lowerName.endsWith('.wgt')) return 'wgt'
  throw new Error('只支持 APK 或 WGT 更新包')
}

export { UPDATE_SETTINGS_KEY }
