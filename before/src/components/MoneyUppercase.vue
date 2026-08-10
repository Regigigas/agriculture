<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { Check, Copy, RefreshCw, TriangleAlert } from '@/icons/iconpark'
import { centsToChineseUppercase, formatCents, yuanToCents } from '@/types/money'

const props = withDefaults(defineProps<{ value: number; valueUnit?: 'yuan' | 'cent' }>(), { valueUnit: 'cent' })
const message = useMessage()
const show = ref(false)
const copyState = ref<'idle' | 'copying' | 'success' | 'error'>('idle')
let resetTimer: number | undefined
const cents = computed(() => props.valueUnit === 'yuan' ? yuanToCents(props.value || 0) : Math.round(props.value || 0))
const uppercase = computed(() => centsToChineseUppercase(cents.value))

function fallbackCopy(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
  document.body.appendChild(textarea)
  textarea.select()
  const succeeded = document.execCommand('copy')
  textarea.remove()
  if (!succeeded) throw new Error('execCommand copy failed')
}

async function copy() {
  if (copyState.value === 'copying') return
  copyState.value = 'copying'
  window.clearTimeout(resetTimer)
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(uppercase.value)
    else fallbackCopy(uppercase.value)
    copyState.value = 'success'
    message.success('大写金额已复制到剪贴板')
  } catch {
    try {
      fallbackCopy(uppercase.value)
      copyState.value = 'success'
      message.success('大写金额已复制到剪贴板')
    } catch {
      copyState.value = 'error'
      message.error('复制失败，请手动选择金额复制')
    }
  }
  resetTimer = window.setTimeout(() => { copyState.value = 'idle' }, 2200)
}

onBeforeUnmount(() => window.clearTimeout(resetTimer))
</script>

<template>
  <n-button size="tiny" text type="primary" @click="show = true">查看金额大写</n-button>
  <n-modal v-model:show="show" preset="card" title="人民币大写金额" class="money-uppercase-modal" :style="{ width: 'min(560px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 32px)', overflow: 'hidden' }" :bordered="false" :block-scroll="false">
    <div class="money-uppercase-content">
      <p class="money-number">{{ formatCents(cents) }}</p>
      <button :class="['uppercase-copy', copyState]" type="button" title="点击复制大写金额" :disabled="copyState === 'copying'" @click="copy">
        {{ uppercase }}
        <small aria-live="polite">
          <RefreshCw v-if="copyState === 'copying'" class="copy-spinner" />
          <Check v-else-if="copyState === 'success'" />
          <TriangleAlert v-else-if="copyState === 'error'" />
          <Copy v-else />
          {{ copyState === 'copying' ? '正在复制…' : copyState === 'success' ? '复制成功' : copyState === 'error' ? '复制失败，请重试' : '点击复制' }}
        </small>
      </button>
    </div>
  </n-modal>
</template>

<style scoped>
.money-number { margin: 0 0 12px; color: #708078; }
.money-uppercase-content { max-height: calc(100dvh - 126px); overflow-x: hidden; overflow-y: auto; }
.uppercase-copy { width: 100%; padding: 18px; border: 1px solid #dce5df; border-radius: 8px; background: #f7faf8; color: #34443b; font-size: 18px; line-height: 1.7; text-align: left; cursor: pointer; }
.uppercase-copy:hover { border-color: #71907c; }.uppercase-copy small { display: flex; align-items: center; gap: 6px; margin-top: 8px; color: #718079; font-size: 12px; }.uppercase-copy small svg { width: 15px; height: 15px; }.uppercase-copy.success { border-color: #63a276; background: #edf7f0; }.uppercase-copy.success small { color: #347247; }.uppercase-copy.error { border-color: #c86558; background: #fff3f1; }.uppercase-copy.error small { color: #a14338; }.uppercase-copy:disabled { cursor: wait; }.copy-spinner { animation: copy-spin .8s linear infinite; }
@keyframes copy-spin { to { transform: rotate(360deg); } }
@media (max-width: 560px) { .uppercase-copy { padding: 14px; font-size: 16px; overflow-wrap: anywhere; } }
</style>
