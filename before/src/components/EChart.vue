<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { init, use, type EChartsType } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'

use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{ option: EChartsOption }>()
const root = ref<HTMLDivElement>()
let chart: EChartsType | undefined
let observer: ResizeObserver | undefined
let resizeFrame = 0

const applyOption = (option: EChartsOption) => {
  chart?.setOption(option, true)
  scheduleResize()
}

const scheduleResize = () => {
  cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => chart?.resize())
}

onMounted(() => {
  if (!root.value) return
  chart = init(root.value)
  applyOption(props.option)
  observer = new ResizeObserver(scheduleResize)
  observer.observe(root.value)
  window.addEventListener('resize', scheduleResize)
  nextTick(scheduleResize)
})
watch(() => props.option, applyOption, { deep: true, flush: 'post' })
onBeforeUnmount(() => {
  cancelAnimationFrame(resizeFrame)
  observer?.disconnect()
  window.removeEventListener('resize', scheduleResize)
  chart?.dispose()
})
</script>
<template><div ref="root" class="chart" /></template>
