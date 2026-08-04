<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import { Building2, LandPlot, MapPin, Phone, Plus, UserRound } from '@lucide/vue'
import { useProductionStore } from '@/stores/production'
import type { BusinessSubject, Farm, SubjectType } from '@/types'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'

const production = useProductionStore()
const message = useMessage()
const dialog = useDialog()
const showSubject = ref(false)
const showFarm = ref(false)
const subjectForm = reactive({ name: '', type: 'family_farm' as SubjectType, creditCode: '', contact: '', phone: '', address: '', notes: '' })
const farmForm = reactive({ subjectId: '', name: '', location: '', totalArea: 1, manager: '', description: '' })
const subjectTypes: Record<SubjectType, string> = { individual: '个人农户', family_farm: '家庭农场', cooperative: '合作社', company: '农业企业' }
const subjectOptions = computed(() => production.subjects.filter((item) => item.status === 'active').map((item) => ({ label: item.name, value: item.id })))
const subjectName = (id: string) => production.subjects.find((item) => item.id === id)?.name || '未知主体'
const totalArea = computed(() => production.farms.filter((item) => item.status === 'active').reduce((sum, item) => sum + item.totalArea, 0))

async function createSubject() {
  if (!subjectForm.name.trim() || !subjectForm.contact.trim() || !subjectForm.phone.trim() || !subjectForm.address.trim()) return message.warning('请完整填写主体名称、联系人、电话和地址')
  try {
    await production.createSubject({ ...subjectForm })
    Object.assign(subjectForm, { name: '', type: 'family_farm', creditCode: '', contact: '', phone: '', address: '', notes: '' })
    showSubject.value = false; message.success('经营主体已建立')
  } catch { message.error(production.errors.subjectMutation) }
}

async function createFarm() {
  if (!farmForm.subjectId || !farmForm.name.trim() || !farmForm.location.trim() || !farmForm.manager.trim()) return message.warning('请选择经营主体并完整填写农场信息')
  try {
    await production.createFarm({ ...farmForm })
    Object.assign(farmForm, { subjectId: '', name: '', location: '', totalArea: 1, manager: '', description: '' })
    showFarm.value = false; message.success('农场档案已建立')
  } catch { message.error(production.errors.farmMutation) }
}

function toggleSubject(item: BusinessSubject) {
  const next = item.status === 'active' ? 'inactive' : 'active'
  dialog.warning({ title: next === 'inactive' ? '停用经营主体' : '重新启用主体', content: `确认${next === 'inactive' ? '停用' : '启用'}“${item.name}”？`, positiveText: '确认', negativeText: '取消', onPositiveClick: async () => {
    try { await production.updateSubjectStatus(item.id, next); message.success('主体状态已更新') } catch { message.error(production.errors.subjectMutation) }
  } })
}

async function toggleFarm(item: Farm) {
  try { await production.updateFarmStatus(item.id, item.status === 'active' ? 'inactive' : 'active'); message.success('农场状态已更新') } catch { message.error(production.errors.farmMutation) }
}

onMounted(() => production.loadOrganization().catch(() => undefined))
</script>

<template>
  <page-header title="经营主体与农场" description="以经营主体、农场、地块三级结构管理责任和空间资产">
    <n-button secondary @click="showSubject = true"><template #icon><Plus /></template>新增主体</n-button>
    <n-button type="primary" @click="showFarm = true"><template #icon><Plus /></template>新增农场</n-button>
  </page-header>

  <div class="domain-kpis">
    <div><span class="domain-kpi-icon"><Building2 /></span><small>经营主体</small><strong>{{ production.subjects.filter(x => x.status === 'active').length }}</strong><em>个启用主体</em></div>
    <div><span class="domain-kpi-icon blue"><LandPlot /></span><small>农场园区</small><strong>{{ production.farms.filter(x => x.status === 'active').length }}</strong><em>个运营单元</em></div>
    <div><span class="domain-kpi-icon amber"><MapPin /></span><small>备案面积</small><strong>{{ totalArea.toFixed(1) }}</strong><em>亩</em></div>
  </div>

  <state-panel :loading="production.loading.subjects || production.loading.farms" :error="production.errors.subjects || production.errors.farms" @retry="production.loadOrganization">
    <n-tabs type="line" animated>
      <n-tab-pane name="subjects" tab="经营主体">
        <div class="organization-grid">
          <article v-for="item in production.subjects" :key="item.id" :class="['organization-card', { inactive: item.status === 'inactive' }]">
            <div class="organization-card-head"><span class="organization-logo"><Building2 /></span><n-tag :type="item.status === 'active' ? 'success' : 'default'" size="small">{{ item.status === 'active' ? '启用' : '已停用' }}</n-tag></div>
            <h3>{{ item.name }}</h3><p>{{ subjectTypes[item.type] }} · {{ item.creditCode || '未填写统一代码' }}</p>
            <dl><div><dt><UserRound /></dt><dd>{{ item.contact }}</dd></div><div><dt><Phone /></dt><dd>{{ item.phone }}</dd></div><div><dt><MapPin /></dt><dd>{{ item.address }}</dd></div></dl>
            <div class="organization-footer"><span>{{ production.farms.filter(farm => farm.subjectId === item.id).length }} 个农场</span><n-button size="tiny" secondary @click="toggleSubject(item)">{{ item.status === 'active' ? '停用' : '启用' }}</n-button></div>
          </article>
        </div>
      </n-tab-pane>
      <n-tab-pane name="farms" tab="农场园区">
        <div class="table-wrap"><n-table :single-line="false"><thead><tr><th>农场</th><th>经营主体</th><th>位置</th><th>备案面积</th><th>负责人</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="item in production.farms" :key="item.id"><td><strong>{{ item.name }}</strong><small class="cell-detail">{{ item.description || '无补充说明' }}</small></td><td>{{ subjectName(item.subjectId) }}</td><td>{{ item.location }}</td><td>{{ item.totalArea }} 亩</td><td>{{ item.manager }}</td><td><n-tag size="small" :type="item.status === 'active' ? 'success' : 'default'">{{ item.status === 'active' ? '运营中' : '已停用' }}</n-tag></td><td><n-button size="tiny" secondary @click="toggleFarm(item)">{{ item.status === 'active' ? '停用' : '启用' }}</n-button></td></tr></tbody></n-table></div>
      </n-tab-pane>
    </n-tabs>
  </state-panel>

  <n-modal v-model:show="showSubject" preset="card" title="新增经营主体" class="form-modal" :bordered="false"><n-form :model="subjectForm" label-placement="top"><div class="form-grid"><n-form-item label="主体名称" required><n-input v-model:value="subjectForm.name" /></n-form-item><n-form-item label="主体类型"><n-select v-model:value="subjectForm.type" :options="Object.entries(subjectTypes).map(([value,label]) => ({value,label}))" /></n-form-item><n-form-item label="统一代码/备案号"><n-input v-model:value="subjectForm.creditCode" /></n-form-item><n-form-item label="联系人" required><n-input v-model:value="subjectForm.contact" /></n-form-item><n-form-item label="联系电话" required><n-input v-model:value="subjectForm.phone" /></n-form-item></div><n-form-item label="联系地址" required><n-input v-model:value="subjectForm.address" /></n-form-item><n-form-item label="备注"><n-input v-model:value="subjectForm.notes" type="textarea" :rows="3" /></n-form-item><div class="modal-actions"><n-button @click="showSubject = false">取消</n-button><n-button type="primary" :loading="production.loading.subjectMutation" @click="createSubject">建立主体</n-button></div></n-form></n-modal>
  <n-modal v-model:show="showFarm" preset="card" title="新增农场园区" class="form-modal" :bordered="false"><n-form :model="farmForm" label-placement="top"><div class="form-grid"><n-form-item label="经营主体" required><n-select v-model:value="farmForm.subjectId" :options="subjectOptions" /></n-form-item><n-form-item label="农场名称" required><n-input v-model:value="farmForm.name" /></n-form-item><n-form-item label="备案面积（亩）"><n-input-number v-model:value="farmForm.totalArea" :min="0.1" :precision="1" /></n-form-item><n-form-item label="负责人" required><n-input v-model:value="farmForm.manager" /></n-form-item></div><n-form-item label="位置" required><n-input v-model:value="farmForm.location" /></n-form-item><n-form-item label="经营说明"><n-input v-model:value="farmForm.description" type="textarea" :rows="3" /></n-form-item><div class="modal-actions"><n-button @click="showFarm = false">取消</n-button><n-button type="primary" :loading="production.loading.farmMutation" @click="createFarm">建立农场</n-button></div></n-form></n-modal>
</template>

<style scoped>
.organization-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.organization-card { padding: 18px; border: 1px solid #e0e5e2; border-radius: 8px; background: #fff; }.organization-card.inactive { opacity: .62; }
.organization-card-head { display: flex; align-items: center; justify-content: space-between; }.organization-logo { width: 40px; height: 40px; display: grid; place-items: center; color: #4a6f58; background: #e8f0ea; border-radius: 7px; }.organization-logo svg { width: 20px; }
.organization-card h3 { margin: 14px 0 4px; font-size: 16px; }.organization-card > p { margin: 0; color: #7a8781; font-size: 11px; }
.organization-card dl { margin: 16px 0 0; display: grid; gap: 8px; }.organization-card dl div { display: grid; grid-template-columns: 20px 1fr; color: #63706a; font-size: 12px; }.organization-card dt, .organization-card dd { margin: 0; }.organization-card dt svg { width: 14px; height: 14px; }
.organization-footer { margin-top: 14px; padding-top: 12px; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #edf0ee; color: #7e8a84; font-size: 11px; }
@media (max-width: 1050px) { .organization-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 650px) { .organization-grid { grid-template-columns: 1fr; } }
</style>
