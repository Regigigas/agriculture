import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

function vendorChunk(id: string): string | undefined {
  const path = id.replace(/\\/g, '/')
  if (!path.includes('/node_modules/')) return undefined

  if (path.includes('/echarts/')) return 'vendor-charts'
  if (path.includes('/three/')) return 'vendor-three'
  if (path.includes('/zrender/')) return 'vendor-renderer'
  if (path.includes('/date-fns/') || path.includes('/date-fns-tz/')) return 'vendor-dates'
  if (path.includes('/lodash/') || path.includes('/lodash-es/')) return 'vendor-lodash'
  if (path.includes('/async-validator/')) return 'vendor-validator'
  if (
    path.includes('/css-render/') ||
    path.includes('/@css-render/') ||
    path.includes('/@emotion/')
  ) return 'vendor-styles'
  if (
    path.includes('/vdirs/') ||
    path.includes('/vooks/') ||
    path.includes('/treemate/') ||
    path.includes('/evtd/') ||
    path.includes('/seemly/')
  ) return 'vendor-ui-utils'
  if (path.includes('/naive-ui/')) return 'vendor-ui'
  if (path.includes('/@icon-park/')) return 'vendor-icons'
  if (
    path.includes('/vue/') ||
    path.includes('/@vue/') ||
    path.includes('/vue-router/') ||
    path.includes('/pinia/')
  ) return 'vendor-vue'

  return 'vendor-ui'
}

export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { host: '0.0.0.0', port: 5173 },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 520,
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
})
