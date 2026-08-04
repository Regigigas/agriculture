const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3100/api').replace(/\/$/, '')
const TOKEN_KEY = 'agriculture_token'

let unauthorizedHandler = null
let handlingUnauthorized = false

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

export function request({ url, method = 'GET', data, header = {}, handleAuthFailure = true }) {
  const token = uni.getStorageSync(TOKEN_KEY)

  return new Promise((resolve, reject) => {
    uni.request({
      url: `${API_BASE_URL}${url}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...header
      },
      success(response) {
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
        reject(new Error(error.errMsg || '网络连接失败'))
      }
    })
  })
}

export { API_BASE_URL, TOKEN_KEY }
