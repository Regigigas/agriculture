<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage, type FormInst, type FormRules } from 'naive-ui'
import { LockKeyhole, Sprout, UserRound } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const message = useMessage()
const formRef = ref<FormInst | null>(null)
const form = reactive({ username: 'admin', password: 'admin123' })
const rules: FormRules = {
  username: { required: true, message: '请输入账号', trigger: 'blur' },
  password: { required: true, message: '请输入密码', trigger: 'blur' },
}

async function submit() {
  await formRef.value?.validate()
  try {
    await auth.login(form.username, form.password)
    message.success('登录成功')
    router.replace(typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard')
  } catch { /* store exposes the API message */ }
}
</script>

<template>
  <div class="login-page">
    <section class="login-context">
      <div class="login-brand"><Sprout :size="28" /><span>丰域农业</span></div>
      <div><p class="eyebrow">智慧生产 · 精准管理</p><h1>让每一块农田<br />都有清晰的生产账本</h1><p>统一管理地块、生产任务、物联网设备与农资库存。</p></div>
      <div class="context-stats"><div><strong>24h</strong><span>环境持续监测</span></div><div><strong>5</strong><span>核心生产模块</span></div></div>
    </section>
    <main class="login-panel">
      <div class="login-form-wrap">
        <div class="mobile-brand"><Sprout :size="24" /><strong>丰域农业</strong></div>
        <h2>管理端登录</h2><p class="login-subtitle">使用您的管理账号进入生产工作台</p>
        <n-alert v-if="auth.error" type="error" :show-icon="true" class="login-error">{{ auth.error }}</n-alert>
        <n-form ref="formRef" :model="form" :rules="rules" size="large" @submit.prevent="submit">
          <n-form-item label="账号" path="username"><n-input v-model:value="form.username" placeholder="请输入账号"><template #prefix><UserRound :size="17" /></template></n-input></n-form-item>
          <n-form-item label="密码" path="password"><n-input v-model:value="form.password" type="password" show-password-on="click" placeholder="请输入密码" @keyup.enter="submit"><template #prefix><LockKeyhole :size="17" /></template></n-input></n-form-item>
          <n-button type="primary" block attr-type="submit" :loading="auth.loading">进入管理平台</n-button>
        </n-form>
        <p class="demo-account">演示账号 admin / admin123</p>
      </div>
    </main>
  </div>
</template>
