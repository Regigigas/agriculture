import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

export interface PageTab {
  path: string
  fullPath: string
  title: string
  affix: boolean
}

export const useTabsStore = defineStore('tabs', () => {
  const visited = ref<PageTab[]>([])

  function add(route: RouteLocationNormalizedLoaded) {
    if (!route.name || route.meta.guest || route.path === '/corrections') return
    const tab: PageTab = { path: route.path, fullPath: route.fullPath, title: String(route.meta.title || route.name), affix: Boolean(route.meta.affix) }
    const existing = visited.value.find((item) => item.path === tab.path)
    if (existing) Object.assign(existing, tab)
    else visited.value.push(tab)
  }

  function close(path: string) { visited.value = visited.value.filter((item) => item.affix || item.path !== path) }
  function closeOthers(path: string) { visited.value = visited.value.filter((item) => item.affix || item.path === path) }
  function closeLeft(path: string) {
    const index = visited.value.findIndex((item) => item.path === path)
    if (index >= 0) visited.value = visited.value.filter((item, itemIndex) => item.affix || itemIndex >= index)
  }
  function closeRight(path: string) {
    const index = visited.value.findIndex((item) => item.path === path)
    if (index >= 0) visited.value = visited.value.filter((item, itemIndex) => item.affix || itemIndex <= index)
  }
  function closeAll() { visited.value = visited.value.filter((item) => item.affix) }

  return { visited, add, close, closeOthers, closeLeft, closeRight, closeAll }
})
