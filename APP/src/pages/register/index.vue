<template>
  <view v-if="isAdmin" class="form-page">
    <view class="form-heading">
      <text class="form-title">添加工作账号</text>
      <text class="form-subtitle">新账号创建后不会切换当前管理员登录状态</text>
    </view>

    <view class="form-panel">
      <view class="field-group">
        <text class="field-label">姓名</text>
        <input v-model.trim="form.name" class="field-input" placeholder="请输入姓名" />
      </view>
      <view class="field-group">
        <text class="field-label">账号</text>
        <input v-model.trim="form.username" class="field-input" placeholder="请输入登录账号" />
      </view>
      <view class="field-group">
        <text class="field-label">密码</text>
        <input v-model="form.password" class="field-input" password placeholder="请输入密码" />
      </view>
      <view class="field-group">
        <text class="field-label">确认密码</text>
        <input v-model="confirmPassword" class="field-input" password placeholder="请再次输入密码" @confirm="submit" />
      </view>
      <view class="field-group">
        <text class="field-label">账号角色</text>
        <picker :range="roleLabels" :value="roleIndex" @change="selectRole">
          <view class="field-input picker-input">{{ roleLabels[roleIndex] }}</view>
        </picker>
      </view>
      <button class="primary-button submit-button" :disabled="!canSubmit || authStore.addingUser" @click="submit">
        {{ authStore.addingUser ? '正在添加...' : '添加账号' }}
      </button>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useAuthStore } from '../../store/auth'

const authStore = useAuthStore()
const form = reactive({ name: '', username: '', password: '', role: 'worker' })
const confirmPassword = ref('')
const roleIndex = ref(0)
const roleLabels = ['工作人员', '管理员']
const isAdmin = computed(() => authStore.isAuthenticated && String(authStore.user?.role || '').toLowerCase() === 'admin')
const canSubmit = computed(() => form.name && form.username && form.password && confirmPassword.value)

onLoad(() => {
  authStore.restoreSession()
  if (!isAdmin.value) {
    uni.showToast({ title: '仅管理员可添加账号', icon: 'none' })
    setTimeout(() => uni.reLaunch({ url: authStore.isAuthenticated ? '/pages/profile/index' : '/pages/login/index' }), 350)
  }
})

function selectRole(event) {
  roleIndex.value = Number(event.detail.value)
  form.role = roleIndex.value === 1 ? 'admin' : 'worker'
}

async function submit() {
  if (!canSubmit.value || authStore.addingUser) return
  if (form.password !== confirmPassword.value) {
    uni.showToast({ title: '两次输入的密码不一致', icon: 'none' })
    return
  }
  try {
    await authStore.addUser({ ...form })
    uni.showToast({ title: '账号已添加', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 400)
  } catch (error) {
    uni.showToast({ title: error.message || '添加失败', icon: 'none' })
  }
}
</script>

<style scoped lang="scss">
.form-page {
  min-height: 100vh;
  padding: 44rpx 30rpx calc(50rpx + env(safe-area-inset-bottom));
}

.form-heading { margin: 10rpx 4rpx 32rpx; }
.form-title,
.form-subtitle { display: block; }
.form-title { font-size: 38rpx; font-weight: 800; }
.form-subtitle { margin-top: 10rpx; color: #6f7a73; font-size: 24rpx; }
.form-panel { padding: 30rpx 26rpx 34rpx; border: 1rpx solid #dfe5df; border-radius: 8rpx; background: #ffffff; }
.field-group { margin-bottom: 26rpx; }
.field-label { display: block; margin-bottom: 12rpx; color: #425148; font-size: 25rpx; font-weight: 700; }
.field-input { width: 100%; height: 84rpx; padding: 0 22rpx; border: 1rpx solid #ccd5ce; border-radius: 6rpx; background: #f9faf9; font-size: 28rpx; }
.picker-input { color: #26352c; line-height: 84rpx; }
.submit-button { margin-top: 38rpx; }
</style>
