<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { AlertTriangle, BatteryMedium, Check, Clock3, Cpu, MapPin } from '@lucide/vue'
import { useFarmStore } from '@/stores/farm'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'

const farm = useFarmStore(); const message = useMessage()
const online = computed(() => farm.devices.filter((item) => item.status === 'online').length)
const activeAlerts = computed(() => farm.alerts.filter((item) => !item.acknowledged))
const levelType = (level: string): 'error' | 'warning' | 'info' => level === 'critical' ? 'error' : level === 'warning' ? 'warning' : 'info'
const fieldName = (fieldId: string | number | null) => farm.fields.find((field) => field.id === fieldId)?.name || '未关联地块'
const deviceName = (source: string) => farm.devices.find((device) => device.id === source)?.name || source
async function ack(id: string | number) { try { await farm.acknowledgeAlert(id); message.success('告警已确认') } catch { message.error(farm.errors.alertMutation) } }
onMounted(() => Promise.all([farm.loadDevices(), farm.loadAlerts(), farm.loadFields()]).catch(() => undefined))
</script>
<template>
  <page-header title="设备监控" description="查看物联网设备状态、采集读数和异常告警"><div class="summary-text"><span class="online-dot" />在线 {{ online }}/{{ farm.devices.length }}</div></page-header>
  <state-panel :loading="farm.loading.devices" :error="farm.errors.devices" @retry="farm.loadDevices">
    <div class="device-grid"><n-card v-for="device in farm.devices" :key="device.id"><div class="device-head"><span class="device-icon"><Cpu /></span><n-tag size="small" :type="device.status === 'online' ? 'success' : device.status === 'maintenance' ? 'warning' : 'error'">{{ device.status === 'online' ? '在线' : device.status === 'maintenance' ? '维护中' : '离线' }}</n-tag></div><h3>{{ device.name }}</h3><p>{{ device.type }} · {{ device.id }}</p><div class="device-reading"><strong>{{ device.telemetry.soilMoisture }}</strong><span>% 土壤墒情</span></div><div class="device-meta"><span><MapPin />{{ fieldName(device.fieldId) }}</span><span><BatteryMedium />电量 {{ device.battery }}%</span><span><Clock3 />{{ new Date(device.lastSeenAt).toLocaleString('zh-CN', { hour12: false }) }}</span></div></n-card></div>
    <section class="alerts-section"><div class="section-heading"><div><h2>设备告警</h2><p>需处理的传感器和终端异常</p></div><n-tag :bordered="false" type="warning">{{ activeAlerts.length }} 条未确认</n-tag></div>
      <state-panel :loading="farm.loading.alerts" :error="farm.errors.alerts" :empty="!farm.alerts.length" empty-text="当前没有设备告警" @retry="farm.loadAlerts">
        <div class="alert-list"><div v-for="alert in farm.alerts" :key="alert.id" :class="['alert-row', { acknowledged: alert.acknowledged }]"><span :class="['alert-icon', levelType(alert.severity)]"><AlertTriangle /></span><div class="alert-content"><div><strong>{{ alert.title }}</strong><n-tag size="tiny" :type="levelType(alert.severity)">{{ alert.severity === 'critical' ? '严重' : alert.severity === 'warning' ? '警告' : '提示' }}</n-tag></div><p>{{ alert.message }} · {{ deviceName(alert.source) }} · {{ fieldName(alert.fieldId) }}</p></div><time>{{ new Date(alert.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</time><n-button v-if="!alert.acknowledged" size="small" secondary :loading="farm.loading.alertMutation" @click="ack(alert.id)"><template #icon><Check /></template>确认</n-button><span v-else class="ack-label"><Check />已确认</span></div></div>
      </state-panel>
    </section>
  </state-panel>
</template>
