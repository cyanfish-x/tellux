import * as THREE from "three"
import { bootExampleI18n, t } from "../i18n"
import tellux, { type HismLayer } from "../../src"
import { setupExamplePanels } from "../example-panel"
import { mountLocationReadout } from "../location-readout"
import {
  HISM_DEMO_CENTER,
  HISM_DEMO_VIEW_POSE,
  HISM_TREE_PRESETS,
  buildHismTreeTemplate,
  buildLodTreeArchetypes,
  createHismDemoViewerOptions,
  generatePoissonPlacements,
  type HismDemoPresetTemplate,
} from "./shared"

bootExampleI18n()
setupExamplePanels()

const TREE_COUNT = 12000
const ROCK_COUNT = 4000
const MIN_TREE_SPACING_METERS = 6
const MIN_ROCK_SPACING_METERS = 18
const PLACEMENT_RADIUS_METERS = 3200
const LOD_NEAR_METERS = 900

type SceneState = {
  forestLayer: HismLayer
  rockLayer: HismLayer | null
  templates: HismDemoPresetTemplate[]
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

const baseViewerOptions = createHismDemoViewerOptions()
const viewer = new tellux.Viewer(container, {
  ...baseViewerOptions,
  hism: { showPickMarker: false },
  scene: {
    ...baseViewerOptions.scene,
    highlight: {
      outline: {
        enabled: true,
        color: "#7cff5b",
        edgeStrength: 2,
        xray: true,
      },
    },
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

function createTemplates() {
  return HISM_TREE_PRESETS.map((preset) =>
    buildHismTreeTemplate(preset.name, preset.baseScale, viewer.hism.rtcUniforms)
  )
}

async function createScene(templates: HismDemoPresetTemplate[]) {
  const token = ++generationToken
  flyToButton.disabled = true
  regenerateButton.disabled = true
  if (treeCountElement) treeCountElement.textContent = "-"
  if (rockCountElement) rockCountElement.textContent = "-"
  setSamplingStatus("-")
  setStatus(t({ zh: "正在生成散布点...", en: "Generating placements..." }))

  sceneState?.forestLayer.remove()
  sceneState?.rockLayer?.remove()
  sceneState = null

  const treePlacements = generatePoissonPlacements({
    count: TREE_COUNT,
    centerLongitude: HISM_DEMO_CENTER.longitude,
    centerLatitude: HISM_DEMO_CENTER.latitude,
    radiusMeters: PLACEMENT_RADIUS_METERS,
    minSpacingMeters: MIN_TREE_SPACING_METERS,
    seed: 20260705 + token,
    presetCount: templates.length,
    presetScales: templates.map((template) => template.baseScale),
  })
  const rockPlacements = generatePoissonPlacements({
    count: ROCK_COUNT,
    centerLongitude: HISM_DEMO_CENTER.longitude,
    centerLatitude: HISM_DEMO_CENTER.latitude,
    radiusMeters: PLACEMENT_RADIUS_METERS * 0.85,
    minSpacingMeters: MIN_ROCK_SPACING_METERS,
    seed: 20260705 + token + 17,
    presetCount: 1,
  })

  setStatus(t({ zh: "正在采样地表高度...", en: "Sampling surface heights..." }))
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
    setStatus(t({ zh: "树实例高度采样失败。", en: "Tree instance height sampling failed." }))
    regenerateButton.disabled = false
    return
  }

  const forestLayer = viewer.addHismLayer({
    id: "hism-forest-trees",
    archetypes: buildLodTreeArchetypes(templates, {
      nearDistanceMeters: LOD_NEAR_METERS,
      impostorGeometry,
      impostorMaterial,
    }),
    instances: treeInstances,
    clusterCellSizeMeters: 512,
    referenceLongitude: HISM_DEMO_CENTER.longitude,
    referenceLatitude: HISM_DEMO_CENTER.latitude,
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
          referenceLongitude: HISM_DEMO_CENTER.longitude,
          referenceLatitude: HISM_DEMO_CENTER.latitude,
        })
      : null

  if (token !== generationToken) {
    forestLayer.remove()
    rockLayer?.remove()
    return
  }

  sceneState = { forestLayer, rockLayer, templates }
  flyToButton.disabled = false
  regenerateButton.disabled = false
  if (treeCountElement) treeCountElement.textContent = String(treeInstances.length)
  if (rockCountElement) rockCountElement.textContent = String(rockInstances.length)
  setSamplingStatus(
    `${Math.min(...treeInstances.map((item) => item.coordinates[2])).toFixed(1)}m - ${Math.max(...treeInstances.map((item) => item.coordinates[2])).toFixed(1)}m`
  )
  setStatus(
    t({ zh: "HISM 场景就绪：{trees} 棵树 + {rocks} 块岩石。", en: "HISM ready: {trees} trees + {rocks} rocks." }, {
      trees: treeInstances.length,
      rocks: rockInstances.length,
    })
  )
  flyToScene()
}

function flyToScene() {
  viewer.camera.flyTo({
    destination: {
      latitude: HISM_DEMO_VIEW_POSE.latitude,
      longitude: HISM_DEMO_VIEW_POSE.longitude,
      height: HISM_DEMO_VIEW_POSE.height,
    },
    orientation: {
      heading: HISM_DEMO_VIEW_POSE.heading,
      pitch: HISM_DEMO_VIEW_POSE.pitch,
      roll: HISM_DEMO_VIEW_POSE.roll,
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

viewer.on("click", (event) => {
  const pick = viewer.pick(event.position, { layers: ["hismInstance"] })
  if (!pick || pick.type !== "hismInstance") {
    viewer.highlight.clear()
    if (hudPick) hudPick.textContent = t({ zh: "未命中 HISM 实例", en: "No HISM instance hit" })
    return
  }
  viewer.highlight.set(pick)
  const { instance } = pick
  if (hudPick) {
    hudPick.textContent = t({ zh: "命中 {layerId} · cluster {clusterKey} · archetype {archetypeIndex} · LOD {lodIndex} · instance {instanceId}", en: "Hit {layerId} · cluster {clusterKey} · archetype {archetypeIndex} · LOD {lodIndex} · instance {instanceId}" }, {
      layerId: instance.layerId,
      clusterKey: instance.clusterKey,
      archetypeIndex: instance.archetypeIndex,
      lodIndex: instance.lodIndex,
      instanceId: instance.instanceId,
    })
  }
})

flyToButton.addEventListener("click", () => {
  if (!sceneState) return
  flyToScene()
})

regenerateButton.addEventListener("click", () => {
  viewer.highlight.clear()
  void createScene(createTemplates())
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
void createScene(createTemplates())
