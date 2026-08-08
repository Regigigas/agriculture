<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useMessage, type FormInst, type FormRules } from 'naive-ui'
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, ClipboardList, PackagePlus, Plus, RotateCcw, Search, ShoppingCart, SlidersHorizontal } from '@/icons/iconpark'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useFarmStore } from '@/stores/farm'
import type { CreateInventoryItemInput, InventoryTransactionInput, InventoryTransactionType } from '@/types'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'

const farm = useFarmStore()
const router = useRouter()
const auth = useAuthStore()
const message = useMessage()
const formRef = ref<FormInst | null>(null)
const itemFormRef = ref<FormInst | null>(null)
const keyword = ref('')
const category = ref<string | null>(null)
const showTransaction = ref(false)
const showItem = ref(false)
const itemForm = reactive<CreateInventoryItemInput>({ name: '', category: '', unit: '', initialQuantity: 0, minimumStock: 0, location: '', operator: auth.user?.name || auth.user?.username || '系统管理员' })
const form = reactive<InventoryTransactionInput & { itemId: string | number }>({
  itemId: '',
  type: 'purchase',
  quantity: 1,
  fieldId: null,
  operator: auth.user?.name || auth.user?.username || '系统管理员',
  reference: '',
  notes: '',
})
const rules: FormRules = {
  itemId: { required: true, message: '请选择农资', trigger: 'change' },
  quantity: { required: true, type: 'number', message: '请输入有效数量', trigger: ['blur', 'change'] },
  operator: { required: true, message: '请输入经办人', trigger: 'blur' },
}
const itemRules: FormRules = {
  name: { required: true, message: '请输入农资名称', trigger: 'blur' },
  category: { required: true, message: '请输入农资分类', trigger: 'blur' },
  unit: { required: true, message: '请输入计量单位', trigger: 'blur' },
  location: { required: true, message: '请输入存放位置', trigger: 'blur' },
  operator: { required: true, message: '请输入建档人', trigger: 'blur' },
}
const transactionOptions: Array<{ label: string; value: Exclude<InventoryTransactionType, 'opening'> }> = [
  { label: '采购入库', value: 'purchase' },
  { label: '生产领用', value: 'usage' },
  { label: '退料入库', value: 'return' },
  { label: '盘点调整', value: 'adjustment' },
]
const transactionMap: Record<InventoryTransactionType, { label: string; icon: typeof Plus }> = {
  opening: { label: '期初库存', icon: ClipboardList },
  purchase: { label: '采购入库', icon: ArrowDownToLine },
  usage: { label: '生产领用', icon: ArrowUpFromLine },
  return: { label: '退料入库', icon: RotateCcw },
  adjustment: { label: '盘点调整', icon: SlidersHorizontal },
}
const categories = computed(() => [...new Set(farm.inventory.map((item) => item.category))].map((value) => ({ label: value, value })))
const itemOptions = computed(() => farm.inventory.map((item) => ({ label: `${item.name}（${item.quantity} ${item.unit}）`, value: item.id })))
const fieldOptions = computed(() => farm.fields.map((field) => ({ label: field.name, value: field.id })))
const filtered = computed(() => farm.inventory.filter((item) => (!category.value || item.category === category.value) && (!keyword.value || item.name.toLowerCase().includes(keyword.value.toLowerCase()))))
const lowCount = computed(() => farm.inventory.filter((item) => item.quantity <= item.minimumStock).length)
const selectedItem = computed(() => farm.inventory.find((item) => item.id === form.itemId))
const itemName = (id: string | number) => farm.inventory.find((item) => item.id === id)?.name || '未知农资'
const itemUnit = (id: string | number) => farm.inventory.find((item) => item.id === id)?.unit || ''
const fieldName = (id: string | number | null) => id ? farm.fields.find((field) => field.id === id)?.name || '未知地块' : '-'

function openFor(itemId: string | number | '' = '') {
  Object.assign(form, {
    itemId,
    type: 'purchase',
    quantity: 1,
    fieldId: null,
    operator: auth.user?.name || auth.user?.username || '系统管理员',
    reference: '',
    notes: '',
  })
  showTransaction.value = true
}

async function createTransaction() {
  await formRef.value?.validate()
  try {
    const { itemId, ...input } = form
    await farm.createInventoryTransaction(itemId, input)
    showTransaction.value = false
    message.success('库存流水已登记')
  } catch {
    message.error(farm.errors.inventoryMutation)
  }
}

function openCreateItem() {
  Object.assign(itemForm, { name: '', category: '', unit: '', initialQuantity: 0, minimumStock: 0, location: '', operator: auth.user?.name || auth.user?.username || '系统管理员' })
  showItem.value = true
}

async function createItem() {
  await itemFormRef.value?.validate()
  try {
    await farm.createInventoryItem({ ...itemForm })
    showItem.value = false
    message.success('农资已建档，可用于采购和生产领用')
  } catch {
    message.error(farm.errors.inventoryMutation)
  }
}

onMounted(() => Promise.all([farm.loadInventory(), farm.loadInventoryTransactions(), farm.loadFields()]).catch(() => undefined))
</script>

<template>
  <page-header title="农资库存" description="通过入库、领用、退料和盘点流水核算实时库存">
    <div class="page-actions"><div class="summary-text warning"><AlertTriangle :size="17" />{{ lowCount }} 项低库存</div><n-button secondary @click="router.push('/purchases')"><template #icon><ShoppingCart /></template>采购补货</n-button><n-button secondary @click="openCreateItem"><template #icon><PackagePlus /></template>新增农资</n-button><n-button type="primary" @click="openFor()"><template #icon><Plus /></template>登记流水</n-button></div>
  </page-header>

  <div class="filter-bar"><n-input v-model:value="keyword" clearable placeholder="搜索农资名称"><template #prefix><Search :size="17" /></template></n-input><n-select v-model:value="category" clearable placeholder="全部分类" :options="categories" /></div>
  <state-panel :loading="farm.loading.inventory" :error="farm.errors.inventory" :empty="!filtered.length" empty-text="没有符合条件的库存记录" @retry="farm.loadInventory">
    <div class="inventory-grid">
      <n-card v-for="item in filtered" :key="item.id" :class="{ 'low-stock': item.quantity <= item.minimumStock }">
        <div class="inventory-head"><span class="inventory-icon"><Boxes /></span><n-tag size="small" :bordered="false">{{ item.category }}</n-tag></div>
        <h3>{{ item.name }}</h3>
        <div class="stock-number"><strong>{{ item.quantity }}</strong><span>{{ item.unit }}</span></div>
        <n-progress type="line" :percentage="Math.min(100, Math.round(item.quantity / Math.max(item.minimumStock * 2, 1) * 100))" :show-indicator="false" :status="item.quantity <= item.minimumStock ? 'error' : 'success'" />
        <div class="stock-meta"><span>安全库存 {{ item.minimumStock }} {{ item.unit }}</span><span>{{ item.location }}</span></div>
        <div v-if="item.quantity <= item.minimumStock" class="low-stock-notice"><AlertTriangle />库存不足，请及时补充</div>
        <n-button class="stock-action" size="small" secondary block @click="openFor(item.id)">登记变动</n-button>
      </n-card>
    </div>
  </state-panel>

  <section class="stock-ledger-section">
    <div class="section-heading"><div><h2>库存流水</h2><p>每次变动保留经办人、关联地块与结存数量</p></div><n-tag :bordered="false">最近 {{ Math.min(20, farm.inventoryTransactions.length) }} 条</n-tag></div>
    <state-panel :loading="farm.loading.inventoryTransactions" :error="farm.errors.inventoryTransactions" :empty="!farm.inventoryTransactions.length" empty-text="暂无库存流水" @retry="farm.loadInventoryTransactions">
      <div class="table-wrap stock-ledger"><n-table :single-line="false"><thead><tr><th>时间</th><th>农资</th><th>业务类型</th><th>变动</th><th>结存</th><th>关联地块</th><th>经办与凭证</th></tr></thead><tbody><tr v-for="entry in farm.inventoryTransactions.slice(0, 20)" :key="entry.id"><td>{{ new Date(entry.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</td><td><strong>{{ itemName(entry.itemId) }}</strong><small class="cell-detail">{{ entry.notes || '无备注' }}</small></td><td><span class="ledger-type"><component :is="transactionMap[entry.type].icon" />{{ transactionMap[entry.type].label }}</span></td><td :class="['stock-change', entry.change > 0 ? 'positive' : 'negative']">{{ entry.change > 0 ? '+' : '' }}{{ entry.change }} {{ itemUnit(entry.itemId) }}</td><td>{{ entry.balanceAfter }} {{ itemUnit(entry.itemId) }}</td><td>{{ fieldName(entry.fieldId) }}</td><td>{{ entry.operator }}<small class="cell-detail">{{ entry.reference || '无凭证号' }}</small></td></tr></tbody></n-table></div>
    </state-panel>
  </section>

  <n-modal v-model:show="showItem" preset="card" title="新增农资档案" class="form-modal" :bordered="false">
    <n-form ref="itemFormRef" :model="itemForm" :rules="itemRules" label-placement="top">
      <div class="form-grid">
        <n-form-item label="农资名称" path="name"><n-input v-model:value="itemForm.name" maxlength="100" /></n-form-item>
        <n-form-item label="分类" path="category"><n-input v-model:value="itemForm.category" maxlength="60" placeholder="例如：肥料、植保物资" /></n-form-item>
        <n-form-item label="计量单位" path="unit"><n-input v-model:value="itemForm.unit" maxlength="20" placeholder="例如：kg、袋、瓶" /></n-form-item>
        <n-form-item label="存放位置" path="location"><n-input v-model:value="itemForm.location" maxlength="100" /></n-form-item>
        <n-form-item label="期初库存"><n-input-number v-model:value="itemForm.initialQuantity" :min="0" :max="1000000" :precision="2" /></n-form-item>
        <n-form-item label="安全库存"><n-input-number v-model:value="itemForm.minimumStock" :min="0" :max="1000000" :precision="2" /></n-form-item>
        <n-form-item label="建档人" path="operator"><n-input v-model:value="itemForm.operator" maxlength="40" /></n-form-item>
      </div>
      <div class="modal-actions"><n-button @click="showItem = false">取消</n-button><n-button type="primary" :loading="farm.loading.inventoryMutation" @click="createItem">确认建档</n-button></div>
    </n-form>
  </n-modal>

  <n-modal v-model:show="showTransaction" preset="card" title="登记库存流水" class="form-modal" :bordered="false">
    <n-form ref="formRef" :model="form" :rules="rules" label-placement="top">
      <div class="form-grid">
        <n-form-item label="农资" path="itemId"><n-select v-model:value="form.itemId" filterable :options="itemOptions" placeholder="选择农资" /></n-form-item>
        <n-form-item label="业务类型"><n-select v-model:value="form.type" :options="transactionOptions" /></n-form-item>
        <n-form-item :label="form.type === 'adjustment' ? '盘点后数量' : '变动数量'" path="quantity"><n-input-number v-model:value="form.quantity" :min="form.type === 'adjustment' ? 0 : 0.01" :max="1000000" :precision="2" :placeholder="selectedItem ? `单位：${selectedItem.unit}` : '先选择农资'" /></n-form-item>
        <n-form-item label="关联地块"><n-select v-model:value="form.fieldId" clearable :options="fieldOptions" placeholder="可选，用于成本归集" /></n-form-item>
        <n-form-item label="经办人" path="operator"><n-input v-model:value="form.operator" maxlength="40" /></n-form-item>
        <n-form-item label="单据或凭证号"><n-input v-model:value="form.reference" maxlength="80" placeholder="可选" /></n-form-item>
      </div>
      <n-alert v-if="form.type === 'adjustment'" type="info" :bordered="false">盘点调整填写实际结存数量，系统会自动计算差额并保留流水。</n-alert>
      <n-form-item class="notes-field" label="备注"><n-input v-model:value="form.notes" type="textarea" :rows="3" maxlength="300" /></n-form-item>
      <div class="modal-actions"><n-button @click="showTransaction = false">取消</n-button><n-button type="primary" :loading="farm.loading.inventoryMutation" @click="createTransaction">确认登记</n-button></div>
    </n-form>
  </n-modal>
</template>

<style scoped>
.stock-action { margin-top: 14px; }
.stock-ledger-section { margin-top: 26px; }
.stock-ledger .n-table { min-width: 1020px; }
.ledger-type { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.ledger-type svg { width: 15px; height: 15px; color: #63796d; }
.stock-change { font-weight: 650; white-space: nowrap; }
.stock-change.positive { color: #4d795c; }
.stock-change.negative { color: #a05247; }
.notes-field { margin-top: 14px; }
</style>
