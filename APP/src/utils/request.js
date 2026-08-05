import { getServiceConfig } from './service-config'

const TOKEN_KEY = 'agriculture_token'

let unauthorizedHandler = null
let handlingUnauthorized = false
let requestGeneration = 0

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
}

function handleUnauthorized() {
  if (handlingUnauthorized) return
  handlingUnauthorized = true
  uni.removeStorageSync(TOKEN_KEY)
  if (unauthorizedHandler) unauthorizedHandler()
  uni.reLaunch({ url: '/pages/login/index' })
}

export function resetUnauthorizedState() {
  handlingUnauthorized = false
}

export function invalidatePendingRequests() {
  requestGeneration += 1
}

export function request({ url, method = 'GET', data, header = {}, handleAuthFailure = true }) {
  const generation = requestGeneration
  const token = uni.getStorageSync(TOKEN_KEY)
  const apiBaseUrl = getApiBaseUrl()

  return new Promise((resolve, reject) => {
    uni.request({
      url: `${apiBaseUrl}${url}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...header
      },
      success(response) {
        if (generation !== requestGeneration) {
          const error = new Error('会话已切换，请重新操作')
          error.name = 'StaleSessionError'
          reject(error)
          return
        }
        const { statusCode, data: responseData } = response

        if (statusCode >= 200 && statusCode < 300) {
          resolve(responseData)
          return
        }

        const error = new Error(responseData?.message || `请求失败（${statusCode}）`)
        if (statusCode === 401 && handleAuthFailure) {
          error.name = 'UnauthorizedError'
          handleUnauthorized()
        }
        reject(error)
      },
      fail(error) {
        if (generation !== requestGeneration) {
          const staleError = new Error('会话已切换，请重新操作')
          staleError.name = 'StaleSessionError'
          reject(staleError)
          return
        }
        reject(new Error(error.errMsg || '网络连接失败'))
      }
    })
  })
}

export function getApiBaseUrl() {
  return getServiceConfig().baseUrl
}

export { TOKEN_KEY }
