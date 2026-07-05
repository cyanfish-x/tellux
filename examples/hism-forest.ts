import * as THREE from "three"
import { Tree } from "@dgreenheck/ez-tree"
import tellux, {
  createWindSwayLeavesMaterial,
  type HismArchetype,
  type HismLayer,
} from "../src"
import { arcgisWorldImageryUrl } from "./shared"
import { mountLocationReadout } from "./location-readout"

const CENTER_LONGITUDE = 103.561611
const CENTER_LATITUDE = 31.016963
const TREE_COUNT = 12000
const ROCK_COUNT = 4000
const MIN_TREE_SPACING_METERS = 6
const MIN_ROCK_SPACING_METERS = 18
const PLACEMENT_RADIUS_METERS = 3200
const EARTH_RADIUS_METERS = 6378137
const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI
const LOD_NEAR_METERS = 900
const DEFAULT_ION_TERRAIN_ASSET_ID =
  import.meta.env.VITE_CESIUM_ION_TERRAIN_ASSET_ID ?? "1"
const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""

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

type SceneState = {
  forestLayer: HismLayer
  rockLayer: HismLayer | null
  templates: PresetTemplate[]
}

const container = document.querySelector("#viewer")
const statusElement = document.querySelector<HTMLElement>("#hism-status")
const treeCountElement = document.querySelector<HTMLElement>("#hism-tree-count")
const rockCountElement = document.querySelector<HTMLElement>("#hism-rock-count")
const samplingStatusElement = document.querySelector<HTMLElement>(
  "#hism-sampling-status"
)
const flyToButton = document.querySelector<HTMLButtonElement>("#fly-to-hism-forest")
const regenerateButton = document.querySelector<HTMLButtonElement>(
  "#regenerate-hism-forest"
)
const hudFps = document.querySelector<HTMLElement>("#hism-fps")
const hudLayers = document.querySelector<HTMLElement>("#hism-layers")
const hudClusters = document.querySelector<HTMLElement>("#hism-clusters")
const hudInstances = document.querySelector<HTMLElement>("#hism-instances")
const hudVisible = document.querySelector<HTMLElement>("#hism-visible")
const hudDrawCalls = document.querySelector<HTMLElement>("#hism-drawcalls")
const hudLod = document.querySelector<HTMLElement>("#hism-lod")
const hudPick = document.querySelector<HTMLElement>("#hism-pick")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}
if (!flyToButton || !regenerateButton) {
  throw new Error("HISM controls not found.")
}

const impostorGeometry = new THREE.CylinderGeometry(1.2, 1.8, 14, 6)
impostorGeometry.translate(0, 7, 0)
const impostorMaterial = new THREE.MeshPhongMaterial({
  color: 0x4a5d3a,
  flatShading: true,
})

const rockGeometry = new THREE.DodecahedronGeometry(2.4, 0)
const rockMaterial = new THREE.MeshStandardMaterial({
  color: 0x7a7268,
  roughness: 0.92,
  metalness: 0.02,
})

const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: "/draco/gltf/",
  terrain: DEFAULT_ION_TOKEN
    ? {
        type: "cesium-ion",
        assetId: DEFAULT_ION_TERRAIN_ASSET_ID,
        apiToken: DEFAULT_ION_TOKEN,
        tileLoading: { enableTileSplitting: true },
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
  camera: { ...VIEW_POSE },
  scene: {
    atmosphere: {
      show: true,
      lighting: { mode: "light-source" },
      fallbackAmbientLight: { intensity: 0.85 },
    },
    clouds: { show: false },
    postProcess: { toneMappingExposure: 7 },
  },
})

;(window as any).viewer = viewer

const locationReadout = mountLocationReadout(viewer, {
  parent: container.parentElement ?? document.body,
})

let sceneState: SceneState | null = null
let generationToken = 0
let hudFrame = 0
let lastHudTime = performance.now()
let smoothedFps = 0

flyToButton.disabled = true
regenerateButton.disabled = true

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message
}

function setSamplingStatus(message: string) {
  if (samplingStatusElement) samplingStatusElement.textContent = message
}

function buildPresetTemplate(name: string, baseScale: number): PresetTemplate {
  const tree = new Tree()
  tree.loadPreset(name)
  const branchesMaterial = tree.branchesMesh.material
  const ezLeavesMaterial = tree.leavesMesh.material as THREE.MeshPhongMaterial
  const leavesMaterial = createWindSwayLeavesMaterial({
    map: ezLeavesMaterial.map,
    color: ezLeavesMaterial.color,
    alphaTest: ezLeavesMaterial.alphaTest,
    dithering: ezLeavesMaterial.dithering,
    rtcUniforms: viewer.hism.rtcUniforms,
  })
  ezLeavesMaterial.dispose()
  tree.leavesMesh.material = leavesMaterial
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

function buildTreeArchetypes(templates: PresetTemplate[]): HismArchetype[] {
  return templates.map((template) => ({
    name: template.name,
    lodLevels: [
      {
        maxDistanceMeters: LOD_NEAR_METERS,
        parts: [
          {
            name: "branches",
            geometry: template.branchesGeometry,
            material: template.branchesMaterial,
          },
          {
            name: "leaves",
            geometry: template.leavesGeometry,
            material: template.leavesMaterial,
          },
        ],
      },
      {
        maxDistanceMeters: Number.POSITIVE_INFINITY,
        parts: [
          {
            name: "impostor",
            geometry: impostorGeometry,
            material: impostorMaterial,
          },
        ],
      },
    ],
  }))
}

async function createScene(templates: PresetTemplate[]) {
  const token = ++generationToken
  flyToButton.disabled = true
  regenerateButton.disabled = true
  treeCountElement && (treeCountElement.textContent = "-")
  rockCountElement && (rockCountElement.textContent = "-")
  setSamplingStatus("-")
  setStatus("正在生成散布点...")

  sceneState?.forestLayer.remove()
  sceneState?.rockLayer?.remove()
  sceneState = null

  const treePlacements = generatePlacementPoints({
    count: TREE_COUNT,
    centerLongitude: CENTER_LONGITUDE,
    centerLatitude: CENTER_LATITUDE,
    radiusMeters: PLACEMENT_RADIUS_METERS,
    minSpacingMeters: MIN_TREE_SPACING_METERS,
    seed: 20260705 + token,
    presetCount: templates.length,
  })
  const rockPlacements = generatePlacementPoints({
    count: ROCK_COUNT,
    centerLongitude: CENTER_LONGITUDE,
    centerLatitude: CENTER_LATITUDE,
    radiusMeters: PLACEMENT_RADIUS_METERS * 0.85,
    minSpacingMeters: MIN_ROCK_SPACING_METERS,
    seed: 20260705 + token + 17,
    presetCount: 1,
  })

  setStatus("正在采样地表高度...")
  const [treeHeights, rockHeights] = await Promise.all([
    viewer.sampleHeightMostDetailed(
      treePlacements.map((point) => [point.longitude, point.latitude]),
      { source: "all", resolution: 160, maxFrames: 120 }
    ),
    viewer.sampleHeightMostDetailed(
      rockPlacements.map((point) => [point.longitude, point.latitude]),
      { source: "all", resolution: 120, maxFrames: 80 }
    ),
  ])

  if (token !== generationToken) return

  const treeInstances = treePlacements
    .map((placement, index) => {
      const sampled = treeHeights[index]
      if (!sampled) return null
      return {
        coordinates: [placement.longitude, placement.latitude, sampled[2]] as [
          number,
          number,
          number,
        ],
        heading: placement.heading,
        scale: placement.scale,
        archetype: placement.presetIndex,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  const rockInstances = rockPlacements
    .map((placement, index) => {
      const sampled = rockHeights[index]
      if (!sampled) return null
      return {
        coordinates: [placement.longitude, placement.latitude, sampled[2]] as [
          number,
          number,
          number,
        ],
        heading: placement.heading,
        scale: 0.7 + (placement.presetIndex % 3) * 0.25,
        archetype: 0,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  if (treeInstances.length === 0) {
    setStatus("树实例高度采样失败。")
    regenerateButton.disabled = false
    return
  }

  const forestLayer = viewer.addHismLayer({
    id: "hism-forest-trees",
    archetypes: buildTreeArchetypes(templates),
    instances: treeInstances,
    clusterCellSizeMeters: 512,
    referenceLongitude: CENTER_LONGITUDE,
    referenceLatitude: CENTER_LATITUDE,
    onUpdate: (_deltaTime, elapsedTime) => {
      for (const template of sceneState?.templates ?? templates) {
        template.tree.update(elapsedTime)
      }
    },
  })

  const rockLayer =
    rockInstances.length > 0
      ? viewer.addHismLayer({
          id: "hism-forest-rocks",
          archetypes: [
            {
              name: "rock",
              parts: [{ name: "rock", geometry: rockGeometry, material: rockMaterial }],
            },
          ],
          instances: rockInstances,
          clusterCellSizeMeters: 384,
          referenceLongitude: CENTER_LONGITUDE,
          referenceLatitude: CENTER_LATITUDE,
        })
      : null

  if (token !== generationToken) {
    forestLayer.remove()
    rockLayer?.remove()
    return
  }

  sceneState = {
    forestLayer,
    rockLayer,
    templates,
  }

  flyToButton.disabled = false
  regenerateButton.disabled = false
  treeCountElement && (treeCountElement.textContent = String(treeInstances.length))
  rockCountElement && (rockCountElement.textContent = String(rockInstances.length))
  setSamplingStatus(
    `${Math.min(...treeInstances.map((item) => item.coordinates[2])).toFixed(1)}m - ${Math.max(...treeInstances.map((item) => item.coordinates[2])).toFixed(1)}m`
  )
  setStatus(
    `HISM 场景就绪：${treeInstances.length} 棵树 + ${rockInstances.length} 块岩石。`
  )
  flyToScene()
}

function flyToScene() {
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

function updateHud() {
  hudFrame = requestAnimationFrame(updateHud)
  const now = performance.now()
  const delta = now - lastHudTime
  lastHudTime = now
  if (delta > 0) {
    const instantFps = 1000 / delta
    smoothedFps = smoothedFps === 0 ? instantFps : smoothedFps * 0.9 + instantFps * 0.1
  }

  const stats = viewer.getHismRuntimeStats()
  if (hudFps) hudFps.textContent = smoothedFps.toFixed(1)
  if (hudLayers) hudLayers.textContent = String(stats.layerCount)
  if (hudClusters) {
    hudClusters.textContent = `${stats.visibleClusters}/${stats.clusterCount}`
  }
  if (hudInstances) hudInstances.textContent = String(stats.totalInstances)
  if (hudVisible) {
    hudVisible.textContent = `${stats.visibleInstances} (${(
      (stats.visibleInstances / Math.max(stats.totalInstances, 1)) *
      100
    ).toFixed(1)}%)`
  }
  if (hudDrawCalls) hudDrawCalls.textContent = String(stats.drawCalls)
  if (hudLod) {
    hudLod.textContent = `${stats.activeLodCounts["0"] ?? 0} / ${
      stats.activeLodCounts["1"] ?? 0
    }`
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

viewer.on("click", (event) => {
  const pick = viewer.pickHism(event.position)
  if (!pick) {
    if (hudPick) hudPick.textContent = "未命中 HISM 实例"
    return
  }
  if (hudPick) {
    hudPick.textContent = `命中 ${pick.layerId} · cluster ${pick.clusterKey} · archetype ${pick.archetypeIndex} · LOD ${pick.lodIndex} · instance ${pick.instanceId}`
  }
})

flyToButton.addEventListener("click", () => {
  if (!sceneState) return
  flyToScene()
})

regenerateButton.addEventListener("click", () => {
  void createScene(
    PRESETS.map((preset) => buildPresetTemplate(preset.name, preset.baseScale))
  )
})

window.addEventListener("beforeunload", () => {
  generationToken += 1
  cancelAnimationFrame(hudFrame)
  sceneState?.forestLayer.remove()
  sceneState?.rockLayer?.remove()
  locationReadout.destroy()
  viewer.destroy()
})

updateHud()
void createScene(
  PRESETS.map((preset) => buildPresetTemplate(preset.name, preset.baseScale))
)
