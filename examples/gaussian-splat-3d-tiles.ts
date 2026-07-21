import tellux from "../src"
import { TilesRenderer } from "3d-tiles-renderer"
import { GaussianSplatPlugin } from "3d-tiles-rendererjs-3dgs-plugin"
import { bootExampleI18n, t } from "./i18n"
import { exampleMapServiceConfig } from "./shared"
import { setupExamplePanels } from "./example-panel"

bootExampleI18n()
setupExamplePanels()

const container = document.querySelector("#viewer")
const tilesetUrlInput = document.querySelector<HTMLInputElement>("#splat-tileset-url")
const visibleToggle = document.querySelector<HTMLInputElement>("#splat-visible")
const statusElement = document.querySelector<HTMLElement>("#splat-status")
const loadButton = document.querySelector<HTMLButtonElement>("#load-splat-tileset")
const flyToButton = document.querySelector<HTMLButtonElement>("#fly-to-splat")
const removeButton = document.querySelector<HTMLButtonElement>("#remove-splat-tileset")

const PUBLIC_SAMPLE_TILESET_URL =
  "https://raw.githubusercontent.com/WilliamLiu-1997/3D-Tiles-RendererJS-3DGS-Plugin/main/data/gaussianSplat1/tileset.json"
const DEFAULT_SPLAT_TILESET_URL =
  import.meta.env.VITE_GAUSSIAN_SPLAT_3D_TILESET_URL ?? PUBLIC_SAMPLE_TILESET_URL
const SAMPLE_VIEW = {
  latitude: -38.5822,
  longitude: 142.8343,
  height: 42,
  heading: 35,
  pitch: -26,
  roll: 0,
}

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

if (!tilesetUrlInput || !visibleToggle || !loadButton || !flyToButton || !removeButton) {
  throw new Error("Gaussian splat controls not found.")
}

const tilesetUrlField = tilesetUrlInput
const splatVisibleToggle = visibleToggle
const loadControl = loadButton
const flyToControl = flyToButton
const removeControl = removeButton

const viewer = new tellux.Viewer(container, {
  useDefaultRenderLoop: false,
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  camera: SAMPLE_VIEW,
  layers: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  scene: {
    atmosphere: {
      lighting: {
        mode: "light-source",
      },
      scattering: {
        intensity: 0.35,
      },
    },
    clouds: {
      show: false,
    },
    surface: {
      materialMode: "standard",
    },
  },
})

;(window as any).viewer = viewer
viewer.clock.hourUTC = 2
tilesetUrlField.value = DEFAULT_SPLAT_TILESET_URL

let activeTileset: TilesRenderer | null = null
let animationFrame = 0
let previousLoadedTileCount = -1

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message
}

function syncSplatVisibility() {
  if (activeTileset) {
    activeTileset.group.visible = splatVisibleToggle.checked
  }
}

function clearActiveTileset() {
  if (!activeTileset) return

  viewer.scene.threeScene.remove(activeTileset.group)
  activeTileset.dispose()
  activeTileset = null
  previousLoadedTileCount = -1
}

function createGaussianSplatTileset(url: string) {
  const tileset = new TilesRenderer(url)
  tileset.setCamera(viewer.camera.threeCamera)
  tileset.setResolutionFromRenderer(viewer.camera.threeCamera, viewer.renderer)
  tileset.errorTarget = 0.8
  tileset.registerPlugin(
    new GaussianSplatPlugin({
      renderer: viewer.renderer,
      scene: viewer.scene.threeScene,
      minRaycastOpacity: 0.08,
      sparkRendererOptions: {
        focalAdjustment: 2,
        depthTest: true,
        depthWrite: false,
      },
    })
  )
  return tileset
}

function loadGaussianSplatTileset() {
  const url = tilesetUrlField.value.trim()
  if (!url) {
    setStatus(t("example.gaussian-splat-3d-tiles.status.needUrl"))
    return
  }

  clearActiveTileset()
  activeTileset = createGaussianSplatTileset(url)
  syncSplatVisibility()
  viewer.scene.threeScene.add(activeTileset.group)
  flyToSample()
  setStatus(t("example.gaussian-splat-3d-tiles.status.loaded"))
}

function flyToSample() {
  const didFlyToTileset = activeTileset
    ? viewer.flyToTarget(activeTileset, {
        heading: SAMPLE_VIEW.heading,
        pitch: SAMPLE_VIEW.pitch,
        roll: SAMPLE_VIEW.roll,
        distance: 80,
        duration: 1.2,
      })
    : false

  if (didFlyToTileset) return

  viewer.flyToTarget({
    latitude: SAMPLE_VIEW.latitude,
    longitude: SAMPLE_VIEW.longitude,
    height: 0,
  }, {
    heading: SAMPLE_VIEW.heading,
    pitch: SAMPLE_VIEW.pitch,
    roll: SAMPLE_VIEW.roll,
    distance: SAMPLE_VIEW.height,
    duration: 1.2,
  })
}

function updateSplatStatus() {
  if (!activeTileset) return

  const loadedTileCount = activeTileset.visibleTiles.size
  if (loadedTileCount === previousLoadedTileCount) return

  previousLoadedTileCount = loadedTileCount
  setStatus(
    loadedTileCount > 0
      ? t("example.gaussian-splat-3d-tiles.status.visibleCount", {
          n: loadedTileCount,
        })
      : t("example.gaussian-splat-3d-tiles.status.waiting")
  )
}

function frame(time: number) {
  const camera = viewer.camera.threeCamera
  activeTileset?.setResolutionFromRenderer(camera, viewer.renderer)
  if (activeTileset?.group.visible) {
    activeTileset.update()
  }
  updateSplatStatus()
  viewer.render(time)
  animationFrame = window.requestAnimationFrame(frame)
}

loadControl.addEventListener("click", loadGaussianSplatTileset)
flyToControl.addEventListener("click", flyToSample)
removeControl.addEventListener("click", () => {
  clearActiveTileset()
  setStatus(t("example.gaussian-splat-3d-tiles.status.removed"))
})
splatVisibleToggle.addEventListener("change", () => {
  syncSplatVisibility()
  setStatus(
    activeTileset
      ? t("example.gaussian-splat-3d-tiles.status.visibility", {
          state: splatVisibleToggle.checked
            ? t("common.shown")
            : t("common.hidden"),
        })
      : t("example.gaussian-splat-3d-tiles.status.none")
  )
})

loadGaussianSplatTileset()
animationFrame = window.requestAnimationFrame(frame)

window.addEventListener("beforeunload", () => {
  window.cancelAnimationFrame(animationFrame)
  clearActiveTileset()
  viewer.destroy()
})
