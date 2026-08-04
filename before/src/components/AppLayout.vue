<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAvatar, NButton, NDrawer, NDrawerContent, NDropdown, NIcon, NMenu, type MenuOption } from 'naive-ui'
import { Bell, Boxes, ClipboardList, Gauge, LogOut, Menu, RadioTower, Sprout, UserRound } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const drawerVisible = ref(false)

const icon = (component: typeof Gauge) => () => h(NIcon, null, { default: () => h(component) })
const menuOptions: MenuOption[] = [
  { label: '驾驶舱', key: '/dashboard', icon: icon(Gauge) },
  { label: '生产任务', key: '/tasks', icon: icon(ClipboardList) },
  { label: '农田档案', key: '/fields', icon: icon(Sprout) },
  { label: '设备监控', key: '/devices', icon: icon(RadioTower) },
  { label: '农资库存', key: '/inventory', icon: icon(Boxes) },
]
const activeKey = computed(() => route.path)
const pageTitle = computed(() => String(route.meta.title || '农业管理'))

function navigate(key: string | number) {
  drawerVisible.value = false
  router.push(String(key))
}

function logout() {
  auth.logout()
  router.replace('/login')
}
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark"><Sprout :size="22" /></span><div><strong>丰域农业</strong><small>FARM OPERATIONS</small></div></div>
      <n-menu :value="activeKey" :options="menuOptions" :indent="22" @update:value="navigate" />
      <div class="sidebar-foot"><span class="status-dot" />系统服务正常</div>
    </aside>

    <div class="app-main">
      <header class="topbar">
        <div class="topbar-left">
          <n-button class="mobile-menu" quaternary circle aria-label="打开导航" @click="drawerVisible = true"><Menu :size="21" /></n-button>
          <div><h1>{{ pageTitle }}</h1><p>{{ new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) }}</p></div>
        </div>
        <div class="topbar-actions">
          <n-button quaternary circle aria-label="通知"><Bell :size="19" /></n-button>
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
