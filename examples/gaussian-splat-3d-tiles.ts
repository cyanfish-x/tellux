import tellux from "../src"
import { TilesRenderer } from "3d-tiles-renderer"
import { GaussianSplatPlugin } from "3d-tiles-rendererjs-3dgs-plugin"
import { arcgisWorldImageryUrl } from "./shared"

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
  camera: SAMPLE_VIEW,
  layers: [
    {
      source: {
        type: "xyz",
        url: arcgisWorldImageryUrl,
        levels: 19,
      },
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
    postProcess: {
      lensFlare: false,
      toneMappingExposure: 3,
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
    setStatus("请先输入 3DGS tileset.json URL，或配置 VITE_GAUSSIAN_SPLAT_3D_TILESET_URL。")
    return
  }

  clearActiveTileset()
  activeTileset = createGaussianSplatTileset(url)
  syncSplatVisibility()
  viewer.scene.threeScene.add(activeTileset.group)
  flyToSample()
  setStatus("已加载高斯泼溅 3D Tiles。等待瓦片细化中...")
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
      ? `高斯泼溅瓦片可见：${loadedTileCount}。`
      : "高斯泼溅 tileset 已加入场景，移动相机可触发加载。"
  )
}

function withHiddenCameraTilesRenderer(callback: () => void) {
  const camera = viewer.camera.threeCamera
  const hasTilesRenderer = Object.prototype.hasOwnProperty.call(camera.userData, "tilesRenderer")
  const tilesRenderer = camera.userData.tilesRenderer
  delete camera.userData.tilesRenderer

  try {
    callback()
  } finally {
    if (hasTilesRenderer) {
      camera.userData.tilesRenderer = tilesRenderer
    } else {
      delete camera.userData.tilesRenderer
    }
  }
}

function frame(time: number) {
  const camera = viewer.camera.threeCamera
  activeTileset?.setResolutionFromRenderer(camera, viewer.renderer)
  withHiddenCameraTilesRenderer(() => {
    if (activeTileset?.group.visible) {
      activeTileset.update()
    }
    updateSplatStatus()
    viewer.render(time)
  })
  animationFrame = window.requestAnimationFrame(frame)
}

loadControl.addEventListener("click", loadGaussianSplatTileset)
flyToControl.addEventListener("click", flyToSample)
removeControl.addEventListener("click", () => {
  clearActiveTileset()
  setStatus("高斯泼溅 3D Tiles 已移除。")
})
splatVisibleToggle.addEventListener("change", () => {
  syncSplatVisibility()
  setStatus(activeTileset ? `高斯泼溅已${splatVisibleToggle.checked ? "显示" : "隐藏"}。` : "还没有加载高斯泼溅。")
})

loadGaussianSplatTileset()
animationFrame = window.requestAnimationFrame(frame)

window.addEventListener("beforeunload", () => {
  window.cancelAnimationFrame(animationFrame)
  clearActiveTileset()
  viewer.destroy()
})
