import * as THREE from "three"
import { bootExampleI18n, t } from "./i18n"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import type { TilesetLayer } from "../src"
import tellux from "../src"
import { createTelluxPanel, type TelluxPanel } from "./example-panel-leva"
import { exampleMapServiceConfig } from "./shared"
import { mountLocationReadout } from "./location-readout"

bootExampleI18n()

const MIXED_TILESET_URL =
  "https://raw.githubusercontent.com/CesiumGS/3d-tiles-samples/main/1.0/TilesetWithDiscreteLOD/tileset.json"
const MIXED_CENTER_LONGITUDE = -75.61209430782448
const MIXED_CENTER_LATITUDE = 40.04253061142591
const HORSE_COUNT = 1000
const MIN_SPACING_METERS = 8
const PLACEMENT_RADIUS_METERS = 260
const HORSE_BASE_HEADING = 132
const HORSE_HEADING_JITTER = 26
const HORSE_SCALE_FACTOR = 0.08
const HORSE_MODEL_URL = "https://threejs.org/examples/models/gltf/Horse.glb"
const EARTH_RADIUS_METERS = 6378137
const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI

type PlacementPoint = {
  longitude: number
  latitude: number
  heading: number
  scale: number
  phase: number
  colorHue: number
}

type HorseHerd = {
  group: THREE.Group
  instancedMesh: THREE.InstancedMesh
  mixer: THREE.AnimationMixer
  action: THREE.AnimationAction
  animatedMesh: THREE.Mesh
  animationDuration: number
  phases: number[]
  startedAt: number
  dispose: () => void
}

const container = document.querySelector("#viewer")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

const viewer = new tellux.Viewer(container, {
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  layers: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  camera: {
    latitude: 40.03178523327751,
    longitude: -75.61915690102107,
    height: 1121.7432408693376,
    heading: 13.545497727639216,
    pitch: -25.45946281708948,
    roll: -0.000008662865451903576,
  },
  scene: {
    atmosphere: {
      lighting:{
        mode:'light-source'
      },
      show: true,
      fallbackAmbientLight: {
        intensity: 0.9
      }
    },
    clouds: {
      show: false
    },
  },
})

;(window as any).viewer = viewer

const loader = new GLTFLoader()
const locationReadout = mountLocationReadout(viewer, {
  parent: container.parentElement ?? document.body,
})

let panel: TelluxPanel | undefined
let tilesetLayer: TilesetLayer | null = null
let herd: HorseHerd | null = null
let isAnimationPlaying = true
let generationToken = 0
let animationFrame = 0

function setStatus(message: string) {
  panel?.setStatus(message)
}

function setInstanceCount(value: string) {
  if (panel) panel.controls.readout.instances = value
}

function setSamplingReadout(value: string) {
  if (panel) panel.controls.readout.sampling = value
}

function setActionsDisabled(disabled: boolean) {
  if (!panel) return
  panel.setFieldDisabled("actions.playing", disabled)
  panel.setFieldDisabled("actions.regenerate", disabled)
}

function syncAnimationFromPanel() {
  if (!panel) return
  isAnimationPlaying = panel.controls.actions.playing
}

function waitForBrowserPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0)
    })
  })
}

async function initializeMixedSamplingScene() {
  setStatus(t({ zh: "正在加载 CesiumGS Discrete LOD 3D Tiles...", en: "Loading CesiumGS Discrete LOD 3D Tiles..." }))
  tilesetLayer = viewer.load3DTileset({
    type: "url",
    id: "mixed-height-sampling-tileset",
    url: MIXED_TILESET_URL,
  })

  await waitForBrowserPaint()
  await createHorseHerd()
}

async function createHorseHerd() {
  const token = ++generationToken
  setActionsDisabled(true)
  setInstanceCount("-")
  setSamplingReadout("-")
  setStatus(t({ zh: "正在生成 3D Tiles 附近的随机点...", en: "Generating random points near 3D Tiles..." }))

  herd?.dispose()
  herd = null

  const placements = generatePlacementPoints({
    count: HORSE_COUNT,
    centerLongitude: MIXED_CENTER_LONGITUDE,
    centerLatitude: MIXED_CENTER_LATITUDE,
    radiusMeters: PLACEMENT_RADIUS_METERS,
    minSpacingMeters: MIN_SPACING_METERS,
    seed: 20260608 + token,
  })

  setStatus(t({ zh: "已生成 {n} 个候选点，正在用 source: all 采样混合高度...", en: "Generated {n} candidates; sampling mixed heights with source: all..." }, { n: placements.length }))

  let sampledPositions: Awaited<ReturnType<typeof viewer.sampleHeightMostDetailed>>
  const samplingTimerLabel = `[Tellux] mixed-height-sampling-horses sampleHeightMostDetailed source=all ${placements.length} points`
  console.time(samplingTimerLabel)
  try {
    sampledPositions = await viewer.sampleHeightMostDetailed(
      placements.map((point) => [point.longitude, point.latitude]),
      {
        source: "all",
        resolution: 160,
        maxFrames: 120,
        // debug: {
        //   label: "[Tellux] mixed-height-sampling-horses debug",
        //   batchInterval: 1,
        //   slowBatchMilliseconds: 250,
        // },
      }
    )
  } catch (error) {
    console.error("Failed to sample mixed terrain and 3D Tiles height.", error)
    setStatus(t({ zh: "混合高度采样失败，请检查 3D Tiles 和地形数据源是否可访问。", en: "Mixed height sampling failed." }))
    setActionsDisabled(false)
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
    .filter((item): item is { placement: PlacementPoint; height: number } =>
      Boolean(item)
    )

  if (sampledPlacements.length === 0) {
    setStatus(t({ zh: "混合高度没有命中，未加载奔马实例。", en: "No mixed-height hits; horses not loaded." }))
    setActionsDisabled(false)
    return
  }

  const heights = sampledPlacements.map((item) => item.height)
  const minHeight = Math.min(...heights)
  const maxHeight = Math.max(...heights)
  setSamplingReadout(`${minHeight.toFixed(2)}m - ${maxHeight.toFixed(2)}m`)
  setStatus(t({ zh: "采样命中 {n} 个点，正在加载 Three.js Horse.glb...", en: "{n} hits; loading Horse.glb..." }, { n: sampledPlacements.length }))

  try {
    herd = await buildHorseHerd(sampledPlacements)
  } catch (error) {
    console.error("Failed to load instanced horse model.", error)
    setStatus(t({ zh: "奔马模型加载失败，请检查 three.js 示例资源是否可访问。", en: "Horse model failed to load." }))
    setActionsDisabled(false)
    return
  }

  if (token !== generationToken) {
    herd.dispose()
    herd = null
    return
  }

  viewer.scene.threeScene.add(herd.group)
  setActionsDisabled(false)
  setInstanceCount(`${sampledPlacements.length} / ${HORSE_COUNT}`)
  setStatus(
    t({ zh: "已在 3D Tiles 和地形混合表面放置 {n} 匹实例化奔马。", en: "Placed {n} instanced horses on mixed 3D Tiles + terrain surface." }, { n: sampledPlacements.length })
  )
}

async function buildHorseHerd(
  sampledPlacements: { placement: PlacementPoint; height: number }[]
): Promise<HorseHerd> {
  const gltf = await loader.loadAsync(HORSE_MODEL_URL)
  const sourceMesh = findFirstMorphMesh(gltf.scene)

  if (!sourceMesh) {
    throw new Error("Horse model does not contain a morph target mesh.")
  }

  const geometry = sourceMesh.geometry.clone()
  const material = cloneMaterial(sourceMesh.material)
  const instancedMesh = new THREE.InstancedMesh(
    geometry,
    material,
    sampledPlacements.length
  )
  const group = new THREE.Group()
  const animatedMesh = sourceMesh.clone()
  const mixer = new THREE.AnimationMixer(animatedMesh)
  const clip = gltf.animations[0]

  if (!clip) {
    throw new Error("Horse model does not contain an animation clip.")
  }

  const action = mixer.clipAction(clip)
  action.play()
  const phases = sampledPlacements.map(({ placement }) => placement.phase)
  const matrix = new THREE.Matrix4()
  const scaleMatrix = new THREE.Matrix4()
  const color = new THREE.Color()

  sampledPlacements.forEach(({ placement, height }, index) => {
    viewer.cartographicToMatrix4(
      [placement.longitude, placement.latitude, height + 0.08],
      { heading: placement.heading },
      matrix
    )
    scaleMatrix.makeScale(placement.scale, placement.scale, placement.scale)
    matrix.multiply(scaleMatrix)
    instancedMesh.setMatrixAt(index, matrix)
    color.setHSL(placement.colorHue / 360, 0.46, 0.64)
    instancedMesh.setColorAt(index, color)
  })

  instancedMesh.instanceMatrix.needsUpdate = true
  if (instancedMesh.instanceColor) {
    instancedMesh.instanceColor.needsUpdate = true
  }
  updateHerdMorphTargets({
    instancedMesh,
    mixer,
    animatedMesh,
    action,
    animationDuration: clip.duration,
    phases,
    elapsedTime: 0,
  })
  instancedMesh.frustumCulled = false
  instancedMesh.castShadow = false
  instancedMesh.receiveShadow = false
  group.name = "mixed-height-sampling-instanced-horses"
  group.add(instancedMesh)

  return {
    group,
    instancedMesh,
    mixer,
    action,
    animatedMesh,
    animationDuration: clip.duration,
    phases,
    startedAt: performance.now() / 1000,
    dispose() {
      viewer.scene.threeScene.remove(group)
      mixer.stopAllAction()
      geometry.dispose()
      disposeMaterial(material)
      instancedMesh.morphTexture?.dispose()
    },
  }
}

function animateHorses() {
  animationFrame = requestAnimationFrame(animateHorses)

  if (!herd || !isAnimationPlaying) return

  const elapsedTime = performance.now() / 1000 - herd.startedAt
  updateHerdMorphTargets({
    instancedMesh: herd.instancedMesh,
    mixer: herd.mixer,
    animatedMesh: herd.animatedMesh,
    action: herd.action,
    animationDuration: herd.animationDuration,
    phases: herd.phases,
    elapsedTime,
  })
}

function updateHerdMorphTargets(options: {
  instancedMesh: THREE.InstancedMesh
  mixer: THREE.AnimationMixer
  animatedMesh: THREE.Mesh
  action: THREE.AnimationAction
  animationDuration: number
  phases: number[]
  elapsedTime: number
}) {
  for (let i = 0; i < options.phases.length; i += 1) {
    const time =
      (options.elapsedTime + options.phases[i] * options.animationDuration) %
      options.animationDuration
    options.action.play()
    options.mixer.setTime(time)
    options.instancedMesh.setMorphAt(i, options.animatedMesh)
  }

  if (options.instancedMesh.morphTexture) {
    options.instancedMesh.morphTexture.needsUpdate = true
  }
}

function generatePlacementPoints(options: {
  count: number
  centerLongitude: number
  centerLatitude: number
  radiusMeters: number
  minSpacingMeters: number
  seed: number
}) {
  const random = createSeededRandom(options.seed)
  const points: PlacementPoint[] = []
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
    points.push({
      longitude: coordinates.longitude,
      latitude: coordinates.latitude,
      heading: HORSE_BASE_HEADING + (random() - 0.5) * HORSE_HEADING_JITTER,
      scale: (0.82 + random() * 0.28) * HORSE_SCALE_FACTOR,
      phase: random(),
      colorHue: 24 + random() * 48,
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

function findFirstMorphMesh(object: THREE.Object3D) {
  let result: THREE.Mesh | null = null
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    const morphAttributes = mesh.geometry?.morphAttributes
    if (
      !result &&
      mesh.isMesh &&
      Array.isArray(mesh.morphTargetInfluences) &&
      mesh.morphTargetInfluences.length > 0 &&
      Boolean(
        morphAttributes?.position ||
          morphAttributes?.normal ||
          morphAttributes?.color
      )
    ) {
      result = mesh
    }
  })
  return result
}

function cloneMaterial(material: THREE.Material | THREE.Material[]) {
  return Array.isArray(material)
    ? material.map((item) => item.clone())
    : material.clone()
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose())
  } else {
    material.dispose()
  }
}

const mixedHorseSchema = () =>
  ({
    actions: {
      $: { label: t({ zh: "操作", en: "Actions" }) },
      playing: {
        value: true,
        label: t({ zh: "播放动画", en: "Play animation" }),
      },
      regenerate: {
        onClick: () => {
          void createHorseHerd()
        },
        label: t({ zh: "重新生成", en: "Regenerate" }),
      },
    },
    readout: {
      $: { label: t({ zh: "信息", en: "Info" }) },
      center: {
        type: "hint" as const,
        label: "Center",
        value: "-75.612094, 40.042531",
      },
      instances: {
        type: "hint" as const,
        label: "Instances",
        value: "-",
      },
      source: {
        type: "hint" as const,
        label: "Source",
        value: "all",
      },
      sampling: {
        type: "hint" as const,
        label: "Sampling",
        value: "-",
      },
    },
    status: {
      $: { label: t({ zh: "状态", en: "Status" }) },
      message: {
        type: "hint" as const,
        value: t({ zh: "正在准备混合采样场景...", en: "Preparing mixed sampling scene..." }),
      },
    },
  }) as const

function bindMixedHorsePanel(
  currentPanel: TelluxPanel<ReturnType<typeof mixedHorseSchema>>
) {
  return currentPanel.controls.effect(() => {
    void currentPanel.controls.actions.playing
    syncAnimationFromPanel()
  })
}

panel = createTelluxPanel(mixedHorseSchema, {
  id: "mixed-height-sampling-horses-panel",
  title: () =>
    t({ zh: "混合场景高度采样奔马", en: "Mixed-height sampling horses" }),
  statusPath: "status.message",
  onRebuild: bindMixedHorsePanel,
})

setActionsDisabled(true)

window.addEventListener("beforeunload", () => {
  generationToken += 1
  cancelAnimationFrame(animationFrame)
  herd?.dispose()
  tilesetLayer?.remove()
  locationReadout.destroy()
  panel?.dispose()
  viewer.destroy()
})

animateHorses()
void initializeMixedSamplingScene()
