import tellux from "../src"
import { tiandituImageryXYZUrl } from "./shared"
import { mountLocationReadout } from "./location-readout"

const DEFAULT_ION_TERRAIN_ASSET_ID =
  import.meta.env.VITE_CESIUM_ION_TERRAIN_ASSET_ID ?? "1"
const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""

const container = document.querySelector("#viewer")
const statusElement = document.querySelector<HTMLElement>("#clamp-status")
const toggleClampInput = document.querySelector<HTMLInputElement>("#toggle-clamp")
const toggleReferenceInput =
  document.querySelector<HTMLInputElement>("#toggle-reference")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}
if (!toggleClampInput || !toggleReferenceInput) {
  throw new Error("Ground-clamp controls not found.")
}

// 以美国大峡谷（起伏剧烈）为演示区域：一条贴地折线跨越峡谷南北缘，随地形起伏贴合；
// 一条同经纬、固定绝对高的对比折线则以直线弦段穿过峡谷，直观展示"贴地 vs 不贴地"。
// Grand Canyon demo: a ground-clamped polyline drapes rim-to-rim over terrain,
// while a same-waypoint fixed-height polyline cuts straight through as a contrast.
const ROUTE: Array<[number, number]> = [
  [-112.145, 36.045],
  [-112.125, 36.095],
  [-112.105, 36.14],
  [-112.085, 36.19],
]

// 对比线的绝对高（米）：取南北缘量级，峡谷底部约 800m，故它会明显悬空。
const REFERENCE_HEIGHT = 2200

const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: "/draco/gltf/",
  terrain: DEFAULT_ION_TOKEN
    ? {
        type: "cesium-ion",
        assetId: DEFAULT_ION_TERRAIN_ASSET_ID,
        apiToken: DEFAULT_ION_TOKEN,
        tileLoading: {
          enableTileSplitting: true,
        },
      }
    : undefined,
  layers: [
    {
      source: {
        type: "xyz",
        url: tiandituImageryXYZUrl,
        levels: 18,
      },
    },
  ],
  camera: {
    latitude: 36.005,
    longitude: -112.11,
    height: 5200,
    heading: 4,
    pitch: -28,
    roll: 0,
  },
  scene: {
    atmosphere: {
      show: true,
      lighting: {
        mode: "light-source",
      },
      fallbackAmbientLight: {
        intensity: 0.85,
      },
    },
    clouds: {
      show: false,
    },
  },
})

;(window as any).viewer = viewer

const locationReadout = mountLocationReadout(viewer, {
  parent: container.parentElement ?? document.body,
})

// 贴地折线：clamp: true → GPU 深度分类真·贴地。width 语义为米（贴地 ribbon 宽度）。
viewer.entities.add({
  id: "clamp-route",
  polyline: {
    positions: ROUTE,
    clamp: true,
    width: 60,
    color: "#22d3ee",
  },
  properties: { kind: "clamp", label: "贴地折线" },
})

// 对比折线：同经纬、固定绝对高、普通像素宽 Line2。会以弦段悬空穿越峡谷。
viewer.entities.add({
  id: "reference-route",
  polyline: {
    positions: ROUTE.map(
      ([lon, lat]) => [lon, lat, REFERENCE_HEIGHT] as [number, number, number]
    ),
    width: 3,
    color: "#facc15",
  },
  properties: { kind: "reference", label: "固定高折线" },
})

if (!DEFAULT_ION_TOKEN) {
  setStatus(
    "未配置 Cesium Ion Token（VITE_CESIUM_ION_TOKEN），无地形数据，贴地效果不可见。"
  )
} else {
  setStatus("青色线贴合地形起伏；黄色线固定高，悬空穿越峡谷。")
}

toggleClampInput.addEventListener("change", () => {
  const entity = viewer.entities.getById("clamp-route")
  if (entity) entity.show = toggleClampInput.checked
})

toggleReferenceInput.addEventListener("change", () => {
  const entity = viewer.entities.getById("reference-route")
  if (entity) entity.show = toggleReferenceInput.checked
})

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message
}

window.addEventListener("beforeunload", () => {
  locationReadout.destroy()
  viewer.destroy()
})
