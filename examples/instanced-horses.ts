import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import tellux from "../src"
import { arcgisWorldImageryUrl, defaultTerrainUrl } from "./shared"
import { mountLocationReadout } from "./location-readout"

const ZOIGE_GRASSLAND_LONGITUDE = 102.3959
const ZOIGE_GRASSLAND_LATITUDE = 33.5314
const HORSE_COUNT = 1000
const MIN_SPACING_METERS = 34
const PLACEMENT_RADIUS_METERS = 1100
const HORSE_BASE_HEADING = 72
const HORSE_HEADING_JITTER = 10
const HORSE_SCALE_FACTOR = 0.3
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
const statusElement = document.querySelector<HTMLElement>("#horse-status")
const horseCountElement = document.querySelector<HTMLElement>("#horse-count")
const animationStatusElement = document.querySelector<HTMLElement>(
  "#horse-animation-status"
)
const flyToButton = document.querySelector<HTMLButtonElement>("#fly-to-horses")
const toggleAnimationButton =
  document.querySelector<HTMLButtonElement>("#toggle-horses")
const regenerateButton =
  document.querySelector<HTMLButtonElement>("#regenerate-horses")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

if (!flyToButton || !toggleAnimationButton || !regenerateButton) {
  throw new Error("Instanced horse controls not found.")
}

const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: "/draco/gltf/",
  terrain: defaultTerrainUrl
    ? {
        url: defaultTerrainUrl,
      }
    : undefined,
  layers: [
    {
      source: {
        type: "xyz",
        url: arcgisWorldImageryUrl,
        levels: 19,
      },
    },
  ],
  camera: {
    latitude: 33.54814875712769,
    longitude: 102.44504184115536,
    height: 4348.650119598099,
    heading: -23.80650527077907,
    pitch: -16.634341482316092,
    roll: 0.00005099704147283671,
  },
  scene: {
    clouds: false,
    skyAtmosphere: true,
    atmosphereLightingMode: "light-source",
    toneMappingExposure: 7,
    fallbackAmbientLightIntensity: 0.85,
  },
})

;(window as any).viewer = viewer

const loader = new GLTFLoader()
const locationReadout = mountLocationReadout(viewer, {
  parent: container.parentElement ?? document.body,
})

let herd: HorseHerd | null = null
let isAnimationPlaying = true
let generationToken = 0
let animationFrame = 0

flyToButton.disabled = true
toggleAnimationButton.disabled = true
regenerateButton.disabled = true

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message
}

function setAnimationStatus(message: string) {
  if (animationStatusElement) animationStatusElement.textContent = message
}

function updateAnimationButton() {
  toggleAnimationButton.textContent = isAnimationPlaying
    ? "暂停动画"
    : "播放动画"
}

async function createHorseHerd() {
  const token = ++generationToken
  flyToButton.disabled = true
  toggleAnimationButton.disabled = true
  regenerateButton.disabled = true
  horseCountElement && (horseCountElement.textContent = "-")
  setAnimationStatus("-")
  setStatus("正在生成带间距约束的若尔盖草原随机点...")

  herd?.dispose()
  herd = null

  const placements = generatePlacementPoints({
    count: HORSE_COUNT,
    centerLongitude: ZOIGE_GRASSLAND_LONGITUDE,
    centerLatitude: ZOIGE_GRASSLAND_LATITUDE,
    radiusMeters: PLACEMENT_RADIUS_METERS,
    minSpacingMeters: MIN_SPACING_METERS,
    seed: 20260607 + token,
  })

  setStatus(`已生成 ${placements.length} 个候选点，正在离屏采样地形高度...`)

  let sampledPositions: Awaited<
    ReturnType<typeof viewer.sampleHeightMostDetailed>
  >
  const samplingTimerLabel = `[Tellux] instanced-horses sampleHeightMostDetailed ${placements.length} points`
  console.time(samplingTimerLabel)
  try {
    sampledPositions = await viewer.sampleHeightMostDetailed(
      placements.map((point) => [point.longitude, point.latitude]),
      {
        source: "terrain",
        resolution: 128,
        maxFrames: 90,
      }
    )
  } catch (error) {
    console.error(
      "Failed to sample terrain height for instanced horses.",
      error
    )
    setStatus("地形高度采样失败，请检查地形数据源是否可用。")
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
    .filter((item): item is { placement: PlacementPoint; height: number } =>
      Boolean(item)
    )

  if (sampledPlacements.length === 0) {
    setStatus("地形高度没有命中，未加载奔马实例。")
    regenerateButton.disabled = false
    return
  }

  setStatus(
    `采样命中 ${sampledPlacements.length} 个点，正在加载 Three.js Horse.glb...`
  )

  try {
    herd = await buildHorseHerd(sampledPlacements)
  } catch (error) {
    console.error("Failed to load instanced horse model.", error)
    setStatus("奔马模型加载失败，请检查 three.js 示例资源是否可访问。")
    regenerateButton.disabled = false
    return
  }

  if (token !== generationToken) {
    herd.dispose()
    herd = null
    return
  }

  viewer.scene.threeScene.add(herd.group)
  flyToButton.disabled = false
  toggleAnimationButton.disabled = false
  regenerateButton.disabled = false
  horseCountElement &&
    (horseCountElement.textContent = `${sampledPlacements.length} / ${HORSE_COUNT}`)
  setAnimationStatus("Morph targets instancing")
  setStatus(
    `已在若尔盖大草原附近放置 ${sampledPlacements.length} 匹实例化奔马。`
  )
 viewer.flyToTarget(herd.group, {
    heading: 180,
    pitch: -10,
    distance: 800,
  })
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
      [placement.longitude, placement.latitude, height + 0.35],
      { heading: placement.heading },
      matrix
    )
    scaleMatrix.makeScale(placement.scale, placement.scale, placement.scale)
    matrix.multiply(scaleMatrix)
    instancedMesh.setMatrixAt(index, matrix)
    color.setHSL(placement.colorHue / 360, 0.5, 0.66)
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
  group.name = "zoige-instanced-horses"
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

  if (!herd || !isAnimationPlaying) {
    return
  }

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
  const maxAttempts = options.count * 180

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
      scale: (0.68 + random() * 0.22) * HORSE_SCALE_FACTOR,
      phase: random(),
      colorHue: random() * 360,
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

flyToButton.addEventListener("click", () => {
  if (!herd) return

  viewer.flyToTarget(herd.group, {
    heading: 180,
    pitch: -10,
    distance: 800,
  })
})

toggleAnimationButton.addEventListener("click", () => {
  isAnimationPlaying = !isAnimationPlaying
  updateAnimationButton()
  setAnimationStatus(isAnimationPlaying ? "Morph targets instancing" : "Paused")
})

regenerateButton.addEventListener("click", () => {
  void createHorseHerd()
})

window.addEventListener("beforeunload", () => {
  generationToken += 1
  cancelAnimationFrame(animationFrame)
  herd?.dispose()
  locationReadout.destroy()
  viewer.destroy()
})

updateAnimationButton()
animateHorses()
void createHorseHerd()
