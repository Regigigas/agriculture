<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { Bluetooth, Check, Cloud, Copy, Database, Laptop, RadioTower, RefreshCw, ShieldAlert, Wifi } from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import { request } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

interface ConnectionInfo {
  serverId: string
  hostname: string
  port: number
  addresses: string[]
  deviceKey: string
  features: {
    offlineStorage: boolean
    localWifi: boolean
    bluetoothBridge: boolean
  }
}

interface SyncStatus {
  configured: boolean
  cloudUrl: string
  running: boolean
  pendingCount: number
  conflictCount: number
  cursor: number
  lastSuccessAt: string
  lastAttemptAt: string
  lastError: string
}

interface SyncConflict {
  id: string
  collection: string
  entityId: string
  remoteRevision: number
  createdAt: string
}

interface BluetoothDeviceLike {
  id: string
  name?: string
  gatt?: {
    connected: boolean
    connect(): Promise<{ connected: boolean }>
    disconnect(): void
  }
}

interface BluetoothNavigator extends Navigator {
  bluetooth?: {
    requestDevice(options: { acceptAllDevices: boolean }): Promise<BluetoothDeviceLike>
  }
}

const message = useMessage()
const auth = useAuthStore()
const connection = ref<ConnectionInfo | null>(null)
const loading = ref(false)
const error = ref('')
const bluetoothDevice = ref<BluetoothDeviceLike | null>(null)
const bluetoothBusy = ref(false)
const isDesktop = Boolean(window.agricultureDesktop?.isDesktop)
const sync = ref<SyncStatus | null>(null)
const syncConflicts = ref<SyncConflict[]>([])
const cloudUrl = ref('')
const cloudToken = ref('')
const tokenConfigured = ref(false)
const syncBusy = ref(false)
const configBusy = ref(false)
const bluetoothSupported = computed(() => Boolean((navigator as BluetoothNavigator).bluetooth))
const bluetoothConnected = computed(() => Boolean(bluetoothDevice.value?.gatt?.connected))

async function loadConnection() {
  loading.value = true
  error.value = ''
  try {
    const [connectionInfo, syncStatus, conflicts, config] = await Promise.all([
      request<ConnectionInfo>('/system/connection'),
      request<SyncStatus>('/system/sync/status'),
      request<SyncConflict[]>('/system/sync/conflicts'),
      window.agricultureDesktop?.getCloudSyncConfig(auth.token) ?? Promise.resolve({ url: '', tokenConfigured: false }),
    ])
    connection.value = connectionInfo
    sync.value = syncStatus
    syncConflicts.value = conflicts
    cloudUrl.value = config.url || syncStatus.cloudUrl
    tokenConfigured.value = config.tokenConfigured
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法读取本地连接信息'
  } finally {
    loading.value = false
  }
}

async function saveCloudConfig() {
  if (!window.agricultureDesktop) return message.warning('云同步凭据只能在 Electron 桌面端配置')
  configBusy.value = true
  try {
    const config = await window.agricultureDesktop.setCloudSyncConfig(auth.token, { url: cloudUrl.value, token: cloudToken.value })
    cloudUrl.value = config.url
    cloudToken.value = ''
    tokenConfigured.value = config.tokenConfigured
    message.success(config.tokenConfigured ? '云同步配置已安全保存' : '云同步配置已清除')
    await new Promise((resolve) => setTimeout(resolve, 300))
    await waitForSyncCompletion()
  } catch (cause) {
    message.error(cause instanceof Error ? cause.message : '保存云同步配置失败')
  } finally {
    configBusy.value = false
  }
}

async function loadSyncState() {
  const [status, conflicts] = await Promise.all([
    request<SyncStatus>('/system/sync/status'),
    request<SyncConflict[]>('/system/sync/conflicts'),
  ])
  sync.value = status
  syncConflicts.value = conflicts
}

async function waitForSyncCompletion() {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    await loadSyncState()
    if (!sync.value?.running) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('同步仍在后台运行，请稍后刷新状态')
}

async function runSync() {
  syncBusy.value = true
  try {
    sync.value = await request<SyncStatus>('/system/sync/run', { method: 'POST' })
    await waitForSyncCompletion()
    if (sync.value?.lastError) throw new Error(sync.value.lastError)
    message.success('云端增量同步已完成')
  } catch (cause) {
    message.error(cause instanceof Error ? cause.message : '云端同步失败')
    await loadSyncState().catch(() => undefined)
  } finally {
    syncBusy.value = false
  }
}

async function resolveConflict(id: string, strategy: 'local' | 'remote') {
  try {
    sync.value = await request<SyncStatus>(`/system/sync/conflicts/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ strategy }),
    })
    syncConflicts.value = await request<SyncConflict[]>('/system/sync/conflicts')
    message.success(strategy === 'local' ? '已保留本机版本，等待下次上传' : '已采用云端版本')
  } catch (cause) {
    message.error(cause instanceof Error ? cause.message : '处理同步冲突失败')
  }
}

function displayTime(value: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未同步'
}

async function copyAddress(address: string) {
  try {
    await navigator.clipboard.writeText(address)
    message.success('局域网地址已复制')
  } catch {
    message.error('复制失败，请手动记录地址')
  }
}

async function connectBluetooth() {
  const bluetooth = (navigator as BluetoothNavigator).bluetooth
  if (!bluetooth) {
    message.warning('当前运行环境不支持 Web Bluetooth，请使用 Electron 桌面端')
    return
  }

  bluetoothBusy.value = true
  try {
    const device = await bluetooth.requestDevice({ acceptAllDevices: true })
    if (!device.gatt) throw new Error('设备不支持 BLE GATT 连接')
    await device.gatt.connect()
    bluetoothDevice.value = device
    message.success(`${device.name || device.id} 的 GATT 连接测试成功`)
  } catch (cause) {
    const text = cause instanceof Error ? cause.message : '蓝牙连接失败'
    if (!text.toLowerCase().includes('cancel')) message.error(text)
  } finally {
    bluetoothBusy.value = false
  }
}

function disconnectBluetooth() {
  bluetoothDevice.value?.gatt?.disconnect()
  bluetoothDevice.value = null
}

onMounted(loadConnection)
</script>

<template>
  <page-header title="连接中心" description="管理离线数据服务、局域网终端和现场蓝牙设备">
    <n-button secondary :loading="loading" @click="loadConnection"><template #icon><RefreshCw /></template>刷新状态</n-button>
  </page-header>

  <state-panel :loading="loading" :error="error" @retry="loadConnection">
    <div v-if="connection" class="connection-layout">
      <section class="connection-panel">
        <div class="panel-heading"><span class="panel-icon local"><Database /></span><div><h2>本地数据服务</h2><p>SQLite 数据保存在当前农场电脑，断开公网仍可运行</p></div><n-tag type="success" :bordered="false"><template #icon><Check /></template>运行中</n-tag></div>
        <dl class="detail-grid">
          <div><dt>主机名称</dt><dd>{{ connection.hostname }}</dd></div>
          <div><dt>服务端口</dt><dd>{{ connection.port }}</dd></div>
          <div><dt>服务器标识</dt><dd class="mono">{{ connection.serverId }}</dd></div>
          <div><dt>桌面环境</dt><dd>{{ isDesktop ? 'Electron 桌面端' : '浏览器管理端' }}</dd></div>
          <div><dt>采集终端密钥</dt><dd class="mono">{{ connection.deviceKey }}</dd></div>
        </dl>
      </section>

      <section class="connection-panel">
        <div class="panel-heading"><span class="panel-icon cloud"><Cloud /></span><div><h2>云端增量同步</h2><p>本机持续离线工作，联网后按版本游标双向同步结构化业务数据</p></div><n-tag :bordered="false" :type="sync?.configured ? (sync?.lastError ? 'error' : 'success') : 'default'">{{ sync?.running ? '同步中' : sync?.configured ? '已配置' : '未配置' }}</n-tag></div>
        <div class="cloud-config">
          <n-input v-model:value="cloudUrl" :disabled="!isDesktop" placeholder="https://cloud.example.com/api" aria-label="云端 API 地址" />
          <n-input v-model:value="cloudToken" :disabled="!isDesktop" type="password" show-password-on="click" :placeholder="tokenConfigured ? '令牌已安全保存，留空则保持不变' : '输入云端同步令牌'" aria-label="云端同步令牌" />
          <n-button secondary :disabled="!isDesktop" :loading="configBusy" @click="saveCloudConfig">保存配置</n-button>
        </div>
        <dl v-if="sync" class="sync-stats">
          <div><dt>待上传</dt><dd>{{ sync.pendingCount }}</dd></div>
          <div><dt>同步冲突</dt><dd :class="{ warning: sync.conflictCount > 0 }">{{ sync.conflictCount }}</dd></div>
          <div><dt>云端游标</dt><dd>{{ sync.cursor }}</dd></div>
          <div><dt>最近成功</dt><dd>{{ displayTime(sync.lastSuccessAt) }}</dd></div>
        </dl>
        <div class="sync-actions">
          <span>{{ sync?.lastAttemptAt ? `最近尝试：${displayTime(sync.lastAttemptAt)}` : '等待首次同步' }}</span>
          <n-button type="primary" :disabled="!sync?.configured" :loading="syncBusy || sync?.running" @click="runSync"><template #icon><RefreshCw /></template>立即同步</n-button>
        </div>
        <n-alert v-if="sync?.lastError" class="sync-alert" type="error" :bordered="false">{{ sync.lastError }}</n-alert>
        <div v-if="syncConflicts.length" class="conflict-list">
          <div class="conflict-title"><ShieldAlert /><strong>需要处理的版本冲突</strong></div>
          <div v-for="item in syncConflicts" :key="item.id" class="conflict-row">
            <div><strong>{{ item.collection }}</strong><span>{{ item.entityId }} · 云端版本 {{ item.remoteRevision }} · {{ displayTime(item.createdAt) }}</span></div>
            <div><n-button size="small" secondary @click="resolveConflict(item.id, 'remote')">采用云端</n-button><n-button size="small" type="warning" secondary @click="resolveConflict(item.id, 'local')">保留本机</n-button></div>
          </div>
        </div>
      </section>

      <section class="connection-panel">
        <div class="panel-heading"><span class="panel-icon wifi"><Wifi /></span><div><h2>本地 Wi-Fi</h2><p>手机与采集终端接入同一局域网后使用以下 API 地址</p></div><n-tag :bordered="false" type="info">局域网</n-tag></div>
        <div v-if="connection.addresses.length" class="address-list">
          <div v-for="address in connection.addresses" :key="address" class="address-row"><RadioTower /><code>{{ address }}</code><n-button quaternary circle title="复制地址" @click="copyAddress(address)"><template #icon><Copy /></template></n-button></div>
        </div>
        <n-empty v-else description="未检测到可用的局域网 IPv4 地址" size="small" />
      </section>

      <section class="connection-panel">
        <div class="panel-heading"><span class="panel-icon bluetooth"><Bluetooth /></span><div><h2>蓝牙连接测试</h2><p>验证附近 BLE 设备能否建立 GATT 连接，不读取或保存业务数据</p></div><n-tag :bordered="false" :type="bluetoothConnected ? 'success' : 'warning'">{{ bluetoothConnected ? '测试已连接' : '协议未配置' }}</n-tag></div>
        <div class="bluetooth-action">
          <div class="device-state"><Laptop /><div><strong>{{ bluetoothDevice?.name || '尚未选择设备' }}</strong><span>{{ bluetoothDevice?.id || (bluetoothSupported ? '可扫描附近 BLE 设备' : '当前环境不支持 Web Bluetooth') }}</span></div></div>
          <n-button v-if="!bluetoothConnected" type="primary" :disabled="!bluetoothSupported" :loading="bluetoothBusy" @click="connectBluetooth"><template #icon><Bluetooth /></template>扫描并连接</n-button>
          <n-button v-else secondary type="error" @click="disconnectBluetooth">断开连接</n-button>
        </div>
        <n-alert class="protocol-note" type="warning" :bordered="false">当前仅验证连接。取得设备厂商的 Service UUID、Characteristic UUID 和数据帧格式并完成适配后，才能采集和入库。</n-alert>
      </section>
    </div>
  </state-panel>
</template>

<style scoped>
.connection-layout { width: 100%; display: grid; gap: 16px; }
.connection-panel { padding: 20px; border: 1px solid #e0e5e2; border-radius: 8px; background: #fff; }
.panel-heading { display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; align-items: center; gap: 13px; }
.panel-heading h2 { margin: 0; color: #26342e; font-size: 17px; font-weight: 650; }
.panel-heading p { margin: 4px 0 0; color: #73817b; font-size: 12px; }
.panel-icon { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 8px; }
.panel-icon svg { width: 20px; height: 20px; }
.panel-icon.local { color: #42694f; background: #e7efe9; }
.panel-icon.wifi { color: #456f83; background: #e5eef2; }
.panel-icon.bluetooth { color: #6c6350; background: #f2ecdf; }
.panel-icon.cloud { color: #4d7182; background: #e5eef2; }
.detail-grid { margin: 20px 0 0; padding-top: 18px; border-top: 1px solid #e8ecea; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 24px; }
.detail-grid div { min-width: 0; }
.detail-grid dt { color: #7a8781; font-size: 11px; }
.detail-grid dd { margin: 5px 0 0; overflow-wrap: anywhere; color: #2d3b35; font-size: 14px; font-weight: 600; }
.detail-grid .mono { font-family: Consolas, monospace; font-size: 12px; font-weight: 500; }
.address-list { margin-top: 18px; border-top: 1px solid #e8ecea; }
.address-row { min-height: 52px; display: grid; grid-template-columns: 22px minmax(0, 1fr) 34px; align-items: center; gap: 11px; border-bottom: 1px solid #edf0ee; }
.address-row:last-child { border-bottom: 0; }
.address-row > svg { width: 17px; height: 17px; color: #577868; }
.address-row code { overflow-wrap: anywhere; color: #31433a; font-size: 13px; }
.bluetooth-action { margin-top: 18px; padding-top: 18px; border-top: 1px solid #e8ecea; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.device-state { min-width: 0; display: flex; align-items: center; gap: 12px; }
.device-state > svg { width: 20px; height: 20px; flex: 0 0 auto; color: #64736c; }
.device-state strong, .device-state span { display: block; overflow-wrap: anywhere; }
.device-state strong { color: #2d3b35; font-size: 14px; }
.device-state span { margin-top: 3px; color: #7a8781; font-size: 11px; }
.protocol-note { margin-top: 16px; }
.cloud-config { margin-top: 18px; padding-top: 18px; border-top: 1px solid #e8ecea; display: grid; grid-template-columns: minmax(220px, 1fr) minmax(220px, 1fr) auto; gap: 10px; }
.sync-stats { margin: 16px 0 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid #e8ecea; border-radius: 7px; }
.sync-stats div { min-width: 0; padding: 12px 14px; border-right: 1px solid #e8ecea; }.sync-stats div:last-child { border: 0; }
.sync-stats dt { color: #7a8781; font-size: 10px; }.sync-stats dd { margin: 4px 0 0; overflow-wrap: anywhere; color: #2d3b35; font-size: 13px; font-weight: 650; }.sync-stats dd.warning { color: #a86519; }
.sync-actions { margin-top: 14px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }.sync-actions span { color: #84908a; font-size: 11px; }
.sync-alert { margin-top: 14px; }
.conflict-list { margin-top: 16px; padding-top: 15px; border-top: 1px solid #e8ecea; }.conflict-title { margin-bottom: 8px; display: flex; align-items: center; gap: 7px; color: #985e18; font-size: 13px; }.conflict-title svg { width: 17px; }
.conflict-row { min-height: 58px; padding: 8px 0; display: flex; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 1px solid #edf0ee; }.conflict-row:last-child { border: 0; }.conflict-row strong, .conflict-row span { display: block; overflow-wrap: anywhere; }.conflict-row strong { color: #34423c; font-size: 12px; }.conflict-row span { margin-top: 3px; color: #84908a; font-size: 10px; }.conflict-row > div:last-child { display: flex; gap: 8px; flex: 0 0 auto; }
@media (max-width: 900px) { .cloud-config { grid-template-columns: 1fr; }.sync-stats { grid-template-columns: 1fr 1fr; }.sync-stats div:nth-child(2) { border-right: 0; }.sync-stats div:nth-child(-n+2) { border-bottom: 1px solid #e8ecea; } }
@media (max-width: 760px) { .detail-grid { grid-template-columns: 1fr; }.bluetooth-action, .sync-actions, .conflict-row { align-items: stretch; flex-direction: column; }.panel-heading { grid-template-columns: 42px minmax(0, 1fr); }.panel-heading > .n-tag { grid-column: 2; justify-self: start; }.conflict-row > div:last-child { align-self: flex-start; } }
</style>
