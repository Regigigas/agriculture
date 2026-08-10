<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export type TrialKind = 'fertilizer' | 'shade' | 'soil' | 'irrigation' | 'variety' | 'density' | 'sowing' | 'pest' | 'mulch' | 'custom'
export interface TrialPlot {
  id: string
  code: string
  label: string
  treatment: string
  value: number
  unit: string
  color: number
  growth: number
}

const props = defineProps<{
  plots: TrialPlot[]
  kind: TrialKind
  selectedPlotId: string
  showDrone: boolean
  droneMode: 'scouting' | 'application'
}>()
const emit = defineEmits<{ select: [plotId: string]; ready: [] }>()
const host = ref<HTMLElement | null>(null)

let scene: THREE.Scene | undefined
let camera: THREE.PerspectiveCamera | undefined
let renderer: THREE.WebGLRenderer | undefined
let controls: OrbitControls | undefined
let resizeObserver: ResizeObserver | undefined
let animationFrame = 0
let raycaster: THREE.Raycaster | undefined
let pointer: THREE.Vector2 | undefined
let drone: THREE.Group | undefined
let flightTime = 0
const plotMeshes: THREE.Mesh[] = []

function initialize() {
  const element = host.value
  if (!element) return
  dispose()

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xc9d5d4)
  const columns = Math.max(2, Math.ceil(Math.sqrt(props.plots.length * 1.35)))
  const rows = Math.max(1, Math.ceil(props.plots.length / columns))
  const fieldWidth = columns * 13
  const fieldDepth = rows * 19
  const cameraDistance = Math.max(42, Math.max(fieldWidth, fieldDepth) * 1.15)
  scene.fog = new THREE.Fog(0xc9d5d4, cameraDistance * 1.35, cameraDistance * 2.7)
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, Math.max(180, cameraDistance * 3))
  camera.position.set(cameraDistance * 0.72, cameraDistance * 0.62, cameraDistance * 0.82)
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.outputColorSpace = THREE.SRGBColorSpace
  element.replaceChildren(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.minDistance = 20
  controls.maxDistance = Math.max(85, cameraDistance * 2.1)
  controls.maxPolarAngle = Math.PI * 0.48
  controls.target.set(0, 0, 0)
  scene.add(new THREE.HemisphereLight(0xf3f8f4, 0x5b4938, 2.4))
  const sun = new THREE.DirectionalLight(0xfff1cf, 3.1)
  sun.position.set(-28, 45, 22)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -44
  sun.shadow.camera.right = 44
  sun.shadow.camera.top = 36
  sun.shadow.camera.bottom = -36
  scene.add(sun)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(150, fieldWidth + 70), Math.max(110, fieldDepth + 70)), new THREE.MeshStandardMaterial({ color: 0x73836c, roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.22
  ground.receiveShadow = true
  scene.add(ground)

  props.plots.forEach((plot, index) => addPlot(plot, index, columns, rows))
  addLegendPosts(fieldWidth, fieldDepth)
  if (props.showDrone) addDrone()

  raycaster = new THREE.Raycaster()
  pointer = new THREE.Vector2()
  renderer.domElement.addEventListener('click', selectPlot)
  resize()
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(element)
  render()
  emit('ready')
}

function addPlot(plot: TrialPlot, index: number, columns: number, rows: number) {
  if (!scene) return
  const column = index % columns
  const row = Math.floor(index / columns)
  const x = (column - (columns - 1) / 2) * 13
  const z = (row - (rows - 1) / 2) * 19
  const selected = plot.id === props.selectedPlotId
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(10.8, selected ? 1.05 : 0.72, 15.8),
    new THREE.MeshStandardMaterial({ color: selected ? 0xcaa455 : 0x684c35, roughness: 0.95, emissive: selected ? 0x332000 : 0x000000 }),
  )
  base.position.set(x, selected ? 0.36 : 0.2, z)
  base.receiveShadow = true
  base.userData.plotId = plot.id
  plotMeshes.push(base)
  scene.add(base)

  for (let plant = 0; plant < 18; plant += 1) {
    const px = x - 4.1 + (plant % 3) * 4.1
    const pz = z - 6.2 + Math.floor(plant / 3) * 2.45
    const height = 1.3 + plot.growth * 2.1 + ((plant * 7 + index * 3) % 9) / 18
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, height, 6), new THREE.MeshStandardMaterial({ color: 0x426b35 }))
    stem.position.set(px, 0.75 + height / 2, pz)
    stem.castShadow = true
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.43, 1.25, 6), new THREE.MeshStandardMaterial({ color: plot.color, roughness: 0.76 }))
    crown.position.set(px, 0.75 + height + 0.48, pz)
    crown.castShadow = true
    scene.add(stem, crown)
  }

  if (props.kind === 'shade' && plot.value > 0) addShadeFrame(x, z, plot.value)
  if (props.kind === 'soil' && plot.value > 0) addSoilCover(x, z, plot.value)
  addPlotSign(x, z, plot.code, plot.color)
}

function addShadeFrame(x: number, z: number, intensity: number) {
  if (!scene) return
  const frame = new THREE.Group()
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x59635d })
  for (const [dx, dz] of [[-5, -7], [5, -7], [-5, 7], [5, 7]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 5.3, 8), poleMaterial)
    pole.position.set(dx, 3.2, dz)
    frame.add(pole)
  }
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(10.2, 14.2),
    new THREE.MeshStandardMaterial({ color: 0x243b31, transparent: true, opacity: 0.16 + intensity / 180, side: THREE.DoubleSide }),
  )
  net.rotation.x = -Math.PI / 2
  net.position.y = 5.8
  frame.add(net)
  frame.position.set(x, 0, z)
  scene.add(frame)
}

function addSoilCover(x: number, z: number, days: number) {
  if (!scene) return
  const cover = new THREE.Mesh(
    new THREE.PlaneGeometry(10.2, 15.2),
    new THREE.MeshPhysicalMaterial({ color: days >= 30 ? 0xdce9dc : 0xb9cfba, transparent: true, opacity: 0.42, roughness: 0.18 }),
  )
  cover.rotation.x = -Math.PI / 2
  cover.position.set(x, 0.88, z)
  scene.add(cover)
}

function addPlotSign(x: number, z: number, code: string, color: number) {
  if (!scene) return
  const group = new THREE.Group()
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2, 8), new THREE.MeshStandardMaterial({ color: 0x35433b }))
  post.position.y = 1
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.05, 0.16), new THREE.MeshStandardMaterial({ color }))
  board.position.y = 2
  group.add(post, board)
  group.position.set(x - 4.7, 0.6, z - 7.2)
  group.userData.code = code
  scene.add(group)
}

function addLegendPosts(fieldWidth: number, fieldDepth: number) {
  if (!scene) return
  const fenceMaterial = new THREE.MeshStandardMaterial({ color: 0xc4b99e, roughness: 1 })
  const postCount = Math.max(7, Math.ceil(fieldWidth / 9))
  for (let index = 0; index < postCount; index += 1) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.6, 0.22), fenceMaterial)
    post.position.set(-fieldWidth / 2 + index * (fieldWidth / (postCount - 1)), 0.8, -fieldDepth / 2 - 3)
    scene.add(post)
  }
}

function addDrone() {
  if (!scene) return
  drone = new THREE.Group()
  const dark = new THREE.MeshStandardMaterial({ color: 0x26343b, metalness: 0.45, roughness: 0.36 })
  const accent = new THREE.MeshStandardMaterial({ color: props.droneMode === 'application' ? 0xe0a13a : 0x3c8794, emissive: 0x102326 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 1.25), dark)
  drone.add(body)
  for (const [dx, dz] of [[-1.45, -1.05], [1.45, -1.05], [-1.45, 1.05], [1.45, 1.05]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), dark)
    arm.position.set(dx / 2, 0, dz / 2)
    arm.rotation.y = Math.atan2(dz, dx)
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.035, 20), accent)
    rotor.position.set(dx, 0.12, dz)
    drone.add(arm, rotor)
  }
  const payload = new THREE.Mesh(
    props.droneMode === 'application' ? new THREE.CylinderGeometry(0.48, 0.48, 0.85, 12) : new THREE.SphereGeometry(0.36, 12, 8),
    accent,
  )
  payload.position.y = -0.65
  drone.add(payload)
  drone.position.set(-20, 9, -10)
  drone.traverse((item) => { item.castShadow = true })
  scene.add(drone)
}

function selectPlot(event: MouseEvent) {
  if (!renderer || !camera || !raycaster || !pointer) return
  const bounds = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects(plotMeshes)[0]
  if (hit?.object.userData.plotId) emit('select', String(hit.object.userData.plotId))
}

function resize() {
  if (!host.value || !renderer || !camera) return
  const { clientWidth, clientHeight } = host.value
  if (!clientWidth || !clientHeight) return
  renderer.setSize(clientWidth, clientHeight, false)
  camera.aspect = clientWidth / clientHeight
  camera.updateProjectionMatrix()
}

function render() {
  if (!renderer || !scene || !camera) return
  animationFrame = requestAnimationFrame(render)
  flightTime += 0.008
  if (drone) {
    drone.position.x = Math.sin(flightTime) * 22
    drone.position.z = Math.cos(flightTime * 1.4) * 11
    drone.position.y = 9 + Math.sin(flightTime * 2) * 0.5
    drone.rotation.y = -flightTime
  }
  controls?.update()
  renderer.render(scene, camera)
}

function dispose() {
  cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  controls?.dispose()
  renderer?.domElement.removeEventListener('click', selectPlot)
  scene?.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => material.dispose())
  })
  renderer?.dispose()
  renderer?.domElement.remove()
  plotMeshes.length = 0
  scene = undefined
  camera = undefined
  renderer = undefined
  controls = undefined
  drone = undefined
}

onMounted(initialize)
watch(() => [props.kind, props.selectedPlotId, props.showDrone, props.droneMode, props.plots], initialize, { deep: true })
onBeforeUnmount(dispose)
</script>

<template><div ref="host" class="experiment-scene" aria-label="可交互的农业对照试验三维场景" /></template>

<style scoped>
.experiment-scene { position: absolute; inset: 0; touch-action: none; }
.experiment-scene :deep(canvas) { display: block; width: 100%; height: 100%; }
</style>
