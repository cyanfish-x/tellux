import type { TilesetLayer } from "../src"
import tellux from "../src"
import { bootExampleI18n, t } from "./i18n"
import { exampleMapServiceConfig } from "./shared"
import { setupExamplePanels } from "./example-panel"

bootExampleI18n()
setupExamplePanels()

const container = document.querySelector("#viewer")
const assetIdInput = document.querySelector<HTMLInputElement>("#ion-asset-id")
const tokenInput = document.querySelector<HTMLInputElement>("#ion-token")
const statusElement = document.querySelector<HTMLElement>("#tileset-status")
const loadButton = document.querySelector<HTMLButtonElement>("#load-tileset")
const flyToCityButton =
  document.querySelector<HTMLButtonElement>("#fly-to-city")
const pointSizeInput =
  document.querySelector<HTMLInputElement>("#point-size")
const attenuationInput =
  document.querySelector<HTMLInputElement>("#point-attenuation")
const edlInput = document.querySelector<HTMLInputElement>("#point-edl")

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

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

if (
  !assetIdInput ||
  !tokenInput ||
  !loadButton ||
  !flyToCityButton ||
  !pointSizeInput ||
  !attenuationInput ||
  !edlInput
) {
  throw new Error("Point cloud controls not found.")
}

const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: "/draco/",
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
viewer.clock.hourUTC = 2

assetIdInput.value = DEFAULT_ASSET_ID
tokenInput.value = ""
tokenInput.placeholder = DEFAULT_ION_TOKEN
  ? t({ zh: "留空使用默认 token", en: "Leave empty to use default token" })
  : t({ zh: "输入 Cesium Ion token", en: "Enter Cesium Ion token" })

attenuationInput.checked = true
edlInput.checked = true

let activeLayer: TilesetLayer | null = null

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message
}

function getMaximumAttenuation() {
  const size = Number.parseFloat(pointSizeInput.value)
  return Number.isFinite(size) ? Math.min(32, Math.max(1, size)) : 8
}

function syncPointCloudShading() {
  if (!activeLayer) return
  const shading = activeLayer.pointCloudShading
  shading.attenuation = attenuationInput.checked
  shading.eyeDomeLighting = edlInput.checked
  shading.eyeDomeLightingStrength = 0.55
  shading.eyeDomeLightingRadius = 1.0
  shading.maximumAttenuation = getMaximumAttenuation()
  shading.geometricErrorScale = 1
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
  const assetId = assetIdInput.value.trim() || DEFAULT_ASSET_ID
  const apiToken = tokenInput.value.trim() || DEFAULT_ION_TOKEN

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
      attenuation: attenuationInput.checked,
      eyeDomeLighting: edlInput.checked,
      eyeDomeLightingStrength: 0.55,
      eyeDomeLightingRadius: 1.0,
      geometricErrorScale: 1,
      maximumAttenuation: getMaximumAttenuation(),
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

loadButton.addEventListener("click", loadPointCloudTileset)
flyToCityButton.addEventListener("click", flyToMelbourne)
pointSizeInput.addEventListener("input", syncPointCloudShading)
attenuationInput.addEventListener("change", syncPointCloudShading)
edlInput.addEventListener("change", syncPointCloudShading)

if (DEFAULT_ION_TOKEN) {
  loadPointCloudTileset()
} else {
  setStatus(
    t({
      zh: "输入 Cesium Ion token 后加载 Melbourne Point Cloud。",
      en: "Enter a Cesium Ion token to load Melbourne Point Cloud.",
    })
  )
}

window.addEventListener("beforeunload", () => {
  viewer.destroy()
})
