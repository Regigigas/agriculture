import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  create,
  NAlert,
  NAvatar,
  NButton,
  NCard,
  NConfigProvider,
  NDatePicker,
  NDialogProvider,
  NDrawer,
  NDrawerContent,
  NDropdown,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NMenu,
  NMessageProvider,
  NModal,
  NProgress,
  NSelect,
  NSpin,
  NTable,
  NTag,
} from 'naive-ui'
import App from './App.vue'
import router from './router'
import './styles/main.css'

const naive = create({
  components: [
    NAlert,
    NAvatar,
    NButton,
    NCard,
    NConfigProvider,
    NDatePicker,
    NDialogProvider,
    NDrawer,
    NDrawerContent,
    NDropdown,
    NForm,
    NFormItem,
    NInput,
    NInputNumber,
    NMenu,
    NMessageProvider,
    NModal,
    NProgress,
    NSelect,
    NSpin,
    NTable,
    NTag,
  ],
})

createApp(App).use(createPinia()).use(router).use(naive).mount('#app')
