import tellux from "../src"
import { arcgisWorldImageryUrl } from "./shared"
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

// 大峡谷区域。凹多边形（带缺口的六边形）验证 earcut 三角化路径：贴地面必须在
// 凹陷处正确镂空、其余部分随峡谷地形起伏贴合。
// Grand Canyon. A concave (notched) hexagon exercises the earcut triangulation
// path: the notch must stay hollow while the fill drapes the canyon relief.
const CONCAVE_RING: Array<[number, number]> = [
  [-112.15, 36.06],
  [-112.1, 36.06],
  [-112.1, 36.085],
  [-112.125, 36.085], // 凹陷缺口 / concave notch
  [-112.125, 36.11],
  [-112.15, 36.11],
]

// 对比面的绝对高（米）：南缘量级，凹谷处会明显悬空。
const REFERENCE_HEIGHT = 2200
const REFERENCE_OFFSET_LON = 0.06

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
        url: arcgisWorldImageryUrl,
        levels: 19,
      },
    },
  ],
  camera: {
    latitude: 36.0,
    longitude: -112.1,
    height: 6500,
    heading: 352,
    pitch: -32,
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

// 贴地面：clamp: true → GPU 深度分类真·贴地；rgba 的 alpha 生效（半透明可透出地形）。
viewer.entities.add({
  id: "clamp-zone",
  polygon: {
    positions: CONCAVE_RING,
    clamp: true,
    color: "rgba(34, 211, 238, 0.5)",
  },
  properties: { kind: "clamp", label: "贴地面" },
})

// 对比面：同形状东移、固定绝对高的普通平面多边形，凹谷处悬空。
viewer.entities.add({
  id: "reference-zone",
  polygon: {
    positions: CONCAVE_RING.map(
      ([lon, lat]) => [lon + REFERENCE_OFFSET_LON, lat] as [number, number]
    ),
    height: REFERENCE_HEIGHT,
    color: "rgba(250, 204, 21, 0.5)",
    outline: true,
    outlineColor: "#fde047",
  },
  properties: { kind: "reference", label: "固定高平面" },
})

if (!DEFAULT_ION_TOKEN) {
  setStatus(
    "未配置 Cesium Ion Token（VITE_CESIUM_ION_TOKEN），无地形数据，贴地效果不可见。"
  )
} else {
  setStatus(
    "青色凹多边形贴合峡谷地形（缺口镂空）；黄色同形面固定高度，悬空于峡谷之上。"
  )
}

toggleClampInput.addEventListener("change", () => {
  const entity = viewer.entities.getById("clamp-zone")
  if (entity) entity.show = toggleClampInput.checked
})

toggleReferenceInput.addEventListener("change", () => {
  const entity = viewer.entities.getById("reference-zone")
  if (entity) entity.show = toggleReferenceInput.checked
})

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message
}

window.addEventListener("beforeunload", () => {
  locationReadout.destroy()
  viewer.destroy()
})
