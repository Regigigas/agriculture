<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { NDropdown } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'
import { useTabsStore, type PageTab } from '@/stores/tabs'

const route = useRoute()
const router = useRouter()
const tabs = useTabsStore()
const scroller = ref<HTMLElement>()
const contextTab = ref<PageTab>()
const contextVisible = ref(false)
const contextX = ref(0)
const contextY = ref(0)
const contextOptions = computed(() => [
  { label: '关闭当前', key: 'current', disabled: contextTab.value?.affix },
  { label: '关闭其他', key: 'others' },
  { label: '关闭左侧', key: 'left' },
  { label: '关闭右侧', key: 'right' },
  { label: '关闭全部', key: 'all' },
])

watch(() => route.fullPath, async () => {
  await nextTick()
  scroller.value?.querySelector<HTMLElement>('.page-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}, { immediate: true })

function openContext(tab: PageTab, event: MouseEvent) {
  event.preventDefault()
  contextTab.value = tab
  contextX.value = event.clientX
  contextY.value = event.clientY
  contextVisible.value = true
}
function navigateAfterClose(closedPath: string) {
  if (route.path !== closedPath) return
  const target = tabs.visited.at(-1)
  void router.push(target?.fullPath || '/dashboard')
}
function close(tab: PageTab) {
  if (tab.affix) return
  tabs.close(tab.path)
  navigateAfterClose(tab.path)
}
function selectAction(key: string) {
  const tab = contextTab.value
  if (!tab) return
  if (key === 'current') close(tab)
  if (key === 'others') { tabs.closeOthers(tab.path); void router.push(tab.fullPath) }
  if (key === 'left') { tabs.closeLeft(tab.path); navigateAfterClose(route.path) }
  if (key === 'right') { tabs.closeRight(tab.path); navigateAfterClose(route.path) }
  if (key === 'all') { tabs.closeAll(); navigateAfterClose(route.path) }
  contextVisible.value = false
}
</script>

<template>
  <nav ref="scroller" class="page-tabs" aria-label="已打开页面">
    <router-link v-for="tab in tabs.visited" :key="tab.path" :to="tab.fullPath" class="page-tab" :class="{ active: route.path === tab.path }" @click.middle.prevent="close(tab)" @contextmenu="openContext(tab, $event)">
      <span class="page-tab-dot" />
      <span class="page-tab-title">{{ tab.title }}</span>
      <button v-if="!tab.affix" type="button" class="page-tab-close" :aria-label="`关闭${tab.title}`" @click.prevent.stop="close(tab)">×</button>
    </router-link>
  </nav>
  <n-dropdown trigger="manual" placement="bottom-start" :show="contextVisible" :x="contextX" :y="contextY" :options="contextOptions" @select="selectAction" @clickoutside="contextVisible = false" />
</template>
