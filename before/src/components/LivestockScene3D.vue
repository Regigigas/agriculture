<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Barn, LivestockBatch, LivestockSpecies } from '@/types'

const props = defineProps<{ barns: Barn[]; batches: LivestockBatch[]; selectedBarnId?: string }>()
const emit = defineEmits<{ select: [barnId: string] }>()
const canvasHost = ref<HTMLElement>()
const activeBarnId = ref(props.selectedBarnId || '')
const speciesLabels: Record<LivestockSpecies, string> = { cattle: '牛', pig: '猪', sheep: '羊', chicken: '鸡', duck: '鸭' }

let scene: THREE.Scene | undefined
let camera: THREE.PerspectiveCamera | undefined
let renderer: THREE.WebGLRenderer | undefined
let controls: OrbitControls | undefined
let resizeObserver: ResizeObserver | undefined
let animationFrame = 0
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const barnMeshes: THREE.Mesh[] = []

const selectedBarn = computed(() => props.barns.find((item) => item.id === activeBarnId.value) || props.barns[0])
const selectedBatches = computed(() => props.batches.filter((item) => item.barnId === selectedBarn.value?.id && item.status !== 'exited'))
const selectedQuantity = computed(() => selectedBatches.value.reduce((sum, item) => sum + item.quantity, 0))
const selectedLoad = computed(() => selectedBarn.value ? Math.round(selectedQuantity.value / selectedBarn.value.capacity * 100) : 0)

function barnColor(barn: Barn) {
  const hasQuarantine = props.batches.some((item) => item.barnId === barn.id && item.status === 'quarantine')
  if (hasQuarantine) return 0xc78b38
  if (barn.status === 'maintenance') return 0x9a7650
  if (barn.status === 'empty') return 0x87938d
  return 0x527b60
}

function createAnimal(species: LivestockSpecies, color: number) {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.82 })
  const small = species === 'chicken' || species === 'duck'
  const body = new THREE.Mesh(new THREE.SphereGeometry(small ? 0.2 : 0.34, 10, 8), material)
  body.scale.set(1.35, 0.82, 0.72)
  body.position.y = small ? 0.28 : 0.48
  group.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(small ? 0.12 : 0.2, 10, 8), material)
  head.position.set(0.42, small ? 0.39 : 0.6, 0)
  group.add(head)
  if (!small) {
    for (const x of [-0.22, 0.22]) for (const z of [-0.16, 0.16]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.38, 6), material)
      leg.position.set(x, 0.2, z)
      group.add(leg)
    }
  }
  return group
}

function buildScene() {
  if (!scene) return
  while (scene.children.length) scene.remove(scene.children[0])
  barnMeshes.length = 0
  scene.background = new THREE.Color(0xcbd7d2)
  scene.fog = new THREE.Fog(0xcbd7d2, 45, 95)
  scene.add(new THREE.HemisphereLight(0xf5faf6, 0x51483c, 2.2))
  const sun = new THREE.DirectionalLight(0xfff1d3, 3)
  sun.position.set(20, 30, 16)
  sun.castShadow = true
  scene.add(sun)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 72), new THREE.MeshStandardMaterial({ color: 0x778972, roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)
  const count = Math.max(props.barns.length, 1)
  const columns = Math.ceil(Math.sqrt(count))
  props.barns.forEach((barn, index) => {
    const x = (index % columns - (columns - 1) / 2) * 14
    const z = (Math.floor(index / columns) - (Math.ceil(count / columns) - 1) / 2) * 12
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    const selected = barn.id === activeBarnId.value
    const base = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.55, 7.4), new THREE.MeshStandardMaterial({ color: selected ? 0xd6b45e : 0x806750, roughness: 1 }))
    base.position.y = 0.28
    base.receiveShadow = true
    base.userData.barnId = barn.id
    barnMeshes.push(base)
    group.add(base)
    const wallMaterial = new THREE.MeshStandardMaterial({ color: barnColor(barn), roughness: 0.88, transparent: true, opacity: 0.9 })
    for (const zWall of [-3.25, 3.25]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 2.4, 0.22), wallMaterial)
      wall.position.set(0, 1.55, zWall)
      wall.userData.barnId = barn.id
      barnMeshes.push(wall)
      group.add(wall)
    }
    for (const xWall of [-4.9, 4.9]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.4, 6.3), wallMaterial)
      wall.position.set(xWall, 1.55, 0)
      wall.userData.barnId = barn.id
      barnMeshes.push(wall)
      group.add(wall)
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(10.7, 0.22, 7.6), new THREE.MeshStandardMaterial({ color: 0x34483e, roughness: 0.75, transparent: true, opacity: 0.48 }))
    roof.position.y = 3.05
    roof.userData.barnId = barn.id
    barnMeshes.push(roof)
    group.add(roof)

    const batches = props.batches.filter((item) => item.barnId === barn.id && item.status !== 'exited')
    const quantity = batches.reduce((sum, item) => sum + item.quantity, 0)
    const visibleAnimals = Math.min(18, Math.max(batches.length ? 1 : 0, Math.ceil(quantity / Math.max(1, barn.capacity) * 18)))
    for (let animalIndex = 0; animalIndex < visibleAnimals; animalIndex++) {
      const batch = batches[animalIndex % batches.length]
      const animal = createAnimal(barn.species, batch?.status === 'quarantine' ? 0xd49b3f : 0xe7ddd0)
      animal.position.set(-3.8 + animalIndex % 6 * 1.45, 0.55, -1.8 + Math.floor(animalIndex / 6) * 1.75)
      animal.rotation.y = animalIndex % 2 ? Math.PI : 0
      group.add(animal)
    }
    scene?.add(group)
  })
}

function init() {
  if (!canvasHost.value) return
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 150)
  camera.position.set(27, 24, 30)
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.outputColorSpace = THREE.SRGBColorSpace
  canvasHost.value.appendChild(renderer.domElement)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.target.set(0, 1, 0)
  controls.maxPolarAngle = Math.PI / 2.05
  controls.minDistance = 12
  controls.maxDistance = 70
  renderer.domElement.addEventListener('pointerdown', handlePointer)
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvasHost.value)
  buildScene()
  resize()
  animate()
}

function resize() {
  if (!canvasHost.value || !camera || !renderer) return
  const { clientWidth, clientHeight } = canvasHost.value
  camera.aspect = clientWidth / Math.max(clientHeight, 1)
  camera.updateProjectionMatrix()
  renderer.setSize(clientWidth, clientHeight, false)
}

function animate() {
  controls?.update()
  if (scene && camera) renderer?.render(scene, camera)
  animationFrame = requestAnimationFrame(animate)
}

function handlePointer(event: PointerEvent) {
  if (!renderer || !camera) return
  const bounds = renderer.domElement.getBoundingClientRect()
  pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1)
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects(barnMeshes)[0]
  const barnId = hit?.object.userData.barnId as string | undefined
  if (barnId) { activeBarnId.value = barnId; emit('select', barnId) }
}

function setView(view: 'overview' | 'top') {
  if (!camera || !controls) return
  camera.position.set(view === 'top' ? 0 : 27, view === 'top' ? 42 : 24, view === 'top' ? 0.1 : 30)
  controls.target.set(0, 1, 0)
  controls.update()
}

watch(() => [props.barns, props.batches, activeBarnId.value], buildScene, { deep: true })
watch(() => props.selectedBarnId, (value) => { if (value) activeBarnId.value = value })
onMounted(init)
onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  if (renderer) { renderer.domElement.removeEventListener('pointerdown', handlePointer); renderer.dispose(); renderer.domElement.remove() }
  controls?.dispose()
})
</script>

<template>
  <section class="livestock-scene" data-testid="livestock-3d-scene">
    <div class="scene-toolbar">
      <div><strong>3D 数字牧场</strong><span>点击圈舍查看存栏、环境与检疫状态</span></div>
      <div><n-button size="tiny" secondary @click="setView('overview')">鸟瞰</n-button><n-button size="tiny" secondary @click="setView('top')">平面</n-button></div>
    </div>
    <div ref="canvasHost" class="scene-canvas" />
    <div v-if="selectedBarn" class="scene-detail">
      <strong>{{ selectedBarn.name }}</strong><span>{{ speciesLabels[selectedBarn.species] }}舍 · {{ selectedQuantity }} 头/只</span>
      <dl><div><dt>负载率</dt><dd>{{ selectedLoad }}%</dd></div><div><dt>温度</dt><dd>{{ selectedBarn.temperature }}℃</dd></div><div><dt>湿度</dt><dd>{{ selectedBarn.humidity }}%</dd></div><div><dt>批次</dt><dd>{{ selectedBatches.length }}</dd></div></dl>
    </div>
    <div class="scene-legend"><span><i class="normal" />正常运行</span><span><i class="warning" />隔离检疫</span><span><i class="idle" />维护/空置</span></div>
  </section>
</template>

<style scoped>
.livestock-scene { position: relative; height: 430px; margin-bottom: 18px; overflow: hidden; border: 1px solid #d8e2dc; border-radius: 10px; background: #cbd7d2; box-shadow: 0 6px 20px rgba(48, 72, 59, .08); }
.scene-canvas { width: 100%; height: 100%; }.scene-canvas :deep(canvas) { display: block; width: 100%; height: 100%; }
.scene-toolbar { position: absolute; z-index: 2; top: 14px; left: 14px; right: 14px; display: flex; justify-content: space-between; pointer-events: none; }.scene-toolbar > div { display: flex; gap: 7px; }.scene-toolbar > div:first-child { flex-direction: column; padding: 10px 13px; border-radius: 7px; color: #eff7f1; background: rgba(39, 58, 48, .84); }.scene-toolbar strong { font-size: 14px; }.scene-toolbar span { font-size: 10px; opacity: .82; }.scene-toolbar .n-button { pointer-events: auto; background: rgba(255,255,255,.88); }
.scene-detail { position: absolute; z-index: 2; left: 14px; bottom: 14px; width: 285px; padding: 12px 14px; border: 1px solid rgba(255,255,255,.48); border-radius: 8px; color: #34483e; background: rgba(248, 251, 249, .91); backdrop-filter: blur(8px); }.scene-detail > span { display: block; margin-top: 2px; color: #718078; font-size: 10px; }.scene-detail dl { display: grid; grid-template-columns: repeat(4,1fr); margin: 10px 0 0; }.scene-detail dl div { border-left: 1px solid #dce3df; padding-left: 8px; }.scene-detail dl div:first-child { border: 0; padding-left: 0; }.scene-detail dt { color: #859189; font-size: 9px; }.scene-detail dd { margin: 2px 0 0; font-size: 12px; font-weight: 700; }
.scene-legend { position: absolute; right: 14px; bottom: 14px; display: flex; gap: 12px; padding: 8px 10px; border-radius: 6px; color: #526159; background: rgba(248,251,249,.88); font-size: 9px; }.scene-legend span { display: flex; align-items: center; gap: 4px; }.scene-legend i { width: 8px; height: 8px; border-radius: 50%; background: #527b60; }.scene-legend i.warning { background: #c78b38; }.scene-legend i.idle { background: #87938d; }
@media (max-width: 720px) { .livestock-scene { height: 360px; }.scene-toolbar span, .scene-legend { display: none; }.scene-detail { left: 10px; right: 10px; bottom: 10px; width: auto; } }
</style>
