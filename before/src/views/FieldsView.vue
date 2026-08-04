<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useMessage, type FormInst, type FormRules } from 'naive-ui'
import { MapPin, Plus, Ruler, Sprout, UserRound } from '@lucide/vue'
import { useFarmStore } from '@/stores/farm'
import type { CreateFieldInput } from '@/types'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'

const farm = useFarmStore(); const message = useMessage(); const showModal = ref(false); const formRef = ref<FormInst | null>(null)
const today = new Date().toISOString().slice(0, 10)
const harvest = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10)
const emptyForm = (): CreateFieldInput => ({ name: '', crop: '', area: 1, location: '', manager: '', status: 'healthy', plantedAt: today, expectedHarvestAt: harvest, soilMoisture: 50 })
const form = reactive<CreateFieldInput>(emptyForm())
const rules: FormRules = {
  name: { required: true, message: '请输入地块名称', trigger: 'blur' },
  crop: { required: true, message: '请输入种植作物', trigger: 'blur' },
  area: { required: true, type: 'number', message: '请输入面积', trigger: 'change' },
  location: { required: true, message: '请输入地块位置', trigger: 'blur' },
  manager: { required: true, message: '请输入负责人', trigger: 'blur' },
  plantedAt: { required: true, message: '请选择种植日期', trigger: 'change' },
  expectedHarvestAt: { required: true, message: '请选择预计采收日期', trigger: 'change' },
}
const totalArea = computed(() => farm.fields.reduce((sum, field) => sum + Number(field.area || 0), 0))
async function create() { await formRef.value?.validate(); try { await farm.createField({ ...form }); showModal.value = false; Object.assign(form, emptyForm()); message.success('农田档案已建立') } catch { message.error(farm.errors.fieldMutation) } }
onMounted(() => farm.loadFields().catch(() => undefined))
</script>
<template>
  <page-header title="农田档案" description="维护地块基础资料、种植信息和责任归属"><div class="summary-text"><strong>{{ farm.fields.length }}</strong> 个地块 · <strong>{{ totalArea }}</strong> 亩</div><n-button type="primary" @click="showModal = true"><template #icon><Plus /></template>新增地块</n-button></page-header>
  <state-panel :loading="farm.loading.fields" :error="farm.errors.fields" :empty="!farm.fields.length" empty-text="尚未建立农田档案" @retry="farm.loadFields">
    <div class="field-grid"><n-card v-for="field in farm.fields" :key="field.id"><div class="field-card-head"><span class="field-icon"><Sprout /></span><n-tag size="small" :bordered="false" :type="field.status === 'healthy' ? 'success' : field.status === 'attention' ? 'warning' : 'default'">{{ field.status === 'healthy' ? '长势良好' : field.status === 'attention' ? '需关注' : '休耕' }}</n-tag></div><h3>{{ field.name }}</h3><p class="crop-name">{{ field.crop || '暂未种植' }}</p><div class="field-meta"><span><Ruler />{{ field.area }} 亩 · 墒情 {{ field.soilMoisture }}%</span><span><MapPin />{{ field.location }}</span><span><UserRound />{{ field.manager }}</span></div><div class="planted-date">种植 {{ field.plantedAt }} · 预计采收 {{ field.expectedHarvestAt }}</div></n-card></div>
  </state-panel>
  <n-modal v-model:show="showModal" preset="card" title="新增农田档案" class="form-modal" :bordered="false"><n-form ref="formRef" :model="form" :rules="rules" label-placement="top"><div class="form-grid"><n-form-item label="地块名称" path="name"><n-input v-model:value="form.name" placeholder="例如：东区一号田" /></n-form-item><n-form-item label="种植作物" path="crop"><n-input v-model:value="form.crop" placeholder="例如：水稻" /></n-form-item><n-form-item label="面积（亩）" path="area"><n-input-number v-model:value="form.area" :min="0.1" :precision="1" /></n-form-item><n-form-item label="负责人" path="manager"><n-input v-model:value="form.manager" placeholder="输入负责人" /></n-form-item><n-form-item label="生产状态"><n-select v-model:value="form.status" :options="[{label:'长势良好',value:'healthy'},{label:'需关注',value:'attention'},{label:'休耕',value:'fallow'}]" /></n-form-item><n-form-item label="土壤墒情（%）"><n-input-number v-model:value="form.soilMoisture" :min="0" :max="100" /></n-form-item><n-form-item label="种植日期" path="plantedAt"><n-date-picker v-model:formatted-value="form.plantedAt" value-format="yyyy-MM-dd" type="date" /></n-form-item><n-form-item label="预计采收" path="expectedHarvestAt"><n-date-picker v-model:formatted-value="form.expectedHarvestAt" value-format="yyyy-MM-dd" type="date" /></n-form-item></div><n-form-item label="地块位置" path="location"><n-input v-model:value="form.location" placeholder="输入区域或坐标说明" /></n-form-item><div class="modal-actions"><n-button @click="showModal = false">取消</n-button><n-button type="primary" :loading="farm.loading.fieldMutation" @click="create">保存档案</n-button></div></n-form></n-modal>
</template>
