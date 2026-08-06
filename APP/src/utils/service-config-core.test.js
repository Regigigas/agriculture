import { describe, expect, it } from 'vitest'
import { normalizeApiBaseUrl, normalizeServiceConfig, sameService } from './service-config-core'

describe('服务连接配置', () => {
  it('规范化 HTTP(S) 地址并移除末尾斜杠', () => {
    expect(normalizeApiBaseUrl(' http://192.168.1.10:3100/api/ ', true)).toBe('http://192.168.1.10:3100/api')
    expect(normalizeApiBaseUrl('https://farm.example.com/api///')).toBe('https://farm.example.com/api')
  })

  it('拒绝非 HTTP(S)、凭据和查询参数', () => {
    expect(() => normalizeApiBaseUrl('ws://192.168.1.10/api')).toThrow('HTTP')
    expect(() => normalizeApiBaseUrl('https://user:pass@example.com/api')).toThrow('账号或密码')
    expect(() => normalizeApiBaseUrl('https://example.com/api?token=1')).toThrow('查询参数')
    expect(() => normalizeApiBaseUrl('http://farm.example.com/api')).toThrow('HTTPS')
  })

  it('线上模式允许覆盖环境默认地址', () => {
    const config = normalizeServiceConfig(
      { mode: 'cloud', baseUrl: 'https://old.example.com/api' },
      'https://farm.example.com/api'
    )
    expect(config).toEqual({ mode: 'cloud', baseUrl: 'https://old.example.com/api' })
    expect(sameService(config, { ...config })).toBe(true)
  })

  it('本地模式必须显式填写 Electron 地址', () => {
    expect(() => normalizeServiceConfig({ mode: 'local', baseUrl: '' }, 'https://farm.example.com/api')).toThrow('请输入服务地址')
  })
})
