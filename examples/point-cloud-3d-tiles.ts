import type { TilesetLayer } from "../src"
import tellux from "../src"
import { bootExampleI18n, t } from "./i18n"
import { createTelluxPanel, type TelluxPanel } from "./example-panel-leva"
import { exampleMapServiceConfig } from "./shared"

bootExampleI18n()

const MELBOURNE_POINT_CLOUD_ASSET_ID = "43978"
const DEFAULT_ASSET_ID =
  import.meta.env.VITE_CESIUM_ION_POINT_CLOUD_ASSET_ID ??
  MELBOURNE_POINT_CLOUD_ASSET_ID
const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""
const MELBOURNE_VIEW = {
  latitude: -37.8136,
  longitude: 144.9631,
  height: 520,
  heading: 25,
  pitch: -22,
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
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  layers: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  camera: MELBOURNE_VIEW,
  scene: {
    atmosphere: {
      lighting: {
        mode: "post-process",
      },
    },
    clouds: {
      show: false,
    },
  },
  widgets: {
    timeline: true,
  },
})

;(window as any).viewer = viewer

let panel: TelluxPanel | undefined
let activeLayer: TilesetLayer | null = null

function setStatus(message: string) {
  panel?.setStatus(message)
}

function getMaximumAttenuation(currentPanel: TelluxPanel<ReturnType<typeof pointCloudSchema>>) {
  const size = currentPanel.controls.shading.pointSize
  return Number.isFinite(size) ? Math.min(32, Math.max(1, size)) : 8
}

function syncPointCloudShading(currentPanel: TelluxPanel<ReturnType<typeof pointCloudSchema>>) {
  if (!activeLayer) return
  const { shading } = currentPanel.controls
  const shadingState = activeLayer.pointCloudShading
  shadingState.attenuation = shading.attenuation
  shadingState.eyeDomeLighting = shading.edl
  shadingState.eyeDomeLightingStrength = 0.55
  shadingState.eyeDomeLightingRadius = 1.0
  shadingState.maximumAttenuation = getMaximumAttenuation(currentPanel)
  shadingState.geometricErrorScale = 1
}

function flyToMelbourne() {
  viewer.camera.flyTo({
    destination: {
      latitude: MELBOURNE_VIEW.latitude,
      longitude: MELBOURNE_VIEW.longitude,
      height: MELBOURNE_VIEW.height,
    },
    orientation: {
      heading: MELBOURNE_VIEW.heading,
      pitch: MELBOURNE_VIEW.pitch,
      roll: MELBOURNE_VIEW.roll,
    },
    duration: 1.6,
  })
}

function loadPointCloudTileset() {
  if (!panel) return
  const assetId = panel.controls.load.assetId.trim() || DEFAULT_ASSET_ID
  const apiToken = panel.controls.load.token.trim() || DEFAULT_ION_TOKEN

  if (!assetId || !apiToken) {
    setStatus(
      t({
        zh: "请先输入 Cesium Ion asset id 和 token，或在 .env 中配置 VITE_CESIUM_ION_TOKEN。",
        en: "Enter Cesium Ion asset id and token, or set VITE_CESIUM_ION_TOKEN.",
      })
    )
    return
  }

  activeLayer?.remove()
  activeLayer = viewer.load3DTileset({
    type: "cesium-ion",
    id: "example-point-cloud-3d-tiles",
    assetId,
    apiToken,
    pointCloudShading: {
      attenuation: panel.controls.shading.attenuation,
      eyeDomeLighting: panel.controls.shading.edl,
      eyeDomeLightingStrength: 0.55,
      eyeDomeLightingRadius: 1.0,
      geometricErrorScale: 1,
      maximumAttenuation: getMaximumAttenuation(panel),
      normalShading: true,
    },
  })

  activeLayer.tileset.addEventListener("load-error", (event) => {
    const error = event.error as unknown
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "error" in error
          ? String((error as { error: unknown }).error)
          : String(error ?? "unknown")
    setStatus(
      t(
        {
          zh: "点云瓦片解码失败：{message}",
          en: "Point cloud tile decoding failed: {message}",
        },
        { message }
      )
    )
  })

  if (assetId === MELBOURNE_POINT_CLOUD_ASSET_ID) {
    flyToMelbourne()
  } else {
    viewer.flyToTarget(activeLayer.tileset, {
      heading: 30,
      pitch: -30,
    })
  }

  setStatus(
    t({
      zh: "已加载点云 3D Tiles（Tellux pointCloudShading：attenuation / EDL）。等待瓦片细化中...",
      en: "Point cloud 3D Tiles loaded (Tellux pointCloudShading: attenuation / EDL). Waiting for tile refinement...",
    })
  )
}

function getInitialStatus() {
  return DEFAULT_ION_TOKEN
    ? t({
        zh: "已加载点云 3D Tiles（Tellux pointCloudShading：attenuation / EDL）。等待瓦片细化中...",
        en: "Point cloud 3D Tiles loaded (Tellux pointCloudShading: attenuation / EDL). Waiting for tile refinement...",
      })
    : t({
        zh: "输入 Cesium Ion token 后加载 Melbourne Point Cloud。",
        en: "Enter a Cesium Ion token to load Melbourne Point Cloud.",
      })
}

const pointCloudSchema = () =>
  ({
    load: {
      $: { label: t({ zh: "加载", en: "Load" }) },
      hint: {
        type: "hint" as const,
        value: t({
          zh: "Melbourne Point Cloud 示例；unlit 点云配合 attenuation / EDL。",
          en: "Melbourne Point Cloud demo; unlit points with attenuation / EDL.",
        }),
      },
      assetId: {
        value: DEFAULT_ASSET_ID,
        label: t({ zh: "Cesium Ion asset id", en: "Cesium Ion asset id" }),
      },
      token: {
        value: "",
        label: t({ zh: "Cesium Ion token", en: "Cesium Ion token" }),
      },
      loadTileset: {
        onClick: () => loadPointCloudTileset(),
        label: t({ zh: "加载", en: "Load" }),
      },
      flyTo: {
        onClick: () => flyToMelbourne(),
        label: t({ zh: "飞到墨尔本", en: "Fly to Melbourne" }),
      },
    },
    shading: {
      $: { label: t({ zh: "点云着色", en: "Point cloud shading" }) },
      pointSize: {
        value: 8,
        min: 1,
        max: 32,
        step: 1,
        label: t({ zh: "点大小", en: "Point size" }),
      },
      attenuation: {
        value: true,
        label: t({ zh: "距离衰减", en: "Attenuation" }),
      },
      edl: {
        value: true,
        label: t({ zh: "眼穹光照 EDL", en: "Eye-dome lighting" }),
      },
    },
    status: {
      $: { label: t({ zh: "状态", en: "Status" }) },
      message: {
        type: "hint" as const,
        value: getInitialStatus(),
      },
    },
  }) as const

function bindPanelInteractions(
  currentPanel: TelluxPanel<ReturnType<typeof pointCloudSchema>>
) {
  const { controls } = currentPanel
  return controls.effect(() => {
    void controls.shading.pointSize
    void controls.shading.attenuation
    void controls.shading.edl
    syncPointCloudShading(currentPanel)
  })
}

panel = createTelluxPanel(pointCloudSchema, {
  id: "point-cloud-panel",
  title: () => t({ zh: "点云 3D Tiles", en: "Point cloud 3D Tiles" }),
  statusPath: "status.message",
  onRebuild: bindPanelInteractions,
})

if (DEFAULT_ION_TOKEN) {
  loadPointCloudTileset()
}

window.addEventListener("beforeunload", () => {
  panel?.dispose()
  viewer.destroy()
})
