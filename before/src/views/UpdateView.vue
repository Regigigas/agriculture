<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { CheckCircle2, Download, RefreshCw, RotateCcw, ShieldCheck } from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import { useAuthStore } from '@/stores/auth'

const message = useMessage()
const auth = useAuthStore()
const state = ref<DesktopUpdateState>({
  phase: 'idle', currentVersion: '', version: '', percent: 0, transferred: 0, total: 0, message: '', supported: false,
})
let removeListener: (() => void) | undefined

const busy = computed(() => ['checking', 'downloading'].includes(state.value.phase))
const statusType = computed(() => state.value.phase === 'error' ? 'error' : state.value.phase === 'available' || state.value.phase === 'downloaded' ? 'warning' : 'success')
const downloadText = computed(() => state.value.total ? `${formatBytes(state.value.transferred)} / ${formatBytes(state.value.total)}` : '')

onMounted(async () => {
  if (!window.agricultureDesktop) return
  removeListener = window.agricultureDesktop.onDesktopUpdateState((next) => { state.value = { ...state.value, ...next } })
  state.value = await window.agricultureDesktop.getDesktopUpdateState(auth.token)
})
onBeforeUnmount(() => removeListener?.())

async function checkUpdate() {
  try { state.value = await window.agricultureDesktop!.checkDesktopUpdate(auth.token) }
  catch (cause) { message.error(cause instanceof Error ? cause.message : '检查更新失败') }
}
async function downloadUpdate() {
  try { state.value = await window.agricultureDesktop!.downloadDesktopUpdate(auth.token) }
  catch (cause) { message.error(cause instanceof Error ? cause.message : '下载更新失败') }
}
async function installUpdate() {
  try { await window.agricultureDesktop!.installDesktopUpdate(auth.token) }
  catch (cause) { message.error(cause instanceof Error ? cause.message : '安装更新失败') }
}
function formatBytes(value: number) {
  if (!value) return '0 B'
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <page-header title="软件更新" description="从 GitHub Release 获取经过校验的 Windows 安装更新">
    <n-button secondary :disabled="busy || !state.supported" @click="checkUpdate"><template #icon><RefreshCw /></template>检查更新</n-button>
  </page-header>
  <div class="update-layout">
    <section class="version-panel">
      <div class="version-mark"><Download /></div>
      <div><small>当前桌面版本</small><strong>{{ state.currentVersion || '--' }}</strong><span>Windows x64 · Electron 自动更新</span></div>
    </section>

    <section class="update-panel">
      <div class="update-status"><component :is="state.phase === 'downloaded' ? RotateCcw : state.phase === 'current' ? CheckCircle2 : ShieldCheck" /><div><h2>{{ state.message || '更新服务已就绪' }}</h2><p v-if="state.version && state.version !== state.currentVersion">目标版本 {{ state.version }}</p><p v-else>{{ state.supported ? '可随时检查 GitHub 上的新版本' : '开发模式下不检查安装包更新' }}</p></div></div>
      <n-alert v-if="state.phase === 'error'" type="error" :bordered="false">{{ state.message }}</n-alert>
      <div v-if="state.phase === 'downloading'" class="download-progress"><n-progress type="line" :percentage="state.percent" :show-indicator="false" /><span>{{ downloadText }}</span></div>
      <div class="update-actions">
        <n-button v-if="state.phase === 'available'" type="primary" @click="downloadUpdate"><template #icon><Download /></template>下载 {{ state.version }}</n-button>
        <n-button v-else-if="state.phase === 'downloaded'" type="primary" @click="installUpdate"><template #icon><RotateCcw /></template>重启并安装</n-button>
        <n-tag v-else :type="statusType" :bordered="false">{{ busy ? '处理中' : state.phase === 'current' ? '已是最新' : '自动检查已开启' }}</n-tag>
      </div>
    </section>
  </div>
</template>

<style scoped>
.update-layout { display: grid; grid-template-columns: minmax(280px, .65fr) minmax(420px, 1.35fr); gap: 18px; }
.version-panel, .update-panel { min-height: 220px; padding: 26px; border: 1px solid #dfe5e1; border-radius: 8px; background: #fff; }
.version-panel { display: flex; align-items: center; gap: 18px; background: #30433c; color: #fff; }
.version-mark { width: 52px; height: 52px; display: grid; place-items: center; flex: none; border-radius: 8px; background: #e0b354; color: #30433c; }.version-mark svg { width: 25px; }
.version-panel small, .version-panel span { display: block; color: #bdcac4; font-size: 11px; }.version-panel strong { display: block; margin: 8px 0; color: #f4cc78; font-size: 29px; }
.update-panel { display: flex; flex-direction: column; justify-content: space-between; gap: 20px; }.update-status { display: flex; align-items: center; gap: 15px; }.update-status > svg { width: 34px; height: 34px; color: #52735d; }.update-status h2 { margin: 0; font-size: 18px; }.update-status p { margin: 6px 0 0; color: #7c8983; font-size: 12px; }.download-progress { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 14px; }.download-progress span { color: #718079; font-size: 11px; }.update-actions { min-height: 34px; display: flex; align-items: center; justify-content: flex-end; }
@media (max-width: 820px) { .update-layout { grid-template-columns: 1fr; }.version-panel, .update-panel { min-height: 170px; } }
</style>
