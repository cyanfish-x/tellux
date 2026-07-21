import * as THREE from "three"
import { bootExampleI18n, t } from "../i18n"
import tellux, { type HismLayer } from "../../src"
import { setupExamplePanels } from "../example-panel"
import {
  HISM_DEMO_CENTER,
  HISM_DEMO_VIEW_POSE,
  HISM_TREE_PRESETS,
  buildHismTreeTemplate,
  buildLegacyTreeTemplate,
  buildSimpleTreeArchetypes,
  createHismDemoViewerOptions,
  generateFastPlacements,
  generatePoissonPlacements,
  type HismDemoPlacement,
  type HismDemoPresetTemplate,
} from "./shared"

bootExampleI18n()
setupExamplePanels()

const MAX_INSTANCE_COUNT = 10_000_000
const SAMPLING_MAX_COUNT = 5000
const POISSON_MAX_COUNT = 5000
const SINGLE_PRESET_THRESHOLD = 50_000
const YIELD_EVERY = 20_000

type RenderMode = "legacy" | "hism"
type Placement = HismDemoPlacement
type PresetTemplate = HismDemoPresetTemplate

type SampledPlacement = {
  placement: Placement
  height: number
}

type RunMetrics = {
  mode: RenderMode
  requestedCount: number
  actualCount: number
  placementMs: number
  samplingMs: number
  buildMs: number
  totalLoadMs: number
  fpsAvg: number
  drawCalls: number
  visibleInstances: number
  totalInstances: number
  visiblePercent: number
  clusterSummary: string
}

type ActiveScene =
  | {
      mode: "legacy"
      group: THREE.Group
      templates: PresetTemplate[]
      startedAt: number
      rtcHandles: Array<() => void>
      instanceCount: number
      drawCalls: number
    }
  | {
      mode: "hism"
      layer: HismLayer
      templates: PresetTemplate[]
      instanceCount: number
    }

const container = document.querySelector("#viewer")
const statusElement = document.querySelector<HTMLElement>("#compare-status")
const hintElement = document.querySelector<HTMLElement>("#compare-hint")
const countInput = document.querySelector<HTMLInputElement>("#compare-count")
const sampleTerrainCheckbox = document.querySelector<HTMLInputElement>(
  "#compare-sample-terrain"
)
const progressElement = document.querySelector<HTMLProgressElement>(
  "#compare-progress"
)
const generateButton = document.querySelector<HTMLButtonElement>("#compare-generate")
const flyToButton = document.querySelector<HTMLButtonElement>("#compare-flyto")
const clearButton = document.querySelector<HTMLButtonElement>("#compare-clear")
const summaryBody = document.querySelector<HTMLElement>("#compare-summary-body")
const liveMode = document.querySelector<HTMLElement>("#compare-live-mode")
const liveFps = document.querySelector<HTMLElement>("#compare-live-fps")
const liveInstances = document.querySelector<HTMLElement>("#compare-live-instances")
const liveVisible = document.querySelector<HTMLElement>("#compare-live-visible")
const liveDrawCalls = document.querySelector<HTMLElement>("#compare-live-drawcalls")
const liveLoad = document.querySelector<HTMLElement>("#compare-live-load")

if (
  !(container instanceof HTMLElement) ||
  !countInput ||
  !sampleTerrainCheckbox ||
  !progressElement ||
  !generateButton ||
  !flyToButton ||
  !clearButton ||
  !summaryBody
) {
  throw new Error("Compare controls not found.")
}

const viewer = new tellux.Viewer(
  container,
  createHismDemoViewerOptions({ includeTerrain: false })
)

;(window as any).viewer = viewer

const rtcUniforms = new tellux.RTCAutoUniforms(viewer.camera.threeCamera)

let templates: PresetTemplate[] = []
let activeScene: ActiveScene | null = null
let generationToken = 0
let hudFrame = 0
let lastHudTime = performance.now()
let smoothedFps = 0
let lastRunMetrics: RunMetrics | null = null
const compareHistory: Partial<Record<RenderMode, RunMetrics>> = {}

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message
}

function setProgress(value: number | null) {
  if (!progressElement) return
  if (value === null) {
    progressElement.hidden = true
    progressElement.value = 0
    return
  }
  progressElement.hidden = false
  progressElement.value = Math.min(100, Math.max(0, value))
}

function getSelectedMode(): RenderMode {
  const selected = document.querySelector<HTMLInputElement>(
    'input[name="compare-mode"]:checked'
  )
  return selected?.value === "legacy" ? "legacy" : "hism"
}

function clampCount(raw: number) {
  if (!Number.isFinite(raw)) return 1
  return Math.min(MAX_INSTANCE_COUNT, Math.max(1, Math.floor(raw)))
}

function resolvePresetDefs(count: number) {
  return count > SINGLE_PRESET_THRESHOLD
    ? [HISM_TREE_PRESETS[0]!]
    : [...HISM_TREE_PRESETS]
}

function resolvePlacementRadius(count: number) {
  if (count <= 10_000) return 3000
  return Math.min(800_000, 3000 * Math.sqrt(count / 10_000))
}

function resolveClusterCellSize(count: number, radiusMeters: number) {
  const targetClusters = Math.max(16, Math.ceil(Math.sqrt(count / 80)))
  const cellSize = Math.ceil((radiusMeters * 2) / targetClusters)
  return Math.min(8192, Math.max(512, cellSize))
}

function shouldSampleTerrain(count: number) {
  return sampleTerrainCheckbox.checked && count <= SAMPLING_MAX_COUNT
}

function updateHint(count: number) {
  if (!hintElement) return
  const parts = []
  if (count > POISSON_MAX_COUNT) {
    parts.push(t("example.hism-compare.hint.fastScatter"))
  }
  if (count > SAMPLING_MAX_COUNT) {
    parts.push(t("example.hism-compare.hint.skipTerrain"))
  }
  if (count > SINGLE_PRESET_THRESHOLD) {
    parts.push(t("example.hism-compare.hint.singleSpecies"))
  }
  hintElement.textContent =
    parts.length > 0
      ? parts.join("；") + "。"
      : t("example.hism-compare.hint.small")
  sampleTerrainCheckbox.disabled = count > SAMPLING_MAX_COUNT
  if (count > SAMPLING_MAX_COUNT) {
    sampleTerrainCheckbox.checked = false
  }
}

async function initializeTemplates(mode: RenderMode, count: number) {
  const presetDefs = resolvePresetDefs(count)
  setStatus(t("example.hism-compare.status.initTemplates", { n: presetDefs.length }))
  templates = presetDefs.map((preset) =>
    mode === "hism"
      ? buildHismTreeTemplate(preset.name, preset.baseScale, viewer.hism.rtcUniforms)
      : buildLegacyTreeTemplate(preset.name, preset.baseScale)
  )
  await yieldToBrowser()
}

function disposeActiveScene() {
  if (!activeScene) return
  if (activeScene.mode === "legacy") {
    viewer.scene.threeScene.remove(activeScene.group)
    activeScene.group.traverse((child) => {
      const mesh = child as THREE.InstancedMesh
      if (mesh.isInstancedMesh) mesh.dispose()
    })
    activeScene.rtcHandles.forEach((dispose) => dispose())
  } else {
    activeScene.layer.remove()
  }
  activeScene = null
}

async function yieldToBrowser() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0))
  })
}

async function generatePlacements(count: number, radiusMeters: number, seed: number) {
  const presets = resolvePresetDefs(count)
  const common = {
    count,
    centerLongitude: HISM_DEMO_CENTER.longitude,
    centerLatitude: HISM_DEMO_CENTER.latitude,
    radiusMeters,
    seed,
    presetCount: presets.length,
    presetScales: presets.map((preset) => preset.baseScale),
  }
  if (count > POISSON_MAX_COUNT) {
    return generateFastPlacements(common)
  }
  return generatePoissonPlacements({
    ...common,
    minSpacingMeters: 6,
  })
}

async function sampleHeights(
  placements: Placement[],
  onProgress: (ratio: number) => void
) {
  if (!shouldSampleTerrain(placements.length)) {
    return placements.map((placement) => ({ placement, height: 0 }))
  }

  const results = await viewer.sampleHeightMostDetailed(
    placements.map((point) => [point.longitude, point.latitude]),
    { source: "all", resolution: 160, maxFrames: 120 }
  )
  onProgress(1)
  return placements
    .map((placement, index) => {
      const sampled = results[index]
      return sampled ? { placement, height: sampled[2] } : null
    })
    .filter((item): item is SampledPlacement => item !== null)
}

async function buildLegacyScene(
  presetTemplates: PresetTemplate[],
  sampledPlacements: SampledPlacement[],
  onProgress: (ratio: number) => void
) {
  const group = new THREE.Group()
  group.name = "legacy-compare-forest"
  const buckets = presetTemplates.map(() => [] as SampledPlacement[])
  for (const item of sampledPlacements) {
    const bucket = buckets[item.placement.presetIndex]
    if (bucket) bucket.push(item)
  }

  const matrix = new THREE.Matrix4()
  const scaleMatrix = new THREE.Matrix4()
  const rtcHandles: Array<() => void> = []
  let drawCalls = 0
  let processed = 0

  for (let presetIndex = 0; presetIndex < presetTemplates.length; presetIndex += 1) {
    const template = presetTemplates[presetIndex]
    const bucket = buckets[presetIndex]
    if (!template || bucket.length === 0) continue

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
    branchesMesh.frustumCulled = false
    leavesMesh.frustumCulled = false
    rtcHandles.push(tellux.applyRTCInstancing(branchesMesh, rtcUniforms).dispose)
    rtcHandles.push(tellux.applyRTCInstancing(leavesMesh, rtcUniforms).dispose)

    for (let index = 0; index < bucket.length; index += 1) {
      const { placement, height } = bucket[index]!
      viewer.cartographicToMatrix4(
        [placement.longitude, placement.latitude, height],
        { heading: placement.heading },
        matrix
      )
      scaleMatrix.makeScale(placement.scale, placement.scale, placement.scale)
      matrix.multiply(scaleMatrix)
      tellux.setRTCMatrixAt(branchesMesh, index, matrix)
      tellux.setRTCMatrixAt(leavesMesh, index, matrix)
      processed += 1
      if (processed % YIELD_EVERY === 0) {
        onProgress(processed / sampledPlacements.length)
        await yieldToBrowser()
      }
    }

    group.add(branchesMesh)
    group.add(leavesMesh)
    drawCalls += 2
  }

  viewer.scene.threeScene.add(group)
  onProgress(1)
  return {
    mode: "legacy" as const,
    group,
    templates: presetTemplates,
    startedAt: performance.now() / 1000,
    rtcHandles,
    instanceCount: sampledPlacements.length,
    drawCalls,
  }
}

function buildHismScene(
  presetTemplates: PresetTemplate[],
  sampledPlacements: SampledPlacement[],
  clusterCellSizeMeters: number
) {
  const layer = viewer.addHismLayer({
    id: `hism-compare-${Date.now()}`,
    archetypes: buildSimpleTreeArchetypes(presetTemplates),
    instances: sampledPlacements.map(({ placement, height }) => ({
      coordinates: [placement.longitude, placement.latitude, height],
      heading: placement.heading,
      scale: placement.scale,
      archetype: placement.presetIndex,
    })),
    clusterCellSizeMeters,
    referenceLongitude: HISM_DEMO_CENTER.longitude,
    referenceLatitude: HISM_DEMO_CENTER.latitude,
    onUpdate: (_delta, elapsed) => {
      for (const template of activeScene?.templates ?? presetTemplates) {
        template.tree.update(elapsed)
      }
    },
  })

  return {
    mode: "hism" as const,
    layer,
    templates: presetTemplates,
    instanceCount: sampledPlacements.length,
  }
}

function flyToScene(onComplete?: () => void) {
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
    complete: onComplete,
  })
}

function readLiveStats() {
  if (!activeScene) {
    return {
      drawCalls: 0,
      visibleInstances: 0,
      totalInstances: 0,
      visiblePercent: 0,
      clusterSummary: "-",
    }
  }

  if (activeScene.mode === "legacy") {
    return {
      drawCalls: activeScene.drawCalls,
      visibleInstances: activeScene.instanceCount,
      totalInstances: activeScene.instanceCount,
      visiblePercent: 100,
      clusterSummary: "n/a",
    }
  }

  const stats = viewer.getHismRuntimeStats()
  return {
    drawCalls: stats.drawCalls,
    visibleInstances: stats.visibleInstances,
    totalInstances: stats.totalInstances,
    visiblePercent:
      stats.totalInstances > 0
        ? (stats.visibleInstances / stats.totalInstances) * 100
        : 0,
    clusterSummary: `${stats.visibleClusters}/${stats.clusterCount}`,
  }
}

function updateHud() {
  hudFrame = requestAnimationFrame(updateHud)
  const now = performance.now()
  const delta = now - lastHudTime
  lastHudTime = now
  if (delta > 0) {
    const instantFps = 1000 / delta
    smoothedFps =
      smoothedFps === 0 ? instantFps : smoothedFps * 0.9 + instantFps * 0.1
  }

  const stats = readLiveStats()
  if (liveMode) liveMode.textContent = activeScene?.mode ?? "-"
  if (liveFps) liveFps.textContent = smoothedFps.toFixed(1)
  if (liveInstances) liveInstances.textContent = String(stats.totalInstances)
  if (liveVisible) {
    liveVisible.textContent = `${stats.visibleInstances} (${stats.visiblePercent.toFixed(1)}%)`
  }
  if (liveDrawCalls) liveDrawCalls.textContent = String(stats.drawCalls)
  if (liveLoad && lastRunMetrics) {
    liveLoad.textContent = `${(lastRunMetrics.totalLoadMs / 1000).toFixed(1)}s`
  }
}

async function sampleFps(durationMs: number) {
  const samples: number[] = []
  const startedAt = performance.now()
  while (performance.now() - startedAt < durationMs) {
    if (smoothedFps > 0) samples.push(smoothedFps)
    await new Promise<void>((resolve) => setTimeout(resolve, 100))
  }
  if (samples.length === 0) return smoothedFps
  return samples.reduce((sum, value) => sum + value, 0) / samples.length
}

function renderSummaryTable() {
  const legacy = compareHistory.legacy
  const hism = compareHistory.hism
  const rows: Array<[string, string, string]> = [
    ["Instances", fmt(legacy?.actualCount), fmt(hism?.actualCount)],
    ["Load (s)", fmtSec(legacy?.totalLoadMs), fmtSec(hism?.totalLoadMs)],
    ["Build (s)", fmtSec(legacy?.buildMs), fmtSec(hism?.buildMs)],
    ["FPS", fmt(legacy?.fpsAvg, 1), fmt(hism?.fpsAvg, 1)],
    ["Draw Calls", fmt(legacy?.drawCalls), fmt(hism?.drawCalls)],
    [
      "Visible %",
      fmt(legacy?.visiblePercent, 1),
      fmt(hism?.visiblePercent, 1),
    ],
    ["Clusters", legacy?.clusterSummary ?? "-", hism?.clusterSummary ?? "-"],
  ]

  summaryBody.innerHTML = rows
    .map(
      ([label, left, right]) =>
        `<tr><td>${label}</td><td>${left}</td><td>${right}</td></tr>`
    )
    .join("")
}

function fmt(value: number | undefined, digits = 0) {
  if (value === undefined || Number.isNaN(value)) return "-"
  return value.toFixed(digits)
}

function fmtSec(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) return "-"
  return (value / 1000).toFixed(2)
}

async function runGeneration() {
  const token = ++generationToken
  const mode = getSelectedMode()
  const requestedCount = clampCount(Number(countInput.value))
  countInput.value = String(requestedCount)
  updateHint(requestedCount)

  generateButton.disabled = true
  flyToButton.disabled = true
  disposeActiveScene()
  document.body.dataset.compareReady = ""
  setProgress(0)
  smoothedFps = 0
  lastRunMetrics = null

  const totalStartedAt = performance.now()
  await initializeTemplates(mode, requestedCount)
  if (token !== generationToken) return

  const radiusMeters = resolvePlacementRadius(requestedCount)
  const clusterCellSizeMeters = resolveClusterCellSize(requestedCount, radiusMeters)

  setStatus(t("example.hism-compare.status.scattering", { n: requestedCount.toLocaleString() }))
  const placementStartedAt = performance.now()
  const placements = await generatePlacements(
    requestedCount,
    radiusMeters,
    20260705 + token
  )
  const placementMs = performance.now() - placementStartedAt
  if (token !== generationToken) return

  setStatus(
    shouldSampleTerrain(placements.length)
      ? t("example.hism-compare.status.sampling")
      : t("example.hism-compare.status.skipSample")
  )
  const samplingStartedAt = performance.now()
  const sampledPlacements = await sampleHeights(placements, (ratio) => {
    setProgress(ratio * 35)
  })
  const samplingMs = performance.now() - samplingStartedAt
  if (token !== generationToken) return

  if (sampledPlacements.length === 0) {
    setStatus(t("example.hism-compare.status.empty"))
    setProgress(null)
    generateButton.disabled = false
    return
  }

  setStatus(
    t("example.hism-compare.status.building", {
      mode: mode === "hism" ? "HISM" : "Legacy",
      n: sampledPlacements.length.toLocaleString(),
    })
  )
  const buildStartedAt = performance.now()
  if (mode === "legacy") {
    activeScene = await buildLegacyScene(
      templates,
      sampledPlacements,
      (ratio) => setProgress(35 + ratio * 55)
    )
  } else {
    activeScene = buildHismScene(
      templates,
      sampledPlacements,
      clusterCellSizeMeters
    )
    setProgress(95)
    await yieldToBrowser()
  }
  const buildMs = performance.now() - buildStartedAt
  if (token !== generationToken) return

  setProgress(100)
  setStatus(t("example.hism-compare.status.flying"))
  flyToScene(async () => {
    if (token !== generationToken) return
    await new Promise<void>((resolve) => setTimeout(resolve, 3000))
    const fpsAvg = await sampleFps(3000)
    const live = readLiveStats()
    const totalLoadMs = performance.now() - totalStartedAt

    lastRunMetrics = {
      mode,
      requestedCount,
      actualCount: sampledPlacements.length,
      placementMs,
      samplingMs,
      buildMs,
      totalLoadMs,
      fpsAvg,
      drawCalls: live.drawCalls,
      visibleInstances: live.visibleInstances,
      totalInstances: live.totalInstances,
      visiblePercent: live.visiblePercent,
      clusterSummary: live.clusterSummary,
    }
    compareHistory[mode] = lastRunMetrics
    renderSummaryTable()
    setProgress(null)
    generateButton.disabled = false
    flyToButton.disabled = false
    document.body.dataset.compareReady = "true"
    window.__hismCompareSnapshot = lastRunMetrics
    setStatus(
      t("example.hism-compare.status.done", {
        mode: mode === "hism" ? "HISM" : "Legacy",
        n: sampledPlacements.length.toLocaleString(),
        fps: fpsAvg.toFixed(1),
        draw: live.drawCalls,
        visible: live.visiblePercent.toFixed(1),
      })
    )
  })
}

generateButton.addEventListener("click", () => {
  void runGeneration()
})

flyToButton.addEventListener("click", () => {
  flyToScene()
})

clearButton.addEventListener("click", () => {
  generationToken += 1
  disposeActiveScene()
  setProgress(null)
  lastRunMetrics = null
  setStatus(t("example.hism-compare.status.cleared"))
})

countInput.addEventListener("input", () => {
  updateHint(clampCount(Number(countInput.value)))
})

window.addEventListener("beforeunload", () => {
  generationToken += 1
  cancelAnimationFrame(hudFrame)
  disposeActiveScene()
  viewer.destroy()
})

updateHint(clampCount(Number(countInput.value)))
updateHud()
void initializeTemplates(getSelectedMode(), clampCount(Number(countInput.value))).then(
  () => {
    setStatus(t("example.hism-compare.status.ready"))
    const params = new URLSearchParams(location.search)
    if (params.get("autorun") !== "1") return
    const trees = params.get("trees")
    const mode = params.get("mode")
    if (trees) countInput.value = String(clampCount(Number(trees)))
    if (mode === "legacy" || mode === "hism") {
      const input = document.querySelector<HTMLInputElement>(
        `input[name="compare-mode"][value="${mode}"]`
      )
      if (input) input.checked = true
    }
    updateHint(clampCount(Number(countInput.value)))
    void runGeneration()
  }
)

declare global {
  interface Window {
    __hismCompareSnapshot?: RunMetrics
  }
}
