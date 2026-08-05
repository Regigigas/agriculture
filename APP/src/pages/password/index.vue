<template>
  <view class="password-page">
    <view class="notice">修改密码后，当前设备将退出登录，请使用新密码重新登录。</view>
    <view class="surface password-form">
      <view class="field-group">
        <text class="field-label">当前密码</text>
        <input v-model="form.currentPassword" class="field-input" password placeholder="请输入当前密码" />
      </view>
      <view class="field-group">
        <text class="field-label">新密码</text>
        <input v-model="form.newPassword" class="field-input" password placeholder="请输入新密码" />
      </view>
      <view class="field-group">
        <text class="field-label">确认新密码</text>
        <input v-model="confirmation" class="field-input" password placeholder="请再次输入新密码" @confirm="submit" />
      </view>
      <button class="primary-button submit-button" :disabled="!canSubmit || authStore.changingPassword" @click="submit">
        {{ authStore.changingPassword ? '正在修改...' : '确认修改' }}
      </button>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { useAuthStore } from '../../store/auth'

const authStore = useAuthStore()
const form = reactive({ currentPassword: '', newPassword: '' })
const confirmation = ref('')
const canSubmit = computed(() => form.currentPassword && form.newPassword && confirmation.value)

async function submit() {
  if (!canSubmit.value || authStore.changingPassword) return
  if (form.newPassword !== confirmation.value) {
    uni.showToast({ title: '两次输入的新密码不一致', icon: 'none' })
    return
  }
  if (form.currentPassword === form.newPassword) {
    uni.showToast({ title: '新密码不能与当前密码相同', icon: 'none' })
    return
  }
  try {
    await authStore.updatePassword(form)
    uni.showToast({ title: '密码已修改，请重新登录', icon: 'none' })
    setTimeout(() => uni.reLaunch({ url: '/pages/login/index' }), 700)
  } catch (error) {
    uni.showToast({ title: error.message || '密码修改失败', icon: 'none' })
  }
}
</script>

<style scoped lang="scss">
.password-page { min-height: 100vh; padding: 28rpx; }
.notice { margin-bottom: 20rpx; padding: 20rpx 22rpx; border-left: 6rpx solid #b47a1d; background: #fff8e8; color: #6f531f; font-size: 23rpx; line-height: 1.6; }
.password-form { padding: 30rpx 26rpx 34rpx; }
.field-group { margin-bottom: 26rpx; }
.field-label { display: block; margin-bottom: 12rpx; color: #425148; font-size: 25rpx; font-weight: 700; }
.field-input { width: 100%; height: 84rpx; padding: 0 22rpx; border: 1rpx solid #ccd5ce; border-radius: 6rpx; background: #f9faf9; font-size: 28rpx; }
.submit-button { margin-top: 38rpx; }
</style>
