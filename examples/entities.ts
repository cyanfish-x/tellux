import tellux from "../src"
import { arcgisWorldImageryUrl } from "./shared"
import { mountLocationReadout } from "./location-readout"

const DEFAULT_ION_TERRAIN_ASSET_ID =
  import.meta.env.VITE_CESIUM_ION_TERRAIN_ASSET_ID ?? "1"
const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""

const container = document.querySelector("#viewer")
const statusElement = document.querySelector<HTMLElement>("#entity-status")
const pickReadoutElement =
  document.querySelector<HTMLElement>("#entity-pick-readout")
const togglePointsButton =
  document.querySelector<HTMLButtonElement>("#toggle-points")
const togglePolygonButton =
  document.querySelector<HTMLButtonElement>("#toggle-polygon")
const clearEntitiesButton =
  document.querySelector<HTMLButtonElement>("#clear-entities")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

if (
  !togglePointsButton ||
  !togglePolygonButton ||
  !clearEntitiesButton
) {
  throw new Error("Entities controls not found.")
}

// 以上海陆家嘴一带作为演示区域。所有图形高度抬升到地表以上，避免被地形/影像压住。
// All heights are raised above ground so graphics are not z-fighting with terrain.
const FOCUS_LONGITUDE = 121.4737
const FOCUS_LATITUDE = 31.2304
const SURFACE_OFFSET = 50 // 抬升 50 米，便于观察 / Raised 50m for visibility.

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
    latitude: FOCUS_LATITUDE,
    longitude: FOCUS_LONGITUDE,
    height: 4000,
    heading: 35,
    pitch: -45,
    far: 40000000,
  },
  scene: {
    atmosphere: {
      show: true,
      fallbackAmbientLight: {
        intensity: 0.8,
      },
    },
    clouds: {
      show: false,
    },
    postProcess: {
      toneMappingExposure: 7,
    },
  },
})

;(window as any).viewer = viewer

const locationReadout = mountLocationReadout(viewer, {
  parent: container.parentElement ?? document.body,
})

// 1) 点位标记：若干兴趣点 / Point markers for points of interest.
const pointPositions: Array<[number, number, string]> = [
  [FOCUS_LONGITUDE - 0.008, FOCUS_LATITUDE + 0.004, "节点 A"],
  [FOCUS_LONGITUDE + 0.006, FOCUS_LATITUDE + 0.006, "节点 B"],
  [FOCUS_LONGITUDE + 0.01, FOCUS_LATITUDE - 0.003, "节点 C"],
  [FOCUS_LONGITUDE - 0.004, FOCUS_LATITUDE - 0.007, "节点 D"],
]

pointPositions.forEach(([longitude, latitude, label], index) => {
  viewer.entities.add({
    id: `point-${index}`,
    position: [longitude, latitude, SURFACE_OFFSET],
    point: {
      pixelSize: 12,
      color: index === 0 ? "#ffd166" : "#38bdf8",
      outlineColor: "#0f172a",
      outlineWidth: 2,
    },
    properties: { kind: "point", label },
  })
})

// 2) 折线：把上面的兴趣点按顺序连成一条游览路径 / Polyline connecting POIs.
const polylinePositions = pointPositions.map(
  ([longitude, latitude]) =>
    [longitude, latitude, SURFACE_OFFSET] as [number, number, number]
)
viewer.entities.add({
  id: "route-polyline",
  polyline: {
    positions: polylinePositions,
    width: 3,
    color: "#f472b6",
  },
  properties: { kind: "polyline", label: "游览路径" },
})

// 3) 多边形：在兴趣点群外围画一块填充面 / Polygon fill over the cluster footprint.
viewer.entities.add({
  id: "zone-polygon",
  polygon: {
    positions: [
      [FOCUS_LONGITUDE - 0.012, FOCUS_LATITUDE + 0.008],
      [FOCUS_LONGITUDE + 0.014, FOCUS_LATITUDE + 0.008],
      [FOCUS_LONGITUDE + 0.014, FOCUS_LATITUDE - 0.01],
      [FOCUS_LONGITUDE - 0.012, FOCUS_LATITUDE - 0.01],
    ],
    height: SURFACE_OFFSET,
    fill: true,
    color: "rgba(45, 212, 191, 0.35)",
    outline: true,
    outlineColor: "#5eead4",
  },
  properties: { kind: "polygon", label: "规划区块" },
})

// 4) 拉伸体块：演示 extrudeHeight / Extruded block to demo extrudeHeight.
viewer.entities.add({
  id: "block-extruded",
  polygon: {
    positions: [
      [FOCUS_LONGITUDE - 0.002, FOCUS_LATITUDE - 0.0015],
      [FOCUS_LONGITUDE + 0.002, FOCUS_LATITUDE - 0.0015],
      [FOCUS_LONGITUDE + 0.002, FOCUS_LATITUDE + 0.0015],
      [FOCUS_LONGITUDE - 0.002, FOCUS_LATITUDE + 0.0015],
    ],
    height: SURFACE_OFFSET,
    extrudeHeight: SURFACE_OFFSET + 300,
    fill: true,
    color: "rgba(244, 114, 182, 0.55)",
    outline: true,
    outlineColor: "#f9a8d4",
  },
  properties: { kind: "extruded", label: "拉伸体块" },
})

setStatus(
  `已绘制 ${pointPositions.length} 个点位 + 1 条折线 + 2 个多边形（含 1 个拉伸体块）。`
)

// 拾取：点击实体回传属性 / Pick: clicking an entity returns its properties.
viewer.on("click", (event) => {
  const { entity } = event
  if (!entity) {
    if (pickReadoutElement) {
      pickReadoutElement.textContent = "未命中实体"
    }
    return
  }
  const label = (entity.properties.label as string) ?? entity.id
  const kind = (entity.properties.kind as string) ?? "unknown"
  if (pickReadoutElement) {
    pickReadoutElement.textContent = `命中：${label}（类型：${kind}，id：${entity.id}）`
  }
})

// 显隐切换 / Visibility toggles.
let pointsVisible = true
togglePointsButton.addEventListener("click", () => {
  pointsVisible = !pointsVisible
  pointPositions.forEach((_, index) => {
    const entity = viewer.entities.getById(`point-${index}`)
    if (entity) entity.show = pointsVisible
  })
  setStatus(`点位已${pointsVisible ? "显示" : "隐藏"}。`)
})

let polygonVisible = true
togglePolygonButton.addEventListener("click", () => {
  polygonVisible = !polygonVisible
  const zone = viewer.entities.getById("zone-polygon")
  const block = viewer.entities.getById("block-extruded")
  if (zone) zone.show = polygonVisible
  if (block) block.show = polygonVisible
  setStatus(`面块已${polygonVisible ? "显示" : "隐藏"}。`)
})

clearEntitiesButton.addEventListener("click", () => {
  viewer.entities.removeAll()
  setStatus("已清空所有实体。")
})

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message
}

window.addEventListener("beforeunload", () => {
  locationReadout.destroy()
  viewer.destroy()
})
