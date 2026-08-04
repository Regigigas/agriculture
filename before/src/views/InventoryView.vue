<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertTriangle, Boxes, Search } from '@lucide/vue'
import { useFarmStore } from '@/stores/farm'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'

const farm = useFarmStore(); const keyword = ref(''); const category = ref<string | null>(null)
const categories = computed(() => [...new Set(farm.inventory.map((item) => item.category))].map((value) => ({ label: value, value })))
const filtered = computed(() => farm.inventory.filter((item) => (!category.value || item.category === category.value) && (!keyword.value || item.name.toLowerCase().includes(keyword.value.toLowerCase()))))
const lowCount = computed(() => farm.inventory.filter((item) => item.quantity <= item.minimumStock).length)
onMounted(() => farm.loadInventory().catch(() => undefined))
</script>
<template>
  <page-header title="农资库存" description="掌握种子、肥料、农药及生产耗材的库存水平"><div class="summary-text warning"><AlertTriangle :size="17" />{{ lowCount }} 项低库存</div></page-header>
  <div class="filter-bar"><n-input v-model:value="keyword" clearable placeholder="搜索农资名称"><template #prefix><Search :size="17" /></template></n-input><n-select v-model:value="category" clearable placeholder="全部分类" :options="categories" /></div>
  <state-panel :loading="farm.loading.inventory" :error="farm.errors.inventory" :empty="!filtered.length" empty-text="没有符合条件的库存记录" @retry="farm.loadInventory">
    <div class="inventory-grid"><n-card v-for="item in filtered" :key="item.id" :class="{ 'low-stock': item.quantity <= item.minimumStock }"><div class="inventory-head"><span class="inventory-icon"><Boxes /></span><n-tag size="small" :bordered="false">{{ item.category }}</n-tag></div><h3>{{ item.name }}</h3><div class="stock-number"><strong>{{ item.quantity }}</strong><span>{{ item.unit }}</span></div><n-progress type="line" :percentage="Math.min(100, Math.round(item.quantity / Math.max(item.minimumStock * 2, 1) * 100))" :show-indicator="false" :status="item.quantity <= item.minimumStock ? 'error' : 'success'" /><div class="stock-meta"><span>安全库存 {{ item.minimumStock }} {{ item.unit }}</span><span>{{ item.location }}</span></div><div v-if="item.quantity <= item.minimumStock" class="low-stock-notice"><AlertTriangle />库存不足，请及时补充</div></n-card></div>
  </state-panel>
</template>
