<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { AlertTriangle, Boxes, ClipboardCheck, Plus, Sprout, Truck, Warehouse } from '@/icons/iconpark'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import { useLivestockStore } from '@/stores/livestock'
import { useProductionStore } from '@/stores/production'
import type { HealthRecordType, LivestockSpecies } from '@/types'

const livestock = useLivestockStore()
const production = useProductionStore()
const message = useMessage()
const modal = ref<'barn' | 'batch' | 'feeding' | 'health' | 'exit' | ''>('')
const speciesLabels: Record<LivestockSpecies, string> = { cattle: '牛', pig: '猪', sheep: '羊', chicken: '鸡', duck: '鸭' }
const healthLabels: Record<HealthRecordType, string> = { vaccination: '疫苗免疫', medication: '用药治疗', inspection: '检疫检查', disinfection: '环境消毒', mortality: '死亡记录' }
const speciesOptions = Object.entries(speciesLabels).map(([value, label]) => ({ value, label }))
const activeBatches = computed(() => livestock.batches.filter((item) => item.status !== 'exited'))
const batchOptions = computed(() => activeBatches.value.map((item) => ({ label: `${item.code} · ${item.breed}（${item.quantity}）`, value: item.id })))
const barnOptions = computed(() => livestock.barns.filter((item) => item.status === 'active').map((item) => ({ label: `${item.name} · 剩余 ${remainingCapacity(item.id)}`, value: item.id })))
const farmOptions = computed(() => production.farms.filter((item) => item.status === 'active').map((item) => ({ label: item.name, value: item.id })))

const barnForm = reactive({ farmId: '', name: '', code: '', species: 'cattle' as LivestockSpecies, capacity: 100, manager: '', location: '', temperature: 22, humidity: 60 })
const batchForm = reactive({ barnId: '', code: '', species: 'cattle' as LivestockSpecies, breed: '', quantity: 1, averageWeight: 1, entryDate: today(), targetExitDate: today(), manager: '', status: 'active' })
const feedingForm = reactive({ batchId: '', feedName: '', quantityKg: 1, fedAt: localDateTime(), operator: '', notes: '' })
const healthForm = reactive({ batchId: '', type: 'vaccination' as HealthRecordType, title: '', occurredAt: today(), affectedQuantity: 1, veterinarian: '', nextDueDate: null as string | null, notes: '' })
const exitForm = reactive({ batchId: '', quantity: 1, averageWeight: 1, destination: '', exitedAt: today(), inspector: '', notes: '' })

function today() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function localDateTime() { const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return date.toISOString().slice(0, 16) }
function batchName(id: string) { return livestock.batches.find((item) => item.id === id)?.code || '未知批次' }
function barnName(id: string) { return livestock.barns.find((item) => item.id === id)?.name || '未知圈舍' }
function remainingCapacity(barnId: string) { const barn = livestock.barns.find((item) => item.id === barnId); if (!barn) return 0; return barn.capacity - livestock.batches.filter((item) => item.barnId === barnId && item.status !== 'exited').reduce((sum, item) => sum + item.quantity, 0) }
function open(type: typeof modal.value) {
  if (type !== 'barn' && !activeBatches.value.length && type !== 'batch') return message.warning('请先建立养殖批次')
  if (type === 'batch' && !livestock.barns.some((item) => item.status === 'active')) return message.warning('请先建立启用圈舍')
  modal.value = type
}

async function submit(type: Exclude<typeof modal.value, ''>) {
  try {
    if (type === 'barn') await livestock.createBarn({ ...barnForm })
    if (type === 'batch') await livestock.createBatch({ ...batchForm })
    if (type === 'feeding') await livestock.createFeeding({ ...feedingForm })
    if (type === 'health') await livestock.createHealth({ ...healthForm })
    if (type === 'exit') await livestock.createExit({ ...exitForm })
    modal.value = ''
    message.success({ barn: '圈舍已建立', batch: '养殖批次已入场', feeding: '饲喂记录已保存', health: '健康防疫记录已保存', exit: '出栏登记及追溯码已生成' }[type])
  } catch { message.error(livestock.errors.mutation || '保存失败') }
}

function syncBatchSpecies(barnId: string) {
  const barn = livestock.barns.find((item) => item.id === barnId)
  if (barn) batchForm.species = barn.species
}

onMounted(() => Promise.allSettled([livestock.loadAll(), production.loadFarms()]))
</script>

<template>
  <page-header title="畜牧养殖中心" description="圈舍、存栏、饲喂、防疫、出栏与追溯的一体化管理">
    <n-button secondary @click="open('feeding')">登记饲喂</n-button>
    <n-button secondary @click="open('health')">健康防疫</n-button>
    <n-button type="primary" @click="open('batch')"><template #icon><Plus /></template>批次入场</n-button>
  </page-header>

  <div class="domain-kpis livestock-kpis">
    <div><span class="domain-kpi-icon"><Warehouse /></span><small>运营圈舍</small><strong>{{ livestock.summary.barns }}</strong><em>个养殖单元</em></div>
    <div><span class="domain-kpi-icon blue"><Sprout /></span><small>当前存栏</small><strong>{{ livestock.summary.currentAnimals }}</strong><em>{{ livestock.summary.activeBatches }} 个批次</em></div>
    <div><span class="domain-kpi-icon amber"><Boxes /></span><small>今日饲喂</small><strong>{{ livestock.summary.feedTodayKg }}</strong><em>kg 投喂量</em></div>
    <div><span class="domain-kpi-icon red"><AlertTriangle /></span><small>隔离/待办</small><strong>{{ livestock.summary.quarantineBatches + livestock.summary.healthDue }}</strong><em>批次与防疫事项</em></div>
    <div><span class="domain-kpi-icon"><Truck /></span><small>本月出栏</small><strong>{{ livestock.summary.exitedThisMonth }}</strong><em>头/只</em></div>
  </div>

  <state-panel :loading="livestock.loading.all" :error="livestock.errors.all" @retry="livestock.loadAll">
    <n-tabs type="line" animated>
      <n-tab-pane name="barns" tab="圈舍环境">
        <div class="section-actions"><n-button type="primary" size="small" @click="open('barn')"><template #icon><Plus /></template>新增圈舍</n-button></div>
        <div class="barn-grid">
          <article v-for="item in livestock.barns" :key="item.id" :class="['barn-card', item.status]">
            <div><span><Warehouse /></span><n-tag size="small" :type="item.status === 'active' ? 'success' : item.status === 'maintenance' ? 'warning' : 'default'">{{ item.status === 'active' ? '运行中' : item.status === 'maintenance' ? '维护中' : '空置' }}</n-tag></div>
            <h3>{{ item.name }}</h3><p>{{ item.code }} · {{ speciesLabels[item.species] }}舍 · {{ item.location }}</p>
            <dl><div><dt>容量</dt><dd>{{ item.capacity }}</dd></div><div><dt>剩余</dt><dd>{{ remainingCapacity(item.id) }}</dd></div><div><dt>温度</dt><dd>{{ item.temperature }}℃</dd></div><div><dt>湿度</dt><dd>{{ item.humidity }}%</dd></div></dl>
            <footer><span>负责人 {{ item.manager }}</span><n-select size="tiny" :value="item.status" :options="[{label:'运行中',value:'active'},{label:'维护中',value:'maintenance'},{label:'空置',value:'empty'}]" @update:value="livestock.updateBarnStatus(item.id, $event)" /></footer>
          </article>
        </div>
      </n-tab-pane>
      <n-tab-pane name="batches" tab="存栏批次">
        <div class="table-wrap"><n-table :single-line="false"><thead><tr><th>批次</th><th>圈舍</th><th>品种</th><th>存栏</th><th>均重</th><th>计划出栏</th><th>状态</th></tr></thead><tbody><tr v-for="item in livestock.batches" :key="item.id"><td><strong>{{ item.code }}</strong><small class="cell-detail">负责人 {{ item.manager }}</small></td><td>{{ barnName(item.barnId) }}</td><td>{{ speciesLabels[item.species] }} · {{ item.breed }}</td><td>{{ item.quantity }} 头/只</td><td>{{ item.averageWeight }} kg</td><td>{{ item.targetExitDate }}</td><td><n-tag size="small" :type="item.status === 'active' ? 'success' : item.status === 'quarantine' ? 'warning' : 'default'">{{ item.status === 'active' ? '养殖中' : item.status === 'quarantine' ? '隔离检疫' : '已结束' }}</n-tag></td></tr></tbody></n-table></div>
      </n-tab-pane>
      <n-tab-pane name="feeding" tab="饲喂记录"><div class="section-actions"><n-button size="small" type="primary" @click="open('feeding')">登记饲喂</n-button></div><div class="table-wrap"><n-table><thead><tr><th>时间</th><th>批次</th><th>饲料</th><th>数量</th><th>操作人</th><th>备注</th></tr></thead><tbody><tr v-for="item in livestock.feeding" :key="item.id"><td>{{ new Date(item.fedAt).toLocaleString('zh-CN') }}</td><td>{{ batchName(item.batchId) }}</td><td>{{ item.feedName }}</td><td>{{ item.quantityKg }} kg</td><td>{{ item.operator }}</td><td>{{ item.notes || '—' }}</td></tr></tbody></n-table></div></n-tab-pane>
      <n-tab-pane name="health" tab="健康防疫"><div class="section-actions"><n-button size="small" type="primary" @click="open('health')">登记健康事件</n-button></div><div class="table-wrap"><n-table><thead><tr><th>日期</th><th>批次</th><th>类型</th><th>事项</th><th>涉及数量</th><th>兽医/负责人</th><th>下次日期</th></tr></thead><tbody><tr v-for="item in livestock.health" :key="item.id"><td>{{ item.occurredAt }}</td><td>{{ batchName(item.batchId) }}</td><td>{{ healthLabels[item.type] }}</td><td>{{ item.title }}</td><td>{{ item.affectedQuantity }}</td><td>{{ item.veterinarian }}</td><td>{{ item.nextDueDate || '—' }}</td></tr></tbody></n-table></div></n-tab-pane>
      <n-tab-pane name="exits" tab="出栏追溯"><div class="section-actions"><n-button size="small" type="primary" @click="open('exit')"><template #icon><Truck /></template>登记出栏</n-button></div><div class="table-wrap"><n-table><thead><tr><th>出栏日期</th><th>批次</th><th>数量</th><th>均重</th><th>去向</th><th>检疫员</th><th>追溯码</th></tr></thead><tbody><tr v-for="item in livestock.exits" :key="item.id"><td>{{ item.exitedAt }}</td><td>{{ batchName(item.batchId) }}</td><td>{{ item.quantity }}</td><td>{{ item.averageWeight }} kg</td><td>{{ item.destination }}</td><td>{{ item.inspector }}</td><td><code>{{ item.traceCode }}</code></td></tr><tr v-if="!livestock.exits.length"><td colspan="7" class="empty-cell">暂无出栏记录</td></tr></tbody></n-table></div></n-tab-pane>
    </n-tabs>
  </state-panel>

  <n-modal :show="modal === 'barn'" preset="card" title="新增养殖圈舍" class="form-modal" @update:show="!$event && (modal = '')"><n-form label-placement="top"><div class="form-grid"><n-form-item label="所属农场" required><n-select v-model:value="barnForm.farmId" :options="farmOptions" /></n-form-item><n-form-item label="圈舍名称" required><n-input v-model:value="barnForm.name" /></n-form-item><n-form-item label="圈舍编号" required><n-input v-model:value="barnForm.code" /></n-form-item><n-form-item label="养殖物种"><n-select v-model:value="barnForm.species" :options="speciesOptions" /></n-form-item><n-form-item label="设计容量"><n-input-number v-model:value="barnForm.capacity" :min="1" /></n-form-item><n-form-item label="负责人" required><n-input v-model:value="barnForm.manager" /></n-form-item><n-form-item label="当前温度"><n-input-number v-model:value="barnForm.temperature" /></n-form-item><n-form-item label="当前湿度"><n-input-number v-model:value="barnForm.humidity" :min="0" :max="100" /></n-form-item></div><n-form-item label="位置" required><n-input v-model:value="barnForm.location" /></n-form-item><div class="modal-actions"><n-button @click="modal=''">取消</n-button><n-button type="primary" @click="submit('barn')">保存圈舍</n-button></div></n-form></n-modal>
  <n-modal :show="modal === 'batch'" preset="card" title="养殖批次入场" class="form-modal" @update:show="!$event && (modal = '')"><n-form label-placement="top"><div class="form-grid"><n-form-item label="入驻圈舍" required><n-select v-model:value="batchForm.barnId" :options="barnOptions" @update:value="syncBatchSpecies" /></n-form-item><n-form-item label="批次编号" required><n-input v-model:value="batchForm.code" /></n-form-item><n-form-item label="物种"><n-select v-model:value="batchForm.species" :options="speciesOptions" disabled /></n-form-item><n-form-item label="品种" required><n-input v-model:value="batchForm.breed" /></n-form-item><n-form-item label="入场数量"><n-input-number v-model:value="batchForm.quantity" :min="1" /></n-form-item><n-form-item label="平均体重 kg"><n-input-number v-model:value="batchForm.averageWeight" :min="0.01" /></n-form-item><n-form-item label="入场日期"><n-date-picker v-model:formatted-value="batchForm.entryDate" value-format="yyyy-MM-dd" type="date" /></n-form-item><n-form-item label="预计出栏"><n-date-picker v-model:formatted-value="batchForm.targetExitDate" value-format="yyyy-MM-dd" type="date" /></n-form-item><n-form-item label="负责人"><n-input v-model:value="batchForm.manager" /></n-form-item><n-form-item label="入场状态"><n-select v-model:value="batchForm.status" :options="[{label:'正常养殖',value:'active'},{label:'隔离检疫',value:'quarantine'}]" /></n-form-item></div><div class="modal-actions"><n-button @click="modal=''">取消</n-button><n-button type="primary" @click="submit('batch')">确认入场</n-button></div></n-form></n-modal>
  <n-modal :show="modal === 'feeding'" preset="card" title="登记饲喂记录" class="form-modal" @update:show="!$event && (modal = '')"><n-form label-placement="top"><div class="form-grid"><n-form-item label="养殖批次" required><n-select v-model:value="feedingForm.batchId" :options="batchOptions" /></n-form-item><n-form-item label="饲料名称" required><n-input v-model:value="feedingForm.feedName" /></n-form-item><n-form-item label="投喂量 kg"><n-input-number v-model:value="feedingForm.quantityKg" :min="0.01" /></n-form-item><n-form-item label="饲喂时间"><n-date-picker v-model:formatted-value="feedingForm.fedAt" value-format="yyyy-MM-dd'T'HH:mm" type="datetime" /></n-form-item><n-form-item label="操作人"><n-input v-model:value="feedingForm.operator" /></n-form-item></div><n-form-item label="备注"><n-input v-model:value="feedingForm.notes" /></n-form-item><div class="modal-actions"><n-button @click="modal=''">取消</n-button><n-button type="primary" @click="submit('feeding')">保存记录</n-button></div></n-form></n-modal>
  <n-modal :show="modal === 'health'" preset="card" title="健康与防疫记录" class="form-modal" @update:show="!$event && (modal = '')"><n-form label-placement="top"><div class="form-grid"><n-form-item label="养殖批次" required><n-select v-model:value="healthForm.batchId" :options="batchOptions" /></n-form-item><n-form-item label="事件类型"><n-select v-model:value="healthForm.type" :options="Object.entries(healthLabels).map(([value,label])=>({value,label}))" /></n-form-item><n-form-item label="事项名称"><n-input v-model:value="healthForm.title" /></n-form-item><n-form-item label="发生日期"><n-date-picker v-model:formatted-value="healthForm.occurredAt" value-format="yyyy-MM-dd" type="date" /></n-form-item><n-form-item label="涉及数量"><n-input-number v-model:value="healthForm.affectedQuantity" :min="1" /></n-form-item><n-form-item label="兽医/负责人"><n-input v-model:value="healthForm.veterinarian" /></n-form-item><n-form-item label="下次计划日期"><n-date-picker v-model:formatted-value="healthForm.nextDueDate" value-format="yyyy-MM-dd" type="date" clearable /></n-form-item></div><n-form-item label="备注"><n-input v-model:value="healthForm.notes" /></n-form-item><div class="modal-actions"><n-button @click="modal=''">取消</n-button><n-button type="primary" @click="submit('health')">保存记录</n-button></div></n-form></n-modal>
  <n-modal :show="modal === 'exit'" preset="card" title="登记出栏与追溯" class="form-modal" @update:show="!$event && (modal = '')"><n-form label-placement="top"><div class="form-grid"><n-form-item label="养殖批次"><n-select v-model:value="exitForm.batchId" :options="batchOptions" /></n-form-item><n-form-item label="出栏数量"><n-input-number v-model:value="exitForm.quantity" :min="1" /></n-form-item><n-form-item label="平均体重 kg"><n-input-number v-model:value="exitForm.averageWeight" :min="0.01" /></n-form-item><n-form-item label="出栏日期"><n-date-picker v-model:formatted-value="exitForm.exitedAt" value-format="yyyy-MM-dd" type="date" /></n-form-item><n-form-item label="去向"><n-input v-model:value="exitForm.destination" /></n-form-item><n-form-item label="检疫员"><n-input v-model:value="exitForm.inspector" /></n-form-item></div><n-form-item label="备注"><n-input v-model:value="exitForm.notes" /></n-form-item><div class="modal-actions"><n-button @click="modal=''">取消</n-button><n-button type="primary" @click="submit('exit')">确认出栏</n-button></div></n-form></n-modal>
</template>

<style scoped>
.livestock-kpis { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.section-actions { margin-bottom: 12px; display: flex; justify-content: flex-end; }
.barn-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }.barn-card { padding: 17px; border: 1px solid #dfe6e1; border-radius: 8px; background: #fff; }.barn-card.maintenance { border-color: #e5d3ab; }.barn-card.empty { opacity: .65; }.barn-card > div:first-child { display: flex; align-items: center; justify-content: space-between; }.barn-card > div:first-child > span { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 7px; background: #e8f1eb; color: #48705a; }.barn-card svg { width: 19px; }.barn-card h3 { margin: 12px 0 4px; color: #33443b; font-size: 15px; }.barn-card > p { margin: 0; color: #7b8781; font-size: 10px; }.barn-card dl { margin: 15px 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }.barn-card dl div { padding: 8px 5px; border-radius: 5px; background: #f5f7f5; text-align: center; }.barn-card dt { color: #8a958f; font-size: 9px; }.barn-card dd { margin: 3px 0 0; color: #3b4c43; font-size: 12px; font-weight: 600; }.barn-card footer { padding-top: 11px; border-top: 1px solid #edf0ee; display: grid; grid-template-columns: 1fr 100px; align-items: center; gap: 8px; color: #78847e; font-size: 10px; }
code { color: #36684a; font-size: 10px; }.empty-cell { padding: 28px !important; color: #8a958f; text-align: center; }
@media (max-width: 1180px) { .livestock-kpis { grid-template-columns: repeat(3, 1fr); }.barn-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 720px) { .livestock-kpis, .barn-grid { grid-template-columns: 1fr; } }
</style>
