<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { AlertTriangle, CheckCircle2, CloudSun, Droplets, RadioTower, Sprout, ThermometerSun } from '@lucide/vue'
import type { EChartsOption } from 'echarts'
import { useFarmStore } from '@/stores/farm'
import EChart from '@/components/EChart.vue'
import StatePanel from '@/components/StatePanel.vue'

const farm = useFarmStore()
const d = computed(() => farm.dashboard)
const metrics = computed(() => d.value.metrics)
const environment = computed(() => d.value.environment)
const formatTime = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false })
const cropOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0, icon: 'circle', itemWidth: 9, textStyle: { color: '#61706a' } },
  color: ['#3f6b50', '#d39b3b', '#567c91', '#9a6254', '#87906a'],
  series: [{ type: 'pie', radius: ['48%', '70%'], center: ['50%', '43%'], label: { formatter: '{b}\n{d}%', color: '#37453f' }, data: (d.value.cropDistribution || []).map((item) => ({ name: item.crop, value: item.area })) }],
}))
const trendOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis' }, grid: { left: 34, right: 18, top: 20, bottom: 30 },
  xAxis: { type: 'category', data: (d.value.taskTrend || []).map((x) => x.date), axisLine: { lineStyle: { color: '#d8dfdc' } } },
  yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#edf0ef' } } },
  color: ['#3f6b50', '#d39b3b'],
  series: [
    { name: '已完成', type: 'line', smooth: true, symbolSize: 7, data: (d.value.taskTrend || []).map((x) => x.completed), areaStyle: { color: 'rgba(63,107,80,.1)' } },
    { name: '新增', type: 'bar', barMaxWidth: 18, data: (d.value.taskTrend || []).map((x) => x.created || 0) },
  ],
}))
onMounted(() => farm.loadDashboard().catch(() => undefined))
</script>

<template>
  <state-panel :loading="farm.loading.dashboard" :error="farm.errors.dashboard" @retry="farm.loadDashboard">
    <div class="kpi-grid">
      <n-card><div class="kpi"><span class="kpi-icon green"><Sprout /></span><div><small>管理地块</small><strong>{{ metrics?.totalFields ?? 0 }}</strong><span>{{ metrics?.totalArea ?? 0 }} 亩总面积</span></div></div></n-card>
      <n-card><div class="kpi"><span class="kpi-icon amber"><CheckCircle2 /></span><div><small>待办任务</small><strong>{{ metrics?.pendingTasks ?? 0 }}</strong><span>需按计划推进</span></div></div></n-card>
      <n-card><div class="kpi"><span class="kpi-icon blue"><RadioTower /></span><div><small>在线设备</small><strong>{{ metrics?.onlineDevices ?? 0 }}</strong><span>设备稳定运行</span></div></div></n-card>
      <n-card><div class="kpi"><span class="kpi-icon red"><AlertTriangle /></span><div><small>未处理告警</small><strong>{{ metrics?.activeAlerts ?? 0 }}</strong><span>请及时核查</span></div></div></n-card>
    </div>

    <section class="section-block"><div class="section-heading"><div><h2>田间环境</h2><p>最近一次传感器采集数据</p></div><span class="live-badge"><i />实时监测</span></div>
      <div class="environment-strip">
        <div><ThermometerSun /><span>空气温度</span><strong>{{ environment?.temperature ?? '--' }}<small>°C</small></strong></div>
        <div><Droplets /><span>空气湿度</span><strong>{{ environment?.humidity ?? '--' }}<small>%</small></strong></div>
        <div><Droplets /><span>土壤墒情</span><strong>{{ environment?.soilMoisture ?? '--' }}<small>%</small></strong></div>
        <div><CloudSun /><span>光照强度</span><strong>{{ environment?.light ?? '--' }}<small>lux</small></strong></div>
      </div>
    </section>

    <div class="dashboard-grid">
      <n-card title="作物种植占比"><e-chart v-if="d.cropDistribution?.length" :option="cropOption" /><div v-else class="chart-empty">暂无作物数据</div></n-card>
      <n-card title="近七日任务趋势"><e-chart v-if="d.taskTrend?.length" :option="trendOption" /><div v-else class="chart-empty">暂无任务趋势</div></n-card>
    </div>
    <n-card class="activity-card" title="近期动态">
       <div v-if="d.recentActivities?.length" class="activity-list"><div v-for="item in d.recentActivities" :key="item.id" class="activity-item"><span class="activity-dot" /><div><strong>{{ item.message }}</strong><p>{{ item.type }}</p></div><time>{{ formatTime(item.timestamp) }}</time></div></div>
      <div v-else class="empty-inline">暂无近期动态</div>
    </n-card>
  </state-panel>
</template>
