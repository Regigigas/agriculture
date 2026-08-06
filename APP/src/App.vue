<script setup>
import { onLaunch } from '@dcloudio/uni-app'
import { useAuthStore } from './store/auth'
import { setUnauthorizedHandler } from './utils/request'

const authStore = useAuthStore()

onLaunch(() => {
  authStore.restoreSession()
  setUnauthorizedHandler(() => authStore.expireSession())
})
</script>

<style lang="scss">
page {
  min-height: 100%;
  background: #f3f5f2;
  color: #1c2922;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 28rpx;
}

view,
text,
button,
input,
textarea,
scroll-view {
  box-sizing: border-box;
}

button::after {
  border: 0;
}

.page-shell {
  min-height: 100vh;
  padding: 28rpx 28rpx calc(36rpx + env(safe-area-inset-bottom));
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 34rpx 0 18rpx;
  font-size: 32rpx;
  font-weight: 700;
}

.section-count {
  color: #68736d;
  font-size: 24rpx;
  font-weight: 500;
}

.surface {
  background: #ffffff;
  border: 1rpx solid #dfe5df;
  border-radius: 8rpx;
}

.empty-state {
  padding: 64rpx 24rpx;
  color: #7b8580;
  text-align: center;
}

.loading-state {
  padding: 64rpx 24rpx;
  color: #68736d;
  text-align: center;
}

.primary-button {
  height: 88rpx;
  border-radius: 8rpx;
  background: #21613c;
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 700;
  line-height: 88rpx;
}

.primary-button[disabled] {
  background: #9caf9f;
  color: #eef2ee;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 42rpx;
  padding: 0 14rpx;
  border-radius: 6rpx;
  background: #edf2ee;
  color: #3e5547;
  font-size: 22rpx;
  line-height: 42rpx;
}

.status-badge.is-green {
  background: #e5f1e8;
  color: #21613c;
}

.status-badge.is-amber {
  background: #fff1d5;
  color: #8a5700;
}

.status-badge.is-blue {
  background: #e5eff8;
  color: #245d88;
}

.status-badge.is-gray {
  background: #ecefed;
  color: #65706a;
}
</style>
