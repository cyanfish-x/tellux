import tellux from "../src"
import { bootExampleI18n, t } from "./i18n"
import { exampleMapServiceConfig } from "./shared"
import { mountLocationReadout } from "./location-readout"
import { setupExamplePanels } from "./example-panel"

bootExampleI18n()
setupExamplePanels()


const container = document.querySelector("#viewer")
const statusElement = document.querySelector<HTMLElement>("#entity-status")
const pickReadoutElement = document.querySelector<HTMLElement>(
  "#entity-pick-readout"
)
const togglePointsInput =
  document.querySelector<HTMLInputElement>("#toggle-points")
const togglePolylineInput =
  document.querySelector<HTMLInputElement>("#toggle-polyline")
const togglePolygonInput =
  document.querySelector<HTMLInputElement>("#toggle-polygon")
const clearEntitiesButton =
  document.querySelector<HTMLButtonElement>("#clear-entities")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

if (
  !togglePointsInput ||
  !togglePolylineInput ||
  !togglePolygonInput ||
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
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  layers: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  camera: {
    latitude: 31.213287073562483,
    longitude: 121.47150658039027,
    height: 2064.8970060099077,
    heading: 7.57778279899678,
    pitch: -47.26511725121502,
    roll: -0.000010753896468325056,
  },
  scene: {
    atmosphere: {
      show: true,
      lighting:{
        mode:'light-source'
      },
      fallbackAmbientLight: {
        intensity: 0.8,
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

// 1) 点位标记：若干兴趣点 / Point markers for points of interest.
const pointPositions: Array<[number, number, string]> = [
  [FOCUS_LONGITUDE - 0.008, FOCUS_LATITUDE + 0.004, t({ zh: "节点 A", en: "Node A" })],
  [FOCUS_LONGITUDE + 0.006, FOCUS_LATITUDE + 0.006, t({ zh: "节点 B", en: "Node B" })],
  [FOCUS_LONGITUDE + 0.01, FOCUS_LATITUDE - 0.003, t({ zh: "节点 C", en: "Node C" })],
  [FOCUS_LONGITUDE - 0.004, FOCUS_LATITUDE - 0.007, t({ zh: "节点 D", en: "Node D" })],
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
  properties: { kind: "polyline", label: t({ zh: "游览路径", en: "Tour route" }) },
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
  properties: { kind: "polygon", label: t({ zh: "规划区块", en: "Planning zone" }) },
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
  properties: { kind: "extruded", label: t({ zh: "拉伸体块", en: "Extruded block" }) },
})

setStatus(
  t({ zh: "已绘制 {n} 个点位 + 1 条折线 + 2 个多边形（含 1 个拉伸体块）。", en: "Drew {n} points + 1 polyline + 2 polygons (including 1 extruded block)." }, { n: pointPositions.length })
)

// 拾取：点击实体回传属性 / Pick: clicking an entity returns its properties.
viewer.on("click", (event) => {
  const pickedEntity =
    event.pick?.type === "entity" ? event.pick.entity : null
  if (!pickedEntity) {
    if (pickReadoutElement) {
      pickReadoutElement.textContent = t({ zh: "未命中实体", en: "No entity hit" })
    }
    return
  }

  const { entity } = pickedEntity
  const label = (entity.properties.label as string) ?? entity.id
  const kind = (entity.properties.kind as string) ?? "unknown"
  if (pickReadoutElement) {
    pickReadoutElement.textContent = t({ zh: "命中：{label}（类型：{kind}，id：{id}）", en: "Hit: {label} (type: {kind}, id: {id})" }, { label, kind, id: entity.id })
  }
})

// 显隐切换 / Visibility toggles.
togglePointsInput.addEventListener("change", () => {
  const visible = togglePointsInput.checked
  pointPositions.forEach((_, index) => {
    const entity = viewer.entities.getById(`point-${index}`)
    if (entity) entity.show = visible
  })
  setStatus(t({ zh: "点位已{state}。", en: "Points are {state}." }, { state: visible ? t({ zh: "显示", en: "shown" }) : t({ zh: "隐藏", en: "hidden" }) }))
})

togglePolylineInput.addEventListener("change", () => {
  const visible = togglePolylineInput.checked
  const route = viewer.entities.getById("route-polyline")
  if (route) route.show = visible
  setStatus(t({ zh: "折线已{state}。", en: "Polyline is {state}." }, { state: visible ? t({ zh: "显示", en: "shown" }) : t({ zh: "隐藏", en: "hidden" }) }))
})

togglePolygonInput.addEventListener("change", () => {
  const visible = togglePolygonInput.checked
  const zone = viewer.entities.getById("zone-polygon")
  const block = viewer.entities.getById("block-extruded")
  if (zone) zone.show = visible
  if (block) block.show = visible
  setStatus(t({ zh: "面块已{state}。", en: "Polygons are {state}." }, { state: visible ? t({ zh: "显示", en: "shown" }) : t({ zh: "隐藏", en: "hidden" }) }))
})

clearEntitiesButton.addEventListener("click", () => {
  viewer.entities.removeAll()
  setStatus(t({ zh: "已清空所有实体。", en: "All entities cleared." }))
})

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message
}

window.addEventListener("beforeunload", () => {
  locationReadout.destroy()
  viewer.destroy()
})
