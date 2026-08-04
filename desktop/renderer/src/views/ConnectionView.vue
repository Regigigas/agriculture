<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { Bluetooth, Check, Copy, Database, Laptop, RadioTower, RefreshCw, Wifi } from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import { request } from '@/api/client'

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
const connection = ref<ConnectionInfo | null>(null)
const loading = ref(false)
const error = ref('')
const bluetoothDevice = ref<BluetoothDeviceLike | null>(null)
const bluetoothBusy = ref(false)
const isDesktop = Boolean(window.agricultureDesktop?.isDesktop)
const bluetoothSupported = computed(() => Boolean((navigator as BluetoothNavigator).bluetooth))
const bluetoothConnected = computed(() => Boolean(bluetoothDevice.value?.gatt?.connected))

async function loadConnection() {
  loading.value = true
  error.value = ''
  try {
    connection.value = await request<ConnectionInfo>('/system/connection')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法读取本地连接信息'
  } finally {
    loading.value = false
  }
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
@media (max-width: 760px) { .detail-grid { grid-template-columns: 1fr; }.bluetooth-action { align-items: stretch; flex-direction: column; }.panel-heading { grid-template-columns: 42px minmax(0, 1fr); }.panel-heading > .n-tag { grid-column: 2; justify-self: start; } }
</style>
