<script setup lang="ts">
import { computed } from 'vue'
import { Ellipsis } from '@lucide/vue'
import type { DropdownOption } from 'naive-ui'
import type { TableAction } from './table-actions'

const props = withDefaults(defineProps<{
  actions: TableAction[]
  visibleCount?: number
  note?: string
  emptyText?: string
}>(), {
  visibleCount: 2,
  note: '',
  emptyText: '-',
})

const visibleActions = computed(() => props.actions.slice(0, Math.max(0, props.visibleCount)))
const overflowActions = computed(() => props.actions.slice(Math.max(0, props.visibleCount)))
const overflowOptions = computed<DropdownOption[]>(() => overflowActions.value.map((action) => ({
  key: action.key,
  label: action.label,
  disabled: action.disabled || action.loading,
})))

function handleSelect(key: string | number) {
  overflowActions.value.find((action) => action.key === String(key))?.onClick()
}
</script>

<template>
  <div class="table-actions">
    <span v-if="note" class="table-actions-note">{{ note }}</span>
    <span v-if="!actions.length && !note" class="muted">{{ emptyText }}</span>
    <n-button
      v-for="action in visibleActions"
      :key="action.key"
      size="tiny"
      :type="action.type"
      :secondary="action.secondary"
      :quaternary="action.quaternary"
      :loading="action.loading"
      :disabled="action.disabled"
      @click="action.onClick()"
    >
      <template v-if="action.icon" #icon><component :is="action.icon" /></template>
      {{ action.label }}
    </n-button>
    <n-dropdown v-if="overflowActions.length" trigger="click" :options="overflowOptions" @select="handleSelect">
      <n-button class="table-actions-more" size="tiny" quaternary circle title="更多操作" aria-label="更多操作">
        <template #icon><Ellipsis /></template>
      </n-button>
    </n-dropdown>
  </div>
</template>
