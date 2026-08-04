<script setup lang="ts">
import { AlertCircle, Inbox } from '@lucide/vue'
defineProps<{ loading?: boolean; error?: string; empty?: boolean; emptyText?: string }>()
defineEmits<{ retry: [] }>()
</script>
<template>
  <div v-if="loading" class="state-panel"><n-spin size="medium" /><span>正在加载数据</span></div>
  <div v-else-if="error" class="state-panel error"><AlertCircle :size="26" /><span>{{ error }}</span><n-button size="small" @click="$emit('retry')">重试</n-button></div>
  <div v-else-if="empty" class="state-panel"><Inbox :size="28" /><span>{{ emptyText || '暂无数据' }}</span></div>
  <slot v-else />
</template>
