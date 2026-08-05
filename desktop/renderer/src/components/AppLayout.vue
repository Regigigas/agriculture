<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'
import { NAvatar, NButton, NDrawer, NDrawerContent, NDropdown, NIcon, NMenu, type MenuOption } from 'naive-ui'
import { AlertTriangle, Bell, Bluetooth, Boxes, Bug, Building2, ClipboardList, Download, FileCheck2, Gauge, Layers3, LogOut, Menu, MessageCircle, MessageSquareWarning, PackageSearch, RadioTower, ShieldAlert, ShoppingCart, Sprout, UserRound } from '@lucide/vue'
import { request } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useFarmStore } from '@/stores/farm'
import { useOperationsStore } from '@/stores/operations'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const farm = useFarmStore()
const operations = useOperationsStore()
const message = useMessage()
const drawerVisible = ref(false)
const serviceOnline = ref<boolean | null>(null)
let healthTimer: ReturnType<typeof setInterval> | undefined

const icon = (component: typeof Gauge) => () => h(NIcon, null, { default: () => h(component) })
const menuOptions = computed<MenuOption[]>(() => [
  { type: 'group', label: '工作台', key: 'workbench', children: [
    { label: '农业驾驶舱', key: '/dashboard', icon: icon(Gauge) },
    ...(auth.user?.role === 'admin' ? [{ label: '运营风险中心', key: '/operations', icon: icon(ShieldAlert) }] : []),
    { label: '工作沟通', key: '/communication', icon: icon(MessageCircle) },
  ] },
  { type: 'group', label: '生产经营', key: 'production-group', children: [
    { label: '经营主体与农场', key: '/organizations', icon: icon(Building2) },
    { label: '农田档案', key: '/fields', icon: icon(Sprout) },
    { label: '地块三维巡查', key: '/field-3d', icon: icon(Layers3) },
    { label: '种植季与执行', key: '/production', icon: icon(Layers3) },
    { label: '生产任务', key: '/tasks', icon: icon(ClipboardList) },
    { label: '巡田问题', key: '/issues', icon: icon(Bug) },
  ] },
  { type: 'group', label: '供应与追溯', key: 'supply-group', children: [
    { label: '采购管理', key: '/purchases', icon: icon(ShoppingCart) },
    { label: '农资库存', key: '/inventory', icon: icon(Boxes) },
    { label: '采收销售与追溯', key: '/traceability', icon: icon(PackageSearch) },
    { label: '合同与合规档案', key: '/compliance', icon: icon(FileCheck2) },
  ] },
  { type: 'group', label: '设备与连接', key: 'device-group', children: [
    { label: '设备监控', key: '/devices', icon: icon(RadioTower) },
    ...(auth.user?.role === 'admin' ? [
      { label: '连接中心', key: '/connections', icon: icon(Bluetooth) },
      { label: '软件更新', key: '/update', icon: icon(Download) },
    ] : []),
  ] },
])
const activeKey = computed(() => route.path)
const pageTitle = computed(() => String(route.meta.title || '农业管理'))
const activeAlerts = computed(() => farm.alerts.filter((item) => !item.acknowledged))
const lowStock = computed(() => farm.inventory.filter((item) => item.quantity <= item.minimumStock))
const overdueTasks = computed(() => {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return farm.tasks.filter((task) => task.status !== 'completed' && task.dueDate < today)
})
const activeIssues = computed(() => farm.issues.filter((issue) => issue.status !== 'closed'))
const businessRisks = computed(() => operations.risks.filter((item) => ['cycle', 'quality', 'contract', 'document'].includes(item.source)))
const notificationCount = computed(() => activeAlerts.value.length + lowStock.value.length + overdueTasks.value.length + activeIssues.value.length + businessRisks.value.length)
const serviceText = computed(() => serviceOnline.value === null ? '正在检查本地服务' : serviceOnline.value ? '本地服务运行正常' : '本地服务连接异常')

function navigate(key: string | number) {
  drawerVisible.value = false
  router.push(String(key))
}

async function logout() {
  await auth.logout()
  await router.replace('/login')
}

async function checkHealth() {
  try {
    const health = await request<{ status: string }>('/health')
    serviceOnline.value = health.status === 'ok'
  } catch {
    serviceOnline.value = false
  }
}

async function loadShellData() {
  await Promise.allSettled([
    checkHealth(),
    farm.loadAlerts(),
    farm.loadTasks(),
    farm.loadInventory(),
    farm.loadIssues(),
    operations.loadRisks(),
  ])
}

async function openCorrectionWindow() {
  try {
    await window.agricultureDesktop?.openCorrectionWindow(route.fullPath)
  } catch (cause) {
    message.error(cause instanceof Error ? cause.message : '无法打开纠错中心')
  }
}

onMounted(() => {
  loadShellData()
  healthTimer = setInterval(checkHealth, 30000)
})
onBeforeUnmount(() => {
  if (healthTimer) clearInterval(healthTimer)
})
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark"><Sprout :size="22" /></span><div><strong>丰域农业</strong><small>FARM OPERATIONS</small></div></div>
      <n-menu :value="activeKey" :options="menuOptions" :indent="22" @update:value="navigate" />
      <div :class="['sidebar-foot', { offline: serviceOnline === false }]"><span class="status-dot" />{{ serviceText }}</div>
    </aside>

    <div class="app-main">
      <header class="topbar">
        <div class="topbar-left">
          <n-button class="mobile-menu" quaternary circle aria-label="打开导航" @click="drawerVisible = true"><Menu :size="21" /></n-button>
          <div><h1>{{ pageTitle }}</h1><p>{{ new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) }}</p></div>
        </div>
        <div class="topbar-actions">
          <n-button quaternary circle title="打开纠错中心" aria-label="打开纠错中心" @click="openCorrectionWindow"><MessageSquareWarning :size="19" /></n-button>
          <n-popover trigger="click" placement="bottom-end" :width="340">
            <template #trigger><n-badge :value="notificationCount" :max="99" :show="notificationCount > 0"><n-button quaternary circle title="查看待办提醒" aria-label="查看待办提醒"><Bell :size="19" /></n-button></n-badge></template>
            <div class="notification-panel">
              <div class="notification-heading"><strong>需要关注</strong><span>{{ notificationCount }} 项</span></div>
              <button v-if="activeAlerts.length" class="notification-row critical" @click="navigate('/devices')"><AlertTriangle /><span><strong>{{ activeAlerts.length }} 条设备告警</strong><small>查看传感器与终端异常</small></span></button>
              <button v-if="overdueTasks.length" class="notification-row warning" @click="navigate('/tasks')"><ClipboardList /><span><strong>{{ overdueTasks.length }} 项任务逾期</strong><small>重新安排负责人和进度</small></span></button>
              <button v-if="activeIssues.length" class="notification-row info" @click="navigate('/issues')"><Bug /><span><strong>{{ activeIssues.length }} 条巡田问题未关闭</strong><small>跟踪处理和复查结果</small></span></button>
              <button v-if="lowStock.length" class="notification-row stock" @click="navigate('/purchases')"><Boxes /><span><strong>{{ lowStock.length }} 项农资低库存</strong><small>建立采购单并跟踪到货</small></span></button>
              <button v-if="businessRisks.length" class="notification-row warning" @click="navigate('/operations')"><ShieldAlert /><span><strong>{{ businessRisks.length }} 项经营风险</strong><small>种植季、质检、合同或文书到期</small></span></button>
              <div v-if="notificationCount === 0" class="notification-empty">当前没有待处理提醒</div>
            </div>
          </n-popover>
          <n-dropdown :options="[{ label: '退出登录', key: 'logout', icon: icon(LogOut) }]" @select="logout">
            <button class="user-button"><n-avatar round :size="34"><UserRound :size="18" /></n-avatar><span>{{ auth.user?.name || auth.user?.username || '管理员' }}</span></button>
          </n-dropdown>
        </div>
      </header>
      <main class="content"><router-view /></main>
    </div>

    <n-drawer v-model:show="drawerVisible" placement="left" :width="268">
      <n-drawer-content body-content-style="padding: 0; background: #263238;">
        <div class="drawer-nav"><div class="brand"><span class="brand-mark"><Sprout :size="22" /></span><div><strong>丰域农业</strong><small>FARM OPERATIONS</small></div></div><n-menu :value="activeKey" :options="menuOptions" @update:value="navigate" /></div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
