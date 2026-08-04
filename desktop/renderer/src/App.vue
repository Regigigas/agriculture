<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { NConfigProvider, NDialogProvider, NMessageProvider, zhCN, dateZhCN, type GlobalThemeOverrides } from 'naive-ui'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

function handleExpiredSession() {
  auth.logout()
  if (router.currentRoute.value.name !== 'login') {
    void router.replace({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
  }
}

onMounted(() => window.addEventListener('agriculture-auth-expired', handleExpiredSession))
onBeforeUnmount(() => window.removeEventListener('agriculture-auth-expired', handleExpiredSession))

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#3f6b50',
    primaryColorHover: '#527e61',
    primaryColorPressed: '#315740',
    primaryColorSuppl: '#527e61',
    borderRadius: '6px',
    fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  Card: { borderRadius: '8px' },
  Button: { borderRadiusMedium: '6px' },
}
</script>

<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN" :theme-overrides="themeOverrides">
    <n-dialog-provider>
      <n-message-provider>
        <router-view />
      </n-message-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>
