import { request } from '../utils/request'

export function login(credentials) {
  return request({
    url: '/auth/login',
    method: 'POST',
    data: credentials,
    handleAuthFailure: false
  })
}
