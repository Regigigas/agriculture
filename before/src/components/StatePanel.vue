<script setup lang="ts">
import { AlertCircle, Inbox } from '@lucide/vue'
import { useMessage } from 'naive-ui'
import { useRoute } from 'vue-router'

const route = useRoute()
const message = useMessage()
const canReport = Boolean(window.agricultureDesktop)
defineProps<{ loading?: boolean; error?: string; empty?: boolean; emptyText?: string }>()
defineEmits<{ retry: [] }>()

async function reportError() {
  try {
    await window.agricultureDesktop?.openCorrectionWindow(`${route.fullPath} · 页面加载失败`)
  } catch (cause) {
    message.error(cause instanceof Error ? cause.message : '无法打开纠错中心')
  }
}
</script>
<template>
  <div v-if="loading" class="state-panel"><n-spin size="medium" /><span>正在加载数据</span></div>
  <div v-else-if="error" class="state-panel error"><AlertCircle :size="26" /><span>{{ error }}</span><div class="state-actions"><n-button size="small" @click="$emit('retry')">重试</n-button><n-button v-if="canReport" size="small" secondary @click="reportError">报告问题</n-button></div></div>
  <div v-else-if="empty" class="state-panel"><Inbox :size="28" /><span>{{ emptyText || '暂无数据' }}</span></div>
  <slot v-else />
</template>
