import { request } from '../utils/request'

export const getDashboard = () => request({ url: '/dashboard' })
export const getFields = () => request({ url: '/fields' })
export const getTasks = () => request({ url: '/tasks' })
export const getDevices = () => request({ url: '/devices' })
export const getInventory = () => request({ url: '/inventory' })
export const getPurchases = () => request({ url: '/purchases' })
export const getHealth = () => request({ url: '/health' })

export function uprootField(id, reason, operationToken) {
  return request({
    url: `/fields/${encodeURIComponent(id)}/uproot`,
    method: 'PATCH',
    data: { reason },
    header: { 'x-operation-authorization': operationToken }
  })
}

export function createPurchase(data) {
  return request({ url: '/purchases', method: 'POST', data })
}

export function receivePurchase(id, operator) {
  return request({
    url: `/purchases/${encodeURIComponent(id)}/receive`,
    method: 'PATCH',
    data: { operator }
  })
}

export function updateTaskStatus(id, status) {
  return request({
    url: `/tasks/${encodeURIComponent(id)}/status`,
    method: 'PATCH',
    data: { status }
  })
}
