<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
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

onMounted(() => {
  if (!root.value) return
  chart = init(root.value)
  chart.setOption(props.option)
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(root.value)
})
watch(() => props.option, (option) => chart?.setOption(option, true), { deep: true })
onBeforeUnmount(() => { observer?.disconnect(); chart?.dispose() })
</script>
<template><div ref="root" class="chart" /></template>
