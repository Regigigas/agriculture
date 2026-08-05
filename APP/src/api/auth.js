import { request } from '../utils/request'

export function login(credentials) {
  return request({
    url: '/auth/login',
    method: 'POST',
    data: credentials,
    handleAuthFailure: false
  })
}

export function register(account) {
  return request({
    url: '/auth/register',
    method: 'POST',
    data: account,
    handleAuthFailure: false
  })
}

export function createUser(account) {
  return request({
    url: '/auth/users',
    method: 'POST',
    data: account
  })
}

export function logout() {
  return request({ url: '/auth/logout', method: 'POST', handleAuthFailure: false })
}

export function changePassword(passwords) {
  return request({
    url: '/auth/password',
    method: 'PATCH',
    data: passwords
  })
}

export function searchUsers(query = '') {
  return request({ url: `/auth/users?q=${encodeURIComponent(query)}` })
}
