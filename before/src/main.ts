import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  create,
  NAlert,
  NAvatar,
  NBadge,
  NButton,
  NCard,
  NConfigProvider,
  NDatePicker,
  NDialogProvider,
  NDrawer,
  NDrawerContent,
  NDropdown,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NMenu,
  NMessageProvider,
  NModal,
  NPopover,
  NProgress,
  NSelect,
  NSpin,
  NTable,
  NTabPane,
  NTag,
  NTabs,
} from 'naive-ui'
import App from './App.vue'
import router from './router'
import '@icon-park/vue-next/styles/index.css'
import './styles/main.css'

const naive = create({
  components: [
    NAlert,
    NAvatar,
    NBadge,
    NButton,
    NCard,
    NConfigProvider,
    NDatePicker,
    NDialogProvider,
    NDrawer,
    NDrawerContent,
    NDropdown,
    NEmpty,
    NForm,
    NFormItem,
    NInput,
    NInputNumber,
    NMenu,
    NMessageProvider,
    NModal,
    NPopover,
    NProgress,
    NSelect,
    NSpin,
    NTable,
    NTabPane,
    NTag,
    NTabs,
  ],
})

createApp(App).use(createPinia()).use(router).use(naive).mount('#app')
