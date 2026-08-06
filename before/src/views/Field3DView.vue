<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { Camera, Droplets, MousePointer2, RefreshCw, Ruler, Sprout } from '@lucide/vue'
import FieldScene3D from '@/components/FieldScene3D.vue'
import { useFarmStore } from '@/stores/farm'

type CameraView = 'overview' | 'north' | 'east' | 'close'

const farm = useFarmStore()
const message = useMessage()
const selectedFieldId = ref<string | number>('')
const sceneRef = ref<InstanceType<typeof FieldScene3D> | null>(null)
const activeView = ref<CameraView>('overview')
const fieldOptions = computed(() => farm.fields.map((field) => ({ label: `${field.name} · ${field.crop || '休耕'}`, value: field.id })))
const selectedField = computed(() => farm.fields.find((field) => field.id === selectedFieldId.value) || farm.fields[0])
const statusLabel = computed(() => ({ healthy: '长势良好', attention: '需重点巡查', fallow: '休耕' }[selectedField.value?.status || 'fallow']))
const views: Array<{ key: CameraView; label: string }> = [
  { key: 'overview', label: '俯瞰' }, { key: 'north', label: '北侧' }, { key: 'east', label: '东侧' }, { key: 'close', label: '近景' },
]

onMounted(async () => {
  try {
    await farm.loadFields()
    selectedFieldId.value = farm.fields[0]?.id ?? ''
  } catch { message.error(farm.errors.fields || '无法加载地块数据') }
})

function changeView(view: CameraView) {
  activeView.value = view
  sceneRef.value?.setView(view)
}
function selectField(value: string | number) {
  selectedFieldId.value = value
  activeView.value = 'overview'
}
</script>

<template>
  <div class="scene-page">
    <div v-if="selectedField" class="scene-workspace">
      <FieldScene3D ref="sceneRef" :field="selectedField" />
      <div class="scene-toolbar">
        <n-select :value="selectedField.id" :options="fieldOptions" size="small" @update:value="selectField" />
        <div class="view-switcher" role="group" aria-label="切换观察角度">
          <button v-for="view in views" :key="view.key" :class="{ active: activeView === view.key }" @click="changeView(view.key)"><Camera />{{ view.label }}</button>
        </div>
        <n-button quaternary circle title="重置俯瞰视角" @click="changeView('overview')"><RefreshCw /></n-button>
      </div>
      <div class="field-readout">
        <small>实时地块档案</small><h2>{{ selectedField.name }}</h2><p>{{ selectedField.location }} · {{ statusLabel }}</p>
        <div><span><Sprout />{{ selectedField.crop || '休耕' }}</span><span><Ruler />{{ selectedField.area }} 亩</span><span><Droplets />墒情 {{ selectedField.soilMoisture }}%</span></div>
      </div>
      <div class="scene-gesture"><MousePointer2 /><span>拖拽旋转 · 滚轮缩放</span></div>
    </div>
    <div v-else class="scene-empty"><Sprout /><strong>尚未建立地块档案</strong><span>新增地块后即可生成三维巡查场景</span></div>
  </div>
</template>

<style scoped>
.scene-page { min-height: calc(100vh - 144px); margin: -26px -30px -40px; }
.scene-workspace { position: relative; height: calc(100vh - 78px); min-height: 620px; overflow: hidden; background: #b9c8ce; }
.scene-toolbar { position: absolute; z-index: 2; top: 20px; left: 22px; right: 22px; min-height: 48px; padding: 7px; display: grid; grid-template-columns: minmax(210px, 300px) auto 34px; align-items: center; justify-content: space-between; gap: 14px; border: 1px solid rgba(255,255,255,.56); border-radius: 8px; background: rgba(247,249,247,.92); box-shadow: 0 8px 28px rgba(37,50,43,.12); backdrop-filter: blur(10px); }
.view-switcher { height: 34px; display: flex; padding: 3px; border: 1px solid #d8dfdb; border-radius: 6px; background: #e9eeeb; }.view-switcher button { min-width: 72px; padding: 0 12px; border: 0; border-radius: 4px; background: transparent; display: flex; align-items: center; justify-content: center; gap: 6px; color: #63716a; font-size: 11px; cursor: pointer; }.view-switcher button.active { background: #fff; color: #2f6142; box-shadow: 0 1px 3px rgba(38,52,45,.12); }.view-switcher svg { width: 14px; }
.field-readout { position: absolute; z-index: 2; left: 24px; bottom: 26px; width: min(420px, calc(100% - 48px)); padding: 18px 20px; border-left: 4px solid #e1b455; background: rgba(40,54,48,.9); color: #fff; backdrop-filter: blur(8px); }.field-readout small { color: #bdc9c3; font-size: 10px; }.field-readout h2 { margin: 5px 0 3px; color: #f0c76f; font-size: 23px; }.field-readout p { margin: 0; color: #d1d9d5; font-size: 12px; }.field-readout > div { margin-top: 15px; display: flex; flex-wrap: wrap; gap: 16px; }.field-readout span { display: flex; align-items: center; gap: 5px; color: #e1e6e3; font-size: 11px; }.field-readout svg { width: 14px; }
.scene-gesture { position: absolute; z-index: 2; right: 24px; bottom: 28px; padding: 9px 12px; display: flex; align-items: center; gap: 7px; border-radius: 6px; background: rgba(255,255,255,.86); color: #4f5e57; font-size: 10px; backdrop-filter: blur(7px); }.scene-gesture svg { width: 14px; }
.scene-empty { min-height: calc(100vh - 144px); display: flex; flex-direction: column; align-items: center; justify-content: center; color: #7c8983; }.scene-empty svg { width: 38px; color: #52745d; }.scene-empty strong { margin-top: 12px; color: #34443b; }.scene-empty span { margin-top: 5px; font-size: 12px; }
@media (max-width: 760px) { .scene-page { margin: -18px -16px -30px; }.scene-workspace { height: calc(100vh - 68px); min-height: 560px; }.scene-toolbar { top: 12px; left: 12px; right: 12px; grid-template-columns: 1fr 34px; }.view-switcher { grid-column: 1 / -1; grid-row: 2; }.view-switcher button { min-width: 0; flex: 1; padding: 0 7px; }.field-readout { left: 12px; bottom: 16px; width: calc(100% - 24px); }.scene-gesture { display: none; } }
</style>
