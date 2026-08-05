export const SERVICE_MODES = Object.freeze({
  LOCAL: 'local',
  CLOUD: 'cloud'
})

export function normalizeApiBaseUrl(value) {
  const text = String(value || '').trim()
  if (!text) throw new Error('请输入服务地址')

  let parsed
  try {
    parsed = new URL(text)
  } catch {
    throw new Error('服务地址格式不正确')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('服务地址仅支持 HTTP 或 HTTPS')
  }
  if (parsed.username || parsed.password) {
    throw new Error('服务地址不能包含账号或密码')
  }
  if (parsed.search || parsed.hash) {
    throw new Error('服务地址不能包含查询参数或锚点')
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  return parsed.toString().replace(/\/$/, '')
}

export function normalizeServiceConfig(config, cloudBaseUrl) {
  const mode = config?.mode === SERVICE_MODES.LOCAL ? SERVICE_MODES.LOCAL : SERVICE_MODES.CLOUD
  const source = mode === SERVICE_MODES.LOCAL ? config?.baseUrl : cloudBaseUrl
  return { mode, baseUrl: normalizeApiBaseUrl(source) }
}

export function sameService(left, right) {
  return left?.mode === right?.mode && left?.baseUrl === right?.baseUrl
}
