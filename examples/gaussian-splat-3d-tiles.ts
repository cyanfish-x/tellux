import tellux from "../src"
import { TilesRenderer } from "3d-tiles-renderer"
import { GaussianSplatPlugin } from "3d-tiles-rendererjs-3dgs-plugin"
import { bootExampleI18n, t } from "./i18n"
import { createTelluxPanel, type TelluxPanel } from "./example-panel-leva"
import { ExampleMessage } from "./example-message"
import { exampleMapServiceConfig } from "./shared"

bootExampleI18n()

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

const container = document.querySelector("#viewer")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

const initialClockTime = new Date()
initialClockTime.setUTCHours(2, 0, 0, 0)

const viewer = new tellux.Viewer(container, {
  clock: {
    currentTime: initialClockTime,
  },
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

let panel: TelluxPanel | undefined
let activeTileset: TilesRenderer | null = null
let animationFrame = 0
let previousLoadedTileCount = -1
let loadFailed = false

function setStatus(message: string) {
  panel?.setStatus(message)
}

function formatLoadError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "object" && error !== null && "error" in error) {
    return String((error as { error: unknown }).error)
  }
  return String(error ?? "unknown")
}

function handleTilesetLoadError(event: { error: unknown }) {
  loadFailed = true
  clearActiveTileset()
  const detail = formatLoadError(event.error)
  ExampleMessage.error(
    t({
      zh: "高斯泼溅 tileset 加载失败",
      en: "Failed to load Gaussian splat tileset",
    }),
    {
      id: "gaussian-splat-load-error",
      description: detail,
      showClose: true,
    }
  )
  setStatus(
    t({
      zh: "tileset 加载失败，请检查 URL 或网络。",
      en: "Tileset load failed. Check the URL or network.",
    })
  )
}

function attachTilesetErrorHandler(tileset: TilesRenderer) {
  tileset.addEventListener("load-error", handleTilesetLoadError)
}

function syncSplatVisibility() {
  if (activeTileset && panel) {
    activeTileset.group.visible = panel.controls.options.visible
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

  viewer.flyToTarget(
    {
      latitude: SAMPLE_VIEW.latitude,
      longitude: SAMPLE_VIEW.longitude,
      height: 0,
    },
    {
      heading: SAMPLE_VIEW.heading,
      pitch: SAMPLE_VIEW.pitch,
      roll: SAMPLE_VIEW.roll,
      distance: SAMPLE_VIEW.height,
      duration: 1.2,
    }
  )
}

function loadGaussianSplatTileset() {
  if (!panel) return
  const url = panel.controls.load.tilesetUrl.trim()
  if (!url) {
    setStatus(
      t({
        zh: "请先输入 3DGS tileset.json URL，或配置 VITE_GAUSSIAN_SPLAT_3D_TILESET_URL。",
        en: "Enter a 3DGS tileset.json URL, or set VITE_GAUSSIAN_SPLAT_3D_TILESET_URL.",
      })
    )
    return
  }

  clearActiveTileset()
  loadFailed = false
  activeTileset = createGaussianSplatTileset(url)
  attachTilesetErrorHandler(activeTileset)
  syncSplatVisibility()
  viewer.scene.threeScene.add(activeTileset.group)
  flyToSample()
  setStatus(
    t({
      zh: "已加载高斯泼溅 3D Tiles。等待瓦片细化中...",
      en: "Gaussian splat 3D Tiles loaded. Waiting for tile refinement...",
    })
  )
}

function updateSplatStatus() {
  if (!activeTileset || loadFailed) return

  const loadedTileCount = activeTileset.visibleTiles.size
  if (loadedTileCount === previousLoadedTileCount) return

  previousLoadedTileCount = loadedTileCount
  setStatus(
    loadedTileCount > 0
      ? t(
          { zh: "高斯泼溅瓦片可见：{n}。", en: "Visible Gaussian splat tiles: {n}." },
          { n: loadedTileCount }
        )
      : t({
          zh: "高斯泼溅 tileset 已加入场景，移动相机可触发加载。",
          en: "Tileset added; move the camera to trigger loading.",
        })
  )
}

function frame(time: number) {
  const camera = viewer.camera.threeCamera
  if (activeTileset && !loadFailed) {
    activeTileset.setResolutionFromRenderer(camera, viewer.renderer)
    if (activeTileset.group.visible) {
      try {
        activeTileset.update()
      } catch (error) {
        handleTilesetLoadError({ error })
      }
    }
    updateSplatStatus()
  }
  viewer.render(time)
  animationFrame = window.requestAnimationFrame(frame)
}

const splatSchema = () =>
  ({
    load: {
      $: { label: t({ zh: "加载", en: "Load" }) },
      tilesetUrl: {
        value: DEFAULT_SPLAT_TILESET_URL,
        label: t({ zh: "3DGS tileset.json URL", en: "3DGS tileset.json URL" }),
      },
      loadTileset: {
        onClick: () => loadGaussianSplatTileset(),
        label: t({ zh: "加载", en: "Load" }),
      },
      flyTo: {
        onClick: () => flyToSample(),
        label: t({ zh: "定位", en: "Fly to" }),
      },
      remove: {
        onClick: () => {
          loadFailed = false
          clearActiveTileset()
          setStatus(
            t({ zh: "高斯泼溅 3D Tiles 已移除。", en: "Gaussian splat 3D Tiles removed." })
          )
        },
        label: t({ zh: "移除", en: "Remove" }),
      },
    },
    options: {
      $: { label: t({ zh: "选项", en: "Options" }) },
      visible: {
        value: true,
        label: t({ zh: "显示高斯泼溅", en: "Show Gaussian splats" }),
      },
    },
    status: {
      $: { label: t({ zh: "状态", en: "Status" }) },
      message: {
        type: "hint" as const,
        value: t({
          zh: "已加载高斯泼溅 3D Tiles。等待瓦片细化中...",
          en: "Gaussian splat 3D Tiles loaded. Waiting for tile refinement...",
        }),
      },
    },
  }) as const

function bindPanelInteractions(
  currentPanel: TelluxPanel<ReturnType<typeof splatSchema>>
) {
  return currentPanel.controls.effect(() => {
    void currentPanel.controls.options.visible
    syncSplatVisibility()
    if (loadFailed) return
    setStatus(
      activeTileset
        ? t(
            { zh: "高斯泼溅已{state}。", en: "Gaussian splats are {state}." },
            {
              state: currentPanel.controls.options.visible
                ? t({ zh: "显示", en: "shown" })
                : t({ zh: "隐藏", en: "hidden" }),
            }
          )
        : t({ zh: "还没有加载高斯泼溅。", en: "No Gaussian splats loaded yet." })
    )
  })
}

panel = createTelluxPanel(splatSchema, {
  id: "gaussian-splat-panel",
  title: () => t({ zh: "高斯泼溅 3D Tiles", en: "Gaussian splat 3D Tiles" }),
  statusPath: "status.message",
  onRebuild: bindPanelInteractions,
})

loadGaussianSplatTileset()
animationFrame = window.requestAnimationFrame(frame)

window.addEventListener("beforeunload", () => {
  window.cancelAnimationFrame(animationFrame)
  clearActiveTileset()
  panel?.dispose()
  viewer.destroy()
})
