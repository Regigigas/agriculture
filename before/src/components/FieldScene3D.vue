<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Field } from '@/types'

type CameraView = 'overview' | 'north' | 'east' | 'close'

const props = defineProps<{ field: Field }>()
const emit = defineEmits<{ ready: [] }>()
const host = ref<HTMLElement | null>(null)

let scene: THREE.Scene | undefined
let camera: THREE.PerspectiveCamera | undefined
let renderer: THREE.WebGLRenderer | undefined
let controls: OrbitControls | undefined
let resizeObserver: ResizeObserver | undefined
let animationFrame = 0
let cameraDestination: THREE.Vector3 | undefined
let targetDestination: THREE.Vector3 | undefined

const cameraViews: Record<CameraView, { position: THREE.Vector3; target: THREE.Vector3 }> = {
  overview: { position: new THREE.Vector3(38, 34, 42), target: new THREE.Vector3(0, 0, 0) },
  north: { position: new THREE.Vector3(0, 22, 46), target: new THREE.Vector3(0, 1, 0) },
  east: { position: new THREE.Vector3(48, 19, 2), target: new THREE.Vector3(0, 1, 0) },
  close: { position: new THREE.Vector3(24, 10, 25), target: new THREE.Vector3(-3, 1.5, 0) },
}

function cropColor(field: Field) {
  if (field.status === 'attention') return 0xc8943c
  const crop = field.crop.toLowerCase()
  if (crop.includes('麦')) return 0xd5b455
  if (crop.includes('玉米')) return 0x5f8b3d
  if (crop.includes('稻')) return 0x6e9c4b
  return 0x568346
}

function initialize() {
  const element = host.value
  if (!element) return
  dispose()

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xb9c8ce)
  scene.fog = new THREE.Fog(0xb9c8ce, 70, 125)

  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 180)
  camera.position.copy(cameraViews.overview.position)

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  element.replaceChildren(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.07
  controls.minDistance = 13
  controls.maxDistance = 85
  controls.maxPolarAngle = Math.PI * 0.48
  controls.target.set(0, 0, 0)
  controls.addEventListener('start', stopCameraTransition)

  scene.add(new THREE.HemisphereLight(0xe7f0f2, 0x574839, 2.2))
  const sun = new THREE.DirectionalLight(0xfff1cf, 3.2)
  sun.position.set(-28, 42, 24)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -45
  sun.shadow.camera.right = 45
  sun.shadow.camera.top = 38
  sun.shadow.camera.bottom = -38
  scene.add(sun)

  const world = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 120),
    new THREE.MeshStandardMaterial({ color: 0x78866d, roughness: 1 }),
  )
  world.rotation.x = -Math.PI / 2
  world.position.y = -0.18
  world.receiveShadow = true
  scene.add(world)

  const areaRatio = Math.max(0.72, Math.min(1.28, Math.sqrt(Number(props.field.area || 1) / 12)))
  const width = 42 * areaRatio
  const depth = 27 / areaRatio
  const fieldBase = new THREE.Mesh(
    new THREE.BoxGeometry(width + 2.5, 0.8, depth + 2.5),
    new THREE.MeshStandardMaterial({ color: 0x6f523a, roughness: 0.96 }),
  )
  fieldBase.position.y = 0.25
  fieldBase.receiveShadow = true
  scene.add(fieldBase)

  const rowCount = 10
  const plantsPerRow = 16
  const ridgeGeometry = new THREE.BoxGeometry(width / rowCount * 0.58, 0.32, depth - 2.8)
  const ridgeMaterial = new THREE.MeshStandardMaterial({ color: props.field.soilMoisture < 35 ? 0x886344 : 0x594735, roughness: 1 })
  const stemGeometry = new THREE.CylinderGeometry(0.065, 0.09, 1.45, 6)
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x426c36, roughness: 0.8 })
  const crownGeometry = new THREE.ConeGeometry(0.36, 1.2, 6)
  const crownMaterial = new THREE.MeshStandardMaterial({ color: cropColor(props.field), roughness: 0.76 })
  const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, rowCount * plantsPerRow)
  const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, rowCount * plantsPerRow)
  stems.castShadow = true
  crowns.castShadow = true
  const transform = new THREE.Object3D()
  let plantIndex = 0

  for (let row = 0; row < rowCount; row += 1) {
    const x = -width / 2 + (row + 0.5) * (width / rowCount)
    const ridge = new THREE.Mesh(ridgeGeometry, ridgeMaterial)
    ridge.position.set(x, 0.78, 0)
    ridge.castShadow = true
    ridge.receiveShadow = true
    scene.add(ridge)
    if (props.field.status === 'fallow') continue

    for (let plant = 0; plant < plantsPerRow; plant += 1) {
      const z = -depth / 2 + 1.7 + plant * ((depth - 3.4) / (plantsPerRow - 1))
      const variation = 0.84 + ((row * 17 + plant * 11) % 13) / 50
      transform.position.set(x, 1.55 * variation, z)
      transform.scale.set(variation, variation, variation)
      transform.rotation.y = ((row + plant) % 7) * 0.17
      transform.updateMatrix()
      stems.setMatrixAt(plantIndex, transform.matrix)
      transform.position.y = 2.68 * variation
      transform.updateMatrix()
      crowns.setMatrixAt(plantIndex, transform.matrix)
      plantIndex += 1
    }
  }
  stems.count = plantIndex
  crowns.count = plantIndex
  stems.instanceMatrix.needsUpdate = true
  crowns.instanceMatrix.needsUpdate = true
  scene.add(stems, crowns)

  const water = new THREE.Mesh(
    new THREE.BoxGeometry(width + 8, 0.28, 2.2),
    new THREE.MeshPhysicalMaterial({ color: 0x4f8796, roughness: 0.24, metalness: 0.05, transparent: true, opacity: 0.82 }),
  )
  water.position.set(0, 0.25, -depth / 2 - 3.2)
  scene.add(water)

  const road = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 0.18, depth + 12),
    new THREE.MeshStandardMaterial({ color: 0xa7a08b, roughness: 1 }),
  )
  road.position.set(width / 2 + 4.2, 0.06, 0)
  road.receiveShadow = true
  scene.add(road)

  addFieldMarkers(scene, width, depth)
  resize()
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(element)
  render()
  emit('ready')
}

function addFieldMarkers(target: THREE.Scene, width: number, depth: number) {
  const postGeometry = new THREE.CylinderGeometry(0.12, 0.16, 2.2, 8)
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x374a3e })
  for (const [x, z] of [[-width / 2 - 1.5, -depth / 2 - 1.5], [width / 2 + 1.5, -depth / 2 - 1.5], [-width / 2 - 1.5, depth / 2 + 1.5], [width / 2 + 1.5, depth / 2 + 1.5]]) {
    const post = new THREE.Mesh(postGeometry, postMaterial)
    post.position.set(x, 1.1, z)
    post.castShadow = true
    target.add(post)
  }
  const moistureHeight = 2 + Math.max(0, Math.min(100, props.field.soilMoisture)) / 16
  const moisture = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.48, moistureHeight, 12),
    new THREE.MeshStandardMaterial({ color: props.field.soilMoisture < 35 ? 0xc37a3d : 0x4e8790 }),
  )
  moisture.position.set(-width / 2 - 3.5, moistureHeight / 2, depth / 2 - 2)
  moisture.castShadow = true
  target.add(moisture)
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
  if (cameraDestination && targetDestination && controls) {
    camera.position.lerp(cameraDestination, 0.085)
    controls.target.lerp(targetDestination, 0.085)
    if (camera.position.distanceTo(cameraDestination) < 0.04 && controls.target.distanceTo(targetDestination) < 0.04) {
      camera.position.copy(cameraDestination)
      controls.target.copy(targetDestination)
      stopCameraTransition()
    }
  }
  controls?.update()
  renderer.render(scene, camera)
}

function setView(view: CameraView) {
  if (!camera || !controls) return
  cameraDestination = cameraViews[view].position.clone()
  targetDestination = cameraViews[view].target.clone()
}

function stopCameraTransition() {
  cameraDestination = undefined
  targetDestination = undefined
}

function dispose() {
  cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  controls?.removeEventListener('start', stopCameraTransition)
  controls?.dispose()
  scene?.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => material.dispose())
  })
  renderer?.dispose()
  renderer?.domElement.remove()
  scene = undefined
  camera = undefined
  renderer = undefined
  controls = undefined
}

onMounted(initialize)
watch(() => props.field, initialize, { deep: true })
onBeforeUnmount(dispose)
defineExpose({ setView })
</script>

<template><div ref="host" class="field-scene" aria-label="可拖拽的三维地块场景" /></template>

<style scoped>
.field-scene { position: absolute; inset: 0; touch-action: none; }
.field-scene :deep(canvas) { display: block; width: 100%; height: 100%; }
</style>
