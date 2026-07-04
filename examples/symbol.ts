import tellux from "../src"
import { arcgisWorldImageryUrl } from "./shared"
import { mountLocationReadout } from "./location-readout"

const DEFAULT_ION_TERRAIN_ASSET_ID =
  import.meta.env.VITE_CESIUM_ION_TERRAIN_ASSET_ID ?? "1"
const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""

const container = document.querySelector("#viewer")
const statusElement = document.querySelector<HTMLElement>("#symbol-status")
const pickReadoutElement = document.querySelector<HTMLElement>(
  "#symbol-pick-readout"
)
const togglePoiInput = document.querySelector<HTMLInputElement>("#toggle-poi")
const toggleLabelsInput =
  document.querySelector<HTMLInputElement>("#toggle-labels")
const toggleIconsInput =
  document.querySelector<HTMLInputElement>("#toggle-icons")
const toggleMultilineInput =
  document.querySelector<HTMLInputElement>("#toggle-multiline")
const recolorButton =
  document.querySelector<HTMLButtonElement>("#recolor-label")
const clearButton =
  document.querySelector<HTMLButtonElement>("#clear-symbols")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}
if (
  !togglePoiInput ||
  !toggleLabelsInput ||
  !toggleIconsInput ||
  !toggleMultilineInput ||
  !recolorButton ||
  !clearButton
) {
  throw new Error("Symbol controls not found.")
}

// 上海陆家嘴一带作为演示区域；高度抬升 50 米避免被地形压住。
// Focus on Lujiazui, Shanghai; heights raised 50m so symbols clear the terrain.
const FOCUS_LONGITUDE = 121.4737
const FOCUS_LATITUDE = 31.2304
const SURFACE_OFFSET = 50

const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: "/draco/gltf/",
  terrain: DEFAULT_ION_TOKEN
    ? {
        type: "cesium-ion",
        assetId: DEFAULT_ION_TERRAIN_ASSET_ID,
        apiToken: DEFAULT_ION_TOKEN,
        tileLoading: { enableTileSplitting: true },
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
    latitude: 31.2204,
    longitude: 121.4648,
    height: 1180,
    heading: 7.58,
    pitch: -50.4,
    roll: 0,
  },
  scene: {
    atmosphere: {
      show: true,
      lighting: { mode: "light-source" },
      fallbackAmbientLight: { intensity: 0.8 },
    },
    clouds: { show: false },
  },
})

;(window as any).viewer = viewer

const locationReadout = mountLocationReadout(viewer, {
  parent: container.parentElement ?? document.body,
})

// ----- 图标剪影：程序化绘制白色 silhouette，天然契合 SDF（剪影 → 锐利染色 marker）。
// ----- Icon silhouettes drawn procedurally as white shapes — ideal SDF input.

function makePinSilhouette(size = 64): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")!
  const cx = size / 2
  const headR = size * 0.26
  const headCy = size * 0.4
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.moveTo(cx - headR * 0.85, headCy + headR * 0.15)
  ctx.lineTo(cx + headR * 0.85, headCy + headR * 0.15)
  ctx.lineTo(cx, size * 0.92)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, headCy, headR, 0, Math.PI * 2)
  ctx.fill()
  return canvas
}

function makeStarSilhouette(size = 64): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")!
  const cx = size / 2
  const cy = size / 2
  const outer = size * 0.42
  const inner = outer * 0.45
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner
    const a = (Math.PI / 5) * i - Math.PI / 2
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
  return canvas
}

function makeDiamondSilhouette(size = 64): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")!
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.4
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx + r, cy)
  ctx.lineTo(cx, cy + r)
  ctx.lineTo(cx - r, cy)
  ctx.closePath()
  ctx.fill()
  return canvas
}

const pinIcon = makePinSilhouette()
const starIcon = makeStarSilhouette()
const diamondIcon = makeDiamondSilhouette()

// ----- 1) POI：图标 + 文字标签（icon + text 共锚点，anchor bottom）。-----
// ----- 1) POIs: icon + text sharing an anchor (anchor bottom). -----
const poiList: Array<[number, number, string, HTMLCanvasElement, string]> = [
  [FOCUS_LONGITUDE - 0.006, FOCUS_LATITUDE + 0.004, "陆家嘴", pinIcon, "#ef4444"],
  [FOCUS_LONGITUDE + 0.005, FOCUS_LATITUDE + 0.005, "东方明珠", starIcon, "#f59e0b"],
  [FOCUS_LONGITUDE + 0.008, FOCUS_LATITUDE - 0.004, "上海中心", diamondIcon, "#38bdf8"],
]
const poiIds: string[] = []
poiList.forEach(([lon, lat, label, icon, color], index) => {
  const id = `poi-${index}`
  poiIds.push(id)
  viewer.entities.add({
    id,
    position: [lon, lat, SURFACE_OFFSET],
    symbol: {
      icon: { image: icon, scale: 0.6, color },
      text: {
        text: label,
        fontSize: 15,
        fillColor: "#ffffff",
        outlineColor: "#0f172a",
        outlineWidth: 2,
      },
      anchor: "bottom",
      textRelative: "right",
      textIconSpacing: 4,
    },
    properties: { kind: "poi", label },
  })
})

// ----- 2) 纯文字标签（带 halo），用于地名标注。-----
// ----- 2) Text-only labels with halo, for place names. -----
const labelList: Array<[number, number, string]> = [
  [FOCUS_LONGITUDE - 0.01, FOCUS_LATITUDE - 0.006, "黄浦江"],
  [FOCUS_LONGITUDE + 0.011, FOCUS_LATITUDE + 0.001, "浦东新区"],
  [FOCUS_LONGITUDE - 0.003, FOCUS_LATITUDE + 0.009, "外滩"],
]
const labelIds: string[] = []
labelList.forEach(([lon, lat, label], index) => {
  const id = `label-${index}`
  labelIds.push(id)
  viewer.entities.add({
    id,
    position: [lon, lat, SURFACE_OFFSET],
    symbol: {
      text: {
        text: label,
        fontSize: 14,
        fillColor: "#fde68a",
        outlineColor: "#7c2d12",
        outlineWidth: 3,
      },
      anchor: "center",
    },
    properties: { kind: "label", label },
  })
})

// ----- 3) 纯图标 marker（不同剪影与染色）。-----
// ----- 3) Icon-only markers (different silhouettes / tints). -----
const iconList: Array<[number, number, HTMLCanvasElement, string]> = [
  [FOCUS_LONGITUDE - 0.009, FOCUS_LATITUDE + 0.002, starIcon, "#a3e635"],
  [FOCUS_LONGITUDE + 0.003, FOCUS_LATITUDE - 0.008, diamondIcon, "#f472b6"],
  [FOCUS_LONGITUDE + 0.013, FOCUS_LATITUDE - 0.007, pinIcon, "#22d3ee"],
]
const iconIds: string[] = []
iconList.forEach(([lon, lat, icon, color], index) => {
  const id = `icon-${index}`
  iconIds.push(id)
  viewer.entities.add({
    id,
    position: [lon, lat, SURFACE_OFFSET],
    symbol: {
      icon: { image: icon, scale: 0.5, color },
      anchor: "center",
    },
    properties: { kind: "icon", label: `图标 ${index + 1}` },
  })
})

// ----- 4) 多行文字 + 背景框（圆角），演示 maxWidth 换行与背景。-----
// ----- 4) Multi-line text with a rounded background (maxWidth wrapping). -----
const multilineId = "multiline"
viewer.entities.add({
  id: multilineId,
  position: [FOCUS_LONGITUDE, FOCUS_LATITUDE - 0.012, SURFACE_OFFSET],
  symbol: {
    text: {
      text: "陆家嘴金融区\n东方明珠 · 上海中心",
      fontSize: 13,
      lineHeight: 1.3,
      maxWidth: 120,
      fillColor: "#e0f2fe",
      outlineColor: "#082f49",
      outlineWidth: 2,
      backgroundColor: "rgba(15, 23, 42, 0.72)",
      backgroundCornerRadius: 6,
      padding: [8, 5],
    },
    anchor: "top",
    pixelOffset: [0, -10],
  },
  properties: { kind: "multiline", label: "陆家嘴金融区" },
})

// ----- 5) 与 point 共存：同一实体既有圆点又有 symbol（§4.1）。-----
// ----- 5) Coexisting point + symbol on one entity (§4.1). -----
viewer.entities.add({
  id: "coexist",
  position: [FOCUS_LONGITUDE - 0.014, FOCUS_LATITUDE + 0.006, SURFACE_OFFSET],
  point: { pixelSize: 10, color: "#34d399", outlineColor: "#0f172a", outlineWidth: 2 },
  symbol: {
    text: {
      text: "圆点 + 标签",
      fontSize: 13,
      fillColor: "#ffffff",
      outlineColor: "#064e3b",
      outlineWidth: 2,
    },
    anchor: "right",
    pixelOffset: [-8, 0],
  },
  properties: { kind: "coexist", label: "圆点 + 标签" },
})

setStatus(
  `已绘制 ${poiList.length} 个 POI + ${labelList.length} 个文字标签 + ${iconList.length} 个图标 + 多行/背景 + 圆点共存。`
)

// 拾取：点击 symbol 回传属性。Pick: clicking a symbol returns its properties.
viewer.on("click", (event) => {
  const picked = event.entities[0]
  if (!picked) {
    if (pickReadoutElement) pickReadoutElement.textContent = "未命中实体"
    return
  }
  const { entity } = picked
  const label = (entity.properties.label as string) ?? entity.id
  const kind = (entity.properties.kind as string) ?? "unknown"
  if (pickReadoutElement) {
    pickReadoutElement.textContent = `命中：${label}（类型：${kind}，id：${entity.id}）`
  }
})

// 显隐切换。Visibility toggles.
function setGroupVisible(ids: string[], visible: boolean) {
  ids.forEach((id) => {
    const entity = viewer.entities.getById(id)
    if (entity) entity.show = visible
  })
}

togglePoiInput.addEventListener("change", () => {
  const visible = togglePoiInput.checked
  setGroupVisible(poiIds, visible)
  setStatus(`POI 已${visible ? "显示" : "隐藏"}。`)
})
toggleLabelsInput.addEventListener("change", () => {
  const visible = toggleLabelsInput.checked
  setGroupVisible(labelIds, visible)
  setStatus(`文字标签已${visible ? "显示" : "隐藏"}。`)
})
toggleIconsInput.addEventListener("change", () => {
  const visible = toggleIconsInput.checked
  setGroupVisible(iconIds, visible)
  setStatus(`图标已${visible ? "显示" : "隐藏"}。`)
})
toggleMultilineInput.addEventListener("change", () => {
  const visible = toggleMultilineInput.checked
  setGroupVisible([multilineId, "coexist"], visible)
  setStatus(`多行/背景已${visible ? "显示" : "隐藏"}。`)
})

// 运行时改色：改文字填充色不重建 SDF 纹理（即时生效）。
// Runtime recolor: changing fill color doesn't rebuild the SDF texture.
const recolorPalette = ["#fde68a", "#67e8f9", "#fca5a5", "#bef264"]
let recolorIndex = 0
recolorButton.addEventListener("click", () => {
  const entity = viewer.entities.getById("label-0")
  const text = entity?.symbol?.text
  if (!text) return
  recolorIndex = (recolorIndex + 1) % recolorPalette.length
  text.fillColor = recolorPalette[recolorIndex]
  setStatus(`"黄浦江" 标签填充色已改为 ${recolorPalette[recolorIndex]}（未重建纹理）。`)
})

clearButton.addEventListener("click", () => {
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
