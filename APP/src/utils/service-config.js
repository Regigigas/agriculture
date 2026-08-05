import { normalizeApiBaseUrl, normalizeServiceConfig, SERVICE_MODES } from './service-config-core'

export const SERVICE_CONFIG_KEY = 'agriculture_service_config'
export const CLOUD_API_BASE_URL = normalizeApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3100/api'
)

export function getServiceConfig() {
  const stored = uni.getStorageSync(SERVICE_CONFIG_KEY)
  try {
    return normalizeServiceConfig(stored, CLOUD_API_BASE_URL)
  } catch {
    return { mode: SERVICE_MODES.CLOUD, baseUrl: CLOUD_API_BASE_URL }
  }
}

export function saveServiceConfig(config) {
  const normalized = normalizeServiceConfig(config, CLOUD_API_BASE_URL)
  uni.setStorageSync(SERVICE_CONFIG_KEY, normalized)
  return normalized
}

export function serviceModeText(mode) {
  return mode === SERVICE_MODES.LOCAL ? 'Electron 本地' : '线上服务'
}
