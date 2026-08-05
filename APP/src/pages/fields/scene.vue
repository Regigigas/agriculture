<template>
  <view class="scene-page">
    <view class="field-heading">
      <view class="field-identity">
        <text class="field-name">{{ selectedField?.name || '地块场景' }}</text>
        <text class="field-meta">{{ cropName }} · {{ areaText }}</text>
      </view>
      <text class="status-badge" :class="statusClass">{{ statusText }}</text>
    </view>

    <view class="camera-toolbar">
      <button
        v-for="view in cameraViews"
        :key="view.key"
        class="camera-button"
        :class="{ active: activeCamera === view.key }"
        @click="setCamera(view.key)"
      >{{ view.label }}</button>
    </view>

    <view
      id="field-three-scene"
      class="scene-host"
      :scene-data="sceneData"
      :change:scene-data="fieldScene.onSceneData"
      :camera-command="cameraCommand"
      :change:camera-command="fieldScene.onCameraCommand"
    >
      <view v-if="loading" class="scene-loading">正在读取地块...</view>
    </view>

    <view v-if="renderError" class="render-message">{{ renderError }}</view>
    <view v-else class="gesture-note">单指或鼠标拖拽旋转，双指或滚轮缩放</view>

    <view class="field-facts">
      <view class="fact-item"><text class="fact-label">位置</text><text class="fact-value">{{ locationText }}</text></view>
      <view class="fact-item"><text class="fact-label">生长阶段</text><text class="fact-value">{{ growthText }}</text></view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { onLoad, onReady, onUnload } from '@dcloudio/uni-app'
import { useFarmStore } from '../../store/farm'
// #ifdef H5
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
// #endif

const farmStore = useFarmStore()
const requestedId = ref('')
const loading = ref(false)
const renderError = ref('')
const activeCamera = ref('overview')
const cameraSequence = ref(0)
const cameraViews = [
  { key: 'overview', label: '俯瞰' },
  { key: 'north', label: '北侧' },
  { key: 'east', label: '东侧' },
  { key: 'close', label: '近景' }
]

const selectedField = computed(() => {
  return farmStore.fields.find((field) => String(field.id) === requestedId.value) || farmStore.fields[0] || null
})
const cropName = computed(() => selectedField.value?.crop || selectedField.value?.cropName || selectedField.value?.crop_name || '未种植')
const areaText = computed(() => `${selectedField.value?.area ?? '--'} ${selectedField.value?.areaUnit || selectedField.value?.area_unit || '亩'}`)
const locationText = computed(() => selectedField.value?.location || selectedField.value?.zone || '位置未标注')
const growthText = computed(() => selectedField.value?.growthStage || selectedField.value?.growth_stage || '生长期')
const statusText = computed(() => ({ normal: '正常', healthy: '长势良好', attention: '需关注', warning: '需关注', abnormal: '异常', idle: '休耕', fallow: '休耕' })[selectedField.value?.status] || selectedField.value?.status || '正常')
const statusClass = computed(() => ['attention', 'warning', 'abnormal'].includes(selectedField.value?.status) ? 'is-amber' : ['idle', 'fallow'].includes(selectedField.value?.status) ? 'is-gray' : 'is-green')
const sceneData = computed(() => {
  const field = selectedField.value
  if (!field) return null
  return {
    id: String(field.id || ''),
    name: field.name || '地块',
    crop: cropName.value,
    area: Number(field.area) || 1,
    status: field.status || 'normal'
  }
})
const cameraCommand = computed(() => ({ mode: activeCamera.value, sequence: cameraSequence.value }))

// #ifdef H5
let h5Scene
let h5Camera
let h5Renderer
let h5Controls
let h5Content
let h5Frame = 0
let h5ResizeObserver
let h5PlotSize = { width: 14, depth: 10 }

onReady(() => initializeH5Scene())
onUnload(disposeH5Scene)
watch(sceneData, (data) => rebuildH5Scene(data), { deep: true })

function initializeH5Scene() {
  const host = document.getElementById('field-three-scene')
  if (!host || h5Renderer) return
  try {
    h5Renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  } catch {
    onRenderError('当前浏览器不支持 WebGL，无法显示三维地块')
    return
  }
  h5Renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  h5Renderer.setClearColor(0xc8d5c8, 1)
  h5Renderer.outputColorSpace = THREE.SRGBColorSpace
  h5Renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none'
  host.appendChild(h5Renderer.domElement)

  h5Scene = new THREE.Scene()
  h5Scene.fog = new THREE.Fog(0xc8d5c8, 26, 58)
  h5Camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100)
  h5Controls = new OrbitControls(h5Camera, h5Renderer.domElement)
  h5Controls.enableDamping = true
  h5Controls.dampingFactor = 0.08
  h5Controls.minDistance = 5
  h5Controls.maxDistance = 42
  h5Controls.maxPolarAngle = Math.PI * 0.48
  h5Scene.add(new THREE.HemisphereLight(0xf4f8ee, 0x68705e, 2.1))
  const sun = new THREE.DirectionalLight(0xfff1d0, 2.4)
  sun.position.set(-8, 14, 9)
  h5Scene.add(sun)
  h5Content = new THREE.Group()
  h5Scene.add(h5Content)

  h5ResizeObserver = new ResizeObserver(resizeH5Scene)
  h5ResizeObserver.observe(host)
  resizeH5Scene()
  rebuildH5Scene(sceneData.value)
  animateH5Scene()
}

function rebuildH5Scene(data) {
  if (!h5Content || !data) return
  clearH5Group(h5Content)
  const seed = Array.from(String(data.id || data.name)).reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const width = THREE.MathUtils.clamp(10 + Math.sqrt(Math.max(1, Number(data.area) || 1)) * 0.75, 11, 18)
  const depth = width * (0.68 + (seed % 25) / 100)
  h5PlotSize = { width, depth }

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(width + 4, 0.45, depth + 4),
    new THREE.MeshStandardMaterial({ color: 0x7f9871, roughness: 1 })
  )
  ground.position.y = -0.34
  h5Content.add(ground)
  const soil = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.22, depth),
    new THREE.MeshStandardMaterial({ color: ['fallow', 'idle'].includes(data.status) ? 0x826b52 : 0x69503a, roughness: 1 })
  )
  soil.position.y = -0.08
  h5Content.add(soil)

  const ridgeGeometry = new THREE.BoxGeometry(width * 0.9, 0.13, 0.18)
  const ridgeMaterial = new THREE.MeshStandardMaterial({ color: 0x95704f, roughness: 1 })
  for (let row = 0; row < 8; row += 1) {
    const ridge = new THREE.Mesh(ridgeGeometry, ridgeMaterial)
    ridge.position.set(0, 0.08, -depth * 0.4 + row * depth * 0.8 / 7)
    h5Content.add(ridge)
  }

  if (!['fallow', 'idle'].includes(data.status)) {
    const color = /麦|稻|玉米/.test(String(data.crop)) ? 0xa4b94f : /菜|豆/.test(String(data.crop)) ? 0x4f964d : 0x6ea453
    const plants = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.12, 0.65, 5),
      new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
      80
    )
    const matrix = new THREE.Matrix4()
    let index = 0
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 10; column += 1) {
        const jitter = ((seed + row * 17 + column * 31) % 9 - 4) * 0.012
        matrix.makeTranslation(-width * 0.4 + column * width * 0.8 / 9 + jitter, 0.43, -depth * 0.4 + row * depth * 0.8 / 7)
        plants.setMatrixAt(index, matrix)
        index += 1
      }
    }
    plants.instanceMatrix.needsUpdate = true
    h5Content.add(plants)
  }
  const grid = new THREE.GridHelper(Math.max(width, depth) + 5, 12, 0x60705d, 0x91a28c)
  grid.position.y = -0.1
  h5Content.add(grid)
  setH5Camera('overview')
}

function setH5Camera(mode) {
  if (!h5Camera || !h5Controls) return
  const span = Math.max(h5PlotSize.width, h5PlotSize.depth)
  const positions = {
    overview: [span * 0.75, span * 0.95, span * 0.75],
    north: [0, span * 0.34, -span * 1.05],
    east: [span * 1.05, span * 0.34, 0],
    close: [span * 0.34, span * 0.22, span * 0.42]
  }
  h5Camera.position.set(...(positions[mode] || positions.overview))
  h5Controls.target.set(0, 0.15, 0)
  h5Controls.update()
}

function resizeH5Scene() {
  const host = document.getElementById('field-three-scene')
  if (!host || !h5Renderer || !h5Camera) return
  const width = Math.max(1, host.clientWidth)
  const height = Math.max(1, host.clientHeight)
  h5Renderer.setSize(width, height, false)
  h5Camera.aspect = width / height
  h5Camera.updateProjectionMatrix()
}

function animateH5Scene() {
  if (!h5Renderer) return
  h5Frame = requestAnimationFrame(animateH5Scene)
  h5Controls?.update()
  h5Renderer.render(h5Scene, h5Camera)
}

function clearH5Group(group) {
  while (group.children.length) {
    const child = group.children.pop()
    child.traverse((object) => {
      object.geometry?.dispose()
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose())
      else object.material?.dispose()
    })
  }
}

function disposeH5Scene() {
  cancelAnimationFrame(h5Frame)
  h5ResizeObserver?.disconnect()
  h5Controls?.dispose()
  if (h5Content) clearH5Group(h5Content)
  h5Renderer?.dispose()
  h5Renderer?.forceContextLoss()
  h5Renderer?.domElement.remove()
  h5Renderer = null
  h5Scene = null
  h5Camera = null
  h5Controls = null
}
// #endif

onLoad(async (options) => {
  requestedId.value = String(options?.id || '')
  if (farmStore.fields.length) return
  loading.value = true
  try {
    await farmStore.loadFields()
  } catch (error) {
    if (error.name !== 'UnauthorizedError') uni.showToast({ title: error.message || '地块加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
})

function setCamera(mode) {
  activeCamera.value = mode
  cameraSequence.value += 1
  // #ifdef H5
  setH5Camera(mode)
  // #endif
}

function onRenderError(message) {
  renderError.value = message || '当前设备无法使用三维场景'
}
</script>

<script module="fieldScene" lang="renderjs">
// #ifdef APP-PLUS
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export default {
  mounted() {
    this.initialize()
  },
  beforeUnmount() {
    this.disposeScene()
  },
  beforeDestroy() {
    this.disposeScene()
  },
  methods: {
    initialize() {
      if (this.renderer) return
      try {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
      } catch (error) {
        this.reportError('当前设备或 WebView 不支持 WebGL，无法显示三维地块')
        return
      }

      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
      this.renderer.setClearColor(0xc8d5c8, 1)
      this.renderer.shadowMap.enabled = false
      this.renderer.outputColorSpace = THREE.SRGBColorSpace
      this.renderer.domElement.className = 'three-canvas'
      this.renderer.domElement.style.width = '100%'
      this.renderer.domElement.style.height = '100%'
      this.renderer.domElement.style.display = 'block'
      this.renderer.domElement.style.touchAction = 'none'
      this.$el.appendChild(this.renderer.domElement)

      this.scene = new THREE.Scene()
      this.scene.fog = new THREE.Fog(0xc8d5c8, 26, 58)
      this.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100)
      this.controls = new OrbitControls(this.camera, this.renderer.domElement)
      this.controls.enableDamping = true
      this.controls.dampingFactor = 0.08
      this.controls.minDistance = 5
      this.controls.maxDistance = 42
      this.controls.maxPolarAngle = Math.PI * 0.48
      this.controls.target.set(0, 0, 0)

      this.scene.add(new THREE.HemisphereLight(0xf4f8ee, 0x68705e, 2.1))
      const sun = new THREE.DirectionalLight(0xfff1d0, 2.4)
      sun.position.set(-8, 14, 9)
      this.scene.add(sun)

      this.content = new THREE.Group()
      this.scene.add(this.content)
      this.onSceneData(this.sceneData)
      this.onCameraCommand(this.cameraCommand || { mode: 'overview' })

      this.onResize = () => this.resize()
      window.addEventListener('resize', this.onResize)
      if (window.ResizeObserver) {
        this.resizeObserver = new ResizeObserver(this.onResize)
        this.resizeObserver.observe(this.$el)
      }
      this.onContextLost = (event) => {
        event.preventDefault()
        this.reportError('三维上下文已丢失，请返回后重新进入该页面')
      }
      this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost, false)
      this.resize()
      this.lastFrame = 0
      this.animate(0)
    },
    onSceneData(data) {
      if (!this.content || !data) return
      this.clearGroup(this.content)

      const seed = Array.from(String(data.id || data.name)).reduce((sum, char) => sum + char.charCodeAt(0), 0)
      const area = Math.max(1, Number(data.area) || 1)
      const width = THREE.MathUtils.clamp(10 + Math.sqrt(area) * 0.75, 11, 18)
      const depth = width * (0.68 + (seed % 25) / 100)
      this.plotSize = { width, depth }

      const ground = new THREE.Mesh(
        new THREE.BoxGeometry(width + 4, 0.45, depth + 4),
        new THREE.MeshStandardMaterial({ color: 0x7f9871, roughness: 1 })
      )
      ground.position.y = -0.34
      this.content.add(ground)

      const soil = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.22, depth),
        new THREE.MeshStandardMaterial({ color: data.status === 'fallow' || data.status === 'idle' ? 0x826b52 : 0x69503a, roughness: 1 })
      )
      soil.position.y = -0.08
      this.content.add(soil)

      const rowCount = 8
      const rowGeometry = new THREE.BoxGeometry(width * 0.9, 0.13, 0.18)
      const rowMaterial = new THREE.MeshStandardMaterial({ color: 0x95704f, roughness: 1 })
      for (let row = 0; row < rowCount; row += 1) {
        const ridge = new THREE.Mesh(rowGeometry, rowMaterial)
        ridge.position.set(0, 0.08, -depth * 0.4 + row * depth * 0.8 / (rowCount - 1))
        this.content.add(ridge)
      }

      if (!['fallow', 'idle'].includes(data.status)) this.addPlants(data, width, depth, seed)
      this.addBoundary(width, depth)

      const grid = new THREE.GridHelper(Math.max(width, depth) + 5, 12, 0x60705d, 0x91a28c)
      grid.position.y = -0.1
      this.content.add(grid)
      this.onCameraCommand({ mode: 'overview' })
    },
    addPlants(data, width, depth, seed) {
      const cropText = String(data.crop || '')
      const color = /麦|稻|玉米/.test(cropText) ? 0xa4b94f : /菜|豆/.test(cropText) ? 0x4f964d : 0x6ea453
      const geometry = new THREE.ConeGeometry(0.12, 0.65, 5)
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
      const columns = 10
      const rows = 8
      const plants = new THREE.InstancedMesh(geometry, material, columns * rows)
      const matrix = new THREE.Matrix4()
      let index = 0
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const jitter = ((seed + row * 17 + column * 31) % 9 - 4) * 0.012
          matrix.makeTranslation(
            -width * 0.4 + column * width * 0.8 / (columns - 1) + jitter,
            0.43,
            -depth * 0.4 + row * depth * 0.8 / (rows - 1)
          )
          plants.setMatrixAt(index, matrix)
          index += 1
        }
      }
      plants.instanceMatrix.needsUpdate = true
      this.content.add(plants)
    },
    addBoundary(width, depth) {
      const geometry = new THREE.BoxGeometry(0.12, 0.7, 0.12)
      const material = new THREE.MeshStandardMaterial({ color: 0xc6b58c, roughness: 1 })
      const positions = []
      for (let index = 0; index <= 8; index += 1) {
        const x = -width / 2 + index * width / 8
        positions.push([x, 0.32, -depth / 2], [x, 0.32, depth / 2])
      }
      for (let index = 1; index < 6; index += 1) {
        const z = -depth / 2 + index * depth / 6
        positions.push([-width / 2, 0.32, z], [width / 2, 0.32, z])
      }
      const posts = new THREE.InstancedMesh(geometry, material, positions.length)
      const matrix = new THREE.Matrix4()
      positions.forEach((position, index) => {
        matrix.makeTranslation(position[0], position[1], position[2])
        posts.setMatrixAt(index, matrix)
      })
      this.content.add(posts)
    },
    onCameraCommand(command) {
      if (!this.camera || !this.controls) return
      const width = this.plotSize?.width || 14
      const depth = this.plotSize?.depth || 10
      const span = Math.max(width, depth)
      const positions = {
        overview: [span * 0.75, span * 0.95, span * 0.75],
        north: [0, span * 0.34, -span * 1.05],
        east: [span * 1.05, span * 0.34, 0],
        close: [span * 0.34, span * 0.22, span * 0.42]
      }
      const position = positions[command?.mode] || positions.overview
      this.camera.position.set(...position)
      this.controls.target.set(0, 0.15, 0)
      this.controls.update()
      this.render()
    },
    resize() {
      if (!this.renderer || !this.camera) return
      const width = Math.max(1, this.$el.clientWidth)
      const height = Math.max(1, this.$el.clientHeight)
      this.renderer.setSize(width, height, false)
      this.camera.aspect = width / height
      this.camera.updateProjectionMatrix()
      this.render()
    },
    animate(time) {
      if (!this.renderer) return
      this.animationFrame = requestAnimationFrame((nextTime) => this.animate(nextTime))
      if (time - this.lastFrame < 32) return
      this.lastFrame = time
      this.controls?.update()
      this.render()
    },
    render() {
      if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera)
    },
    clearGroup(group) {
      while (group.children.length) {
        const child = group.children.pop()
        child.traverse((object) => {
          object.geometry?.dispose()
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose())
          else object.material?.dispose()
        })
      }
    },
    reportError(message) {
      if (this.$ownerInstance?.callMethod) this.$ownerInstance.callMethod('onRenderError', message)
    },
    disposeScene() {
      if (!this.renderer) return
      cancelAnimationFrame(this.animationFrame)
      window.removeEventListener('resize', this.onResize)
      this.resizeObserver?.disconnect()
      this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost)
      this.controls?.dispose()
      this.clearGroup(this.content)
      this.renderer.dispose()
      this.renderer.forceContextLoss()
      this.renderer.domElement.remove()
      this.renderer = null
      this.scene = null
      this.camera = null
      this.controls = null
    }
  }
}
// #endif

// #ifndef APP-PLUS
export default {
  methods: {
    onSceneData() {},
    onCameraCommand() {}
  }
}
// #endif
</script>

<style scoped lang="scss">
.scene-page { min-height: 100vh; padding: 24rpx 24rpx calc(34rpx + env(safe-area-inset-bottom)); background: #edf1ed; }
.field-heading { display: flex; min-height: 104rpx; align-items: center; justify-content: space-between; gap: 20rpx; padding: 18rpx 8rpx; }
.field-identity { min-width: 0; }
.field-name,
.field-meta { display: block; }
.field-name { overflow: hidden; font-size: 34rpx; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.field-meta { margin-top: 8rpx; color: #68736c; font-size: 23rpx; }
.camera-toolbar { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8rpx; padding: 8rpx; border: 1rpx solid #cfd8d1; border-radius: 8rpx; background: #dfe5e0; }
.camera-button { width: 100%; height: 66rpx; margin: 0; padding: 0; border-radius: 6rpx; background: transparent; color: #526159; font-size: 23rpx; font-weight: 700; line-height: 66rpx; }
.camera-button.active { background: #ffffff; color: #1f603b; }
.scene-host { position: relative; width: 100%; height: 820rpx; min-height: 420px; max-height: 64vh; overflow: hidden; margin-top: 16rpx; border: 1rpx solid #b8c5ba; border-radius: 8rpx; background: #c8d5c8; }
.scene-loading { position: absolute; z-index: 1; top: 50%; width: 100%; color: #435348; text-align: center; transform: translateY(-50%); pointer-events: none; }
.gesture-note,
.render-message { min-height: 66rpx; padding: 18rpx 10rpx 0; color: #657169; font-size: 22rpx; text-align: center; }
.render-message { color: #9c3f39; }
.field-facts { display: grid; grid-template-columns: 1fr 1fr; gap: 1rpx; overflow: hidden; border: 1rpx solid #d5ddd6; border-radius: 8rpx; background: #d5ddd6; }
.fact-item { min-width: 0; padding: 20rpx; background: #ffffff; }
.fact-label,
.fact-value { display: block; }
.fact-label { color: #7b857f; font-size: 20rpx; }
.fact-value { overflow: hidden; margin-top: 7rpx; color: #26342b; font-size: 24rpx; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
@media (min-width: 900px) {
  .scene-page { max-width: 980px; margin: 0 auto; }
  .scene-host { height: 620px; max-height: none; }
}
</style>
