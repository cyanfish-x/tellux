import * as THREE from "three"
import { Tree } from "@dgreenheck/ez-tree"
import tellux from "../src"
import { tiandituImageryXYZUrl } from "./shared"
import { mountLocationReadout } from "./location-readout"

const CENTER_LONGITUDE = 103.561611
const CENTER_LATITUDE = 31.016963
const TREE_COUNT = 10000
const MIN_SPACING_METERS = 6
const PLACEMENT_RADIUS_METERS = 3000
const EARTH_RADIUS_METERS = 6378137
const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI
const DEFAULT_ION_TERRAIN_ASSET_ID =
  import.meta.env.VITE_CESIUM_ION_TERRAIN_ASSET_ID ?? "1"
const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""

// 初始视角与"飞到森林"共享同一份相机姿态。
const VIEW_POSE = {
  latitude: 31.01740061257519,
  longitude: 103.55668103900562,
  height: 1188.4025046429122,
  heading: 12.641958573261494,
  pitch: -27.183678322477718,
  roll: -0.000007808919233872686,
} as const

const PRESETS = [
  { name: "oak_medium", baseScale: 1.0 },
  { name: "pine_medium", baseScale: 1.0 },
  { name: "aspen_medium", baseScale: 1.0 },
] as const

type Placement = {
  longitude: number
  latitude: number
  heading: number
  scale: number
  presetIndex: number
}

type PresetTemplate = {
  name: string
  baseScale: number
  tree: Tree
  branchesGeometry: THREE.BufferGeometry
  leavesGeometry: THREE.BufferGeometry
  branchesMaterial: THREE.Material | THREE.Material[]
  leavesMaterial: THREE.Material | THREE.Material[]
}

type Forest = {
  group: THREE.Group
  templates: PresetTemplate[]
  startedAt: number
  dispose: () => void
}

const container = document.querySelector("#viewer")
const statusElement = document.querySelector<HTMLElement>("#vegetation-status")
const countElement = document.querySelector<HTMLElement>("#vegetation-count")
const samplingStatusElement = document.querySelector<HTMLElement>(
  "#vegetation-sampling-status"
)
const flyToForestButton =
  document.querySelector<HTMLButtonElement>("#fly-to-forest")
const regenerateButton = document.querySelector<HTMLButtonElement>(
  "#regenerate-vegetation"
)

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

if (!flyToForestButton || !regenerateButton) {
  throw new Error("Vegetation controls not found.")
}

const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: "/draco/gltf/",
  terrain: DEFAULT_ION_TOKEN
    ? {
        type: "cesium-ion",
        assetId: DEFAULT_ION_TERRAIN_ASSET_ID,
        apiToken: DEFAULT_ION_TOKEN,
        tileLoading: {
          enableTileSplitting: true,
        },
      }
    : undefined,
  layers: [
    {
      source: {
        type: "xyz",
        url: tiandituImageryXYZUrl,
        levels: 18,
      },
    },
  ],
  camera: {
    latitude: VIEW_POSE.latitude,
    longitude: VIEW_POSE.longitude,
    height: VIEW_POSE.height,
    heading: VIEW_POSE.heading,
    pitch: VIEW_POSE.pitch,
    roll: VIEW_POSE.roll,
  },
  scene: {
    atmosphere: {
      show: true,
      // ez-tree 的枝/叶用的是 MeshPhongMaterial（非 PBR），post-process 模式下
      // 拿不到大气后处理光照会全黑。切到 light-source 让真实 DirectionalLight 生效。
      lighting: {
        mode: "light-source",
      },
      fallbackAmbientLight: {
        intensity: 0.85,
      },
    },
    clouds: {
      show: false,
    },
  },
})

;(window as any).viewer = viewer

// RTC + EncodedCartesian3：相机 ECEF 位置编码 + 去平移 view matrix，所有
// globe-scale 实例化 mesh 共享这一份 uniform，每帧由 animateWind 刷新。
const rtcUniforms = new tellux.RTCAutoUniforms(viewer.camera.threeCamera)

const locationReadout = mountLocationReadout(viewer, {
  parent: container.parentElement ?? document.body,
})

let forest: Forest | null = null
let generationToken = 0
let animationFrame = 0

flyToForestButton.disabled = true
regenerateButton.disabled = true

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message
}

function setSamplingStatus(message: string) {
  if (samplingStatusElement) samplingStatusElement.textContent = message
}

function waitForBrowserPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0)
    })
  })
}

async function initializeVegetationScene() {
  setStatus("正在初始化 ez-tree 预设...")
  const templates = PRESETS.map((preset) =>
    buildPresetTemplate(preset.name, preset.baseScale)
  )

  await waitForBrowserPaint()
  await createForest(templates)
}

function buildPresetTemplate(name: string, baseScale: number): PresetTemplate {
  const tree = new Tree()
  tree.loadPreset(name)
  // loadPreset 内部已调用 generate()，这里直接取生成好的几何与材质。
  // 实例之间共享同一份几何与材质；材质上挂载了 ez-tree 的风摆 shader，
  // 通过每帧调用 tree.update(elapsedTime) 推进 uTime，所有实例会同步摆动。
  // 枝/叶材质的实例化与 RTC 注入统一在 applyRTCInstancing 内处理，这里
  // 拿原始材质即可。
  const branchesMaterial = tree.branchesMesh.material
  const leavesMaterial = tree.leavesMesh.material
  return {
    name,
    baseScale,
    tree,
    branchesGeometry: tree.branchesMesh.geometry,
    leavesGeometry: tree.leavesMesh.geometry,
    branchesMaterial,
    leavesMaterial,
  }
}

async function createForest(templates: PresetTemplate[]) {
  const token = ++generationToken
  flyToForestButton.disabled = true
  regenerateButton.disabled = true
  countElement && (countElement.textContent = "-")
  setSamplingStatus("-")
  setStatus("正在生成森林散布点（泊松分布）...")

  forest?.dispose()
  forest = null

  const placements = generatePlacementPoints({
    count: TREE_COUNT,
    centerLongitude: CENTER_LONGITUDE,
    centerLatitude: CENTER_LATITUDE,
    radiusMeters: PLACEMENT_RADIUS_METERS,
    minSpacingMeters: MIN_SPACING_METERS,
    seed: 20260702 + token,
    presetCount: templates.length,
  })

  setStatus(
    `已生成 ${placements.length} 个候选点，正在通过 sampleHeightMostDetailed 采样地表高度...`
  )

  let sampledPositions: Awaited<
    ReturnType<typeof viewer.sampleHeightMostDetailed>
  >
  const samplingTimerLabel = `[Tellux] vegetation sampleHeightMostDetailed ${placements.length} points`
  console.time(samplingTimerLabel)
  try {
    sampledPositions = await viewer.sampleHeightMostDetailed(
      placements.map((point) => [point.longitude, point.latitude]),
      {
        source: "all",
        resolution: 160,
        maxFrames: 120,
      }
    )
  } catch (error) {
    console.error("Failed to sample terrain height for vegetation.", error)
    setStatus("地表高度采样失败，请检查地形数据源是否可访问。")
    regenerateButton.disabled = false
    return
  } finally {
    console.timeEnd(samplingTimerLabel)
  }

  if (token !== generationToken) return

  const sampledPlacements = placements
    .map((placement, index) => {
      const sampled = sampledPositions[index]
      return sampled ? { placement, height: sampled[2] } : null
    })
    .filter((item): item is { placement: Placement; height: number } =>
      Boolean(item)
    )

  if (sampledPlacements.length === 0) {
    setStatus("地表高度未命中，未加载植被。")
    regenerateButton.disabled = false
    return
  }

  const heights = sampledPlacements.map((item) => item.height)
  const minHeight = Math.min(...heights)
  const maxHeight = Math.max(...heights)
  setSamplingStatus(`${minHeight.toFixed(2)}m - ${maxHeight.toFixed(2)}m`)

  forest = buildInstancedForest(templates, sampledPlacements)
  if (token !== generationToken) {
    forest.dispose()
    forest = null
    return
  }

  viewer.scene.threeScene.add(forest.group)
  flyToForestButton.disabled = false
  regenerateButton.disabled = false
  countElement &&
    (countElement.textContent = `${sampledPlacements.length} / ${TREE_COUNT}`)
  setStatus(
    `已在 (${CENTER_LONGITUDE.toFixed(6)}, ${CENTER_LATITUDE.toFixed(
      6
    )}) 周边 ${PLACEMENT_RADIUS_METERS}m 范围内放置 ${
      sampledPlacements.length
    } 棵程序化植被。`
  )

  flyToForestView()
}

function flyToForestView() {
  viewer.camera.flyTo({
    destination: {
      latitude: VIEW_POSE.latitude,
      longitude: VIEW_POSE.longitude,
      height: VIEW_POSE.height,
    },
    orientation: {
      heading: VIEW_POSE.heading,
      pitch: VIEW_POSE.pitch,
      roll: VIEW_POSE.roll,
    },
  })
}

function buildInstancedForest(
  templates: PresetTemplate[],
  sampledPlacements: { placement: Placement; height: number }[]
): Forest {
  const group = new THREE.Group()
  group.name = "vegetation-forest"

  // 先按 preset 分桶，每个 preset 一对 InstancedMesh（树枝 + 树叶）。
  const buckets = templates.map(
    () => [] as { placement: Placement; height: number }[]
  )
  for (const item of sampledPlacements) {
    buckets[item.placement.presetIndex].push(item)
  }

  const matrix = new THREE.Matrix4()
  const scaleMatrix = new THREE.Matrix4()
  const rtcHandles: Array<() => void> = []

  for (let presetIndex = 0; presetIndex < templates.length; presetIndex += 1) {
    const template = templates[presetIndex]
    const bucket = buckets[presetIndex]
    if (bucket.length === 0) continue

    const branchesMesh = new THREE.InstancedMesh(
      template.branchesGeometry,
      template.branchesMaterial,
      bucket.length
    )
    const leavesMesh = new THREE.InstancedMesh(
      template.leavesGeometry,
      template.leavesMaterial,
      bucket.length
    )

    branchesMesh.castShadow = false
    branchesMesh.receiveShadow = false
    leavesMesh.castShadow = false
    leavesMesh.receiveShadow = false
    branchesMesh.frustumCulled = false
    leavesMesh.frustumCulled = false

    // 接入 RTC：往 geometry 上加 positionHigh/Low 实例属性，给材质注入 RTE
    // shader 与每帧相机 uniform。
    rtcHandles.push(
      tellux.applyRTCInstancing(branchesMesh, rtcUniforms).dispose
    )
    rtcHandles.push(tellux.applyRTCInstancing(leavesMesh, rtcUniforms).dispose)

    bucket.forEach(({ placement, height }, index) => {
      viewer.cartographicToMatrix4(
        [placement.longitude, placement.latitude, height],
        { heading: placement.heading },
        matrix
      )
      // ez-tree 的本地坐标 +Y 朝上，与 cartographicToMatrix4 的 +Y 朝上一致，
      // 直接叠加均匀缩放即可。绕本地 Y 轴的随机朝向已由 heading 选项处理。
      scaleMatrix.makeScale(placement.scale, placement.scale, placement.scale)
      matrix.multiply(scaleMatrix)
      // matrix 的平移列（ECEF 绝对坐标）由 setRTCMatrixAt 编码到
      // positionHigh/Low；instanceMatrix 平移列随后被清零，仅承载旋转+缩放。
      tellux.setRTCMatrixAt(branchesMesh, index, matrix)
      tellux.setRTCMatrixAt(leavesMesh, index, matrix)
    })

    group.add(branchesMesh)
    group.add(leavesMesh)
  }

  return {
    group,
    templates,
    startedAt: performance.now() / 1000,
    dispose() {
      viewer.scene.threeScene.remove(group)
      // 几何与材质由 template.tree 持有，这里只释放实例化网格本身的 GPU 资源。
      group.traverse((child) => {
        const mesh = child as THREE.InstancedMesh
        if (mesh.isInstancedMesh) {
          mesh.dispose()
        }
      })
      // 撤销 RTC 注入的实例属性（geometry 由 template 持有，会被下一个 preset 复用）。
      rtcHandles.forEach((dispose) => dispose())
    },
  }
}

function generatePlacementPoints(options: {
  count: number
  centerLongitude: number
  centerLatitude: number
  radiusMeters: number
  minSpacingMeters: number
  seed: number
  presetCount: number
}) {
  const random = createSeededRandom(options.seed)
  const points: Placement[] = []
  const minSpacingSquared = options.minSpacingMeters * options.minSpacingMeters
  const maxAttempts = options.count * 220

  for (
    let attempt = 0;
    attempt < maxAttempts && points.length < options.count;
    attempt += 1
  ) {
    const radius = Math.sqrt(random()) * options.radiusMeters
    const angle = random() * Math.PI * 2
    const east = Math.cos(angle) * radius
    const north = Math.sin(angle) * radius

    if (
      points.some((point) => {
        const offset = cartographicOffsetMeters(
          options.centerLongitude,
          options.centerLatitude,
          point.longitude,
          point.latitude
        )
        const dx = offset.east - east
        const dy = offset.north - north
        return dx * dx + dy * dy < minSpacingSquared
      })
    ) {
      continue
    }

    const coordinates = offsetToCartographic(
      options.centerLongitude,
      options.centerLatitude,
      east,
      north
    )
    const presetIndex = Math.floor(random() * options.presetCount)
    points.push({
      longitude: coordinates.longitude,
      latitude: coordinates.latitude,
      heading: random() * 360,
      scale: (0.78 + random() * 0.5) * (PRESETS[presetIndex]?.baseScale ?? 1),
      presetIndex,
    })
  }

  return points
}

function offsetToCartographic(
  centerLongitude: number,
  centerLatitude: number,
  eastMeters: number,
  northMeters: number
) {
  const latitude =
    centerLatitude + (northMeters / EARTH_RADIUS_METERS) * RAD2DEG
  const longitude =
    centerLongitude +
    (eastMeters / (EARTH_RADIUS_METERS * Math.cos(centerLatitude * DEG2RAD))) *
      RAD2DEG

  return { longitude, latitude }
}

function cartographicOffsetMeters(
  centerLongitude: number,
  centerLatitude: number,
  longitude: number,
  latitude: number
) {
  return {
    east:
      (longitude - centerLongitude) *
      DEG2RAD *
      EARTH_RADIUS_METERS *
      Math.cos(centerLatitude * DEG2RAD),
    north: (latitude - centerLatitude) * DEG2RAD * EARTH_RADIUS_METERS,
  }
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function animateWind() {
  animationFrame = requestAnimationFrame(animateWind)

  if (!forest) return

  const elapsedTime = performance.now() / 1000 - forest.startedAt
  // 每帧推进 uTime，让 ez-tree 叶片 shader 风摆动起来。
  // 共享材质意味着同一 preset 的所有实例同步摆动。
  // RTC 相机 uniform 由每个 mesh 的 onBeforeRender 自带刷新，这里不再重复。
  for (const template of forest.templates) {
    template.tree.update(elapsedTime)
  }
}

flyToForestButton.addEventListener("click", () => {
  if (!forest) return
  flyToForestView()
})

regenerateButton.addEventListener("click", () => {
  void createForest(
    PRESETS.map((preset) => buildPresetTemplate(preset.name, preset.baseScale))
  )
})

window.addEventListener("beforeunload", () => {
  generationToken += 1
  cancelAnimationFrame(animationFrame)
  forest?.dispose()
  locationReadout.destroy()
  viewer.destroy()
})

animateWind()
void initializeVegetationScene()
