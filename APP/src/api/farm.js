import { request } from '../utils/request'

export const getDashboard = () => request({ url: '/dashboard' })
export const getFields = () => request({ url: '/fields' })
export const getTasks = () => request({ url: '/tasks' })
export const getDevices = () => request({ url: '/devices' })

export function updateTaskStatus(id, status) {
  return request({
    url: `/tasks/${encodeURIComponent(id)}/status`,
    method: 'PATCH',
    data: { status }
  })
}
