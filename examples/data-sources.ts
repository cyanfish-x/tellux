import tellux, {
  type CameraSetViewOptions,
  type GeoJSONFeature,
  type GeoJSONFeatureCollection,
  type GeoJSONGeometry,
  type ImageryLayer,
  type ImageryLayerOptions,
} from "../src"
import { bootExampleI18n, t } from "./i18n"
import {
  createTiandituWmtsPreprocessURL,
  createTiandituXYZImagery,
  defaultTiandituToken,
  defaultTiandituTokens,
} from "./shared"
import { setupExamplePanels } from "./example-panel"

bootExampleI18n()
setupExamplePanels()

const container = document.querySelector("#viewer")
const overlayList = document.querySelector<HTMLElement>("#overlay-list")
const layerStatus = document.querySelector<HTMLElement>("#layer-status")

/**
 * 天地图 WMTS 注记（cia_w）URL 预处理：按瓦片坐标确定性轮换子域和 token，
 * 兼顾并发与额度，同时保证同一瓦片 URL 稳定以命中浏览器缓存。
 *
 * Tianditu WMTS (cia_w) URL preprocessor: deterministically rotates subdomain
 * and token per tile for both concurrency and quota, while keeping each tile's
 * URL stable for browser caching.
 */
const tiandituWmtsPreprocessURL = createTiandituWmtsPreprocessURL()
const tiandituImageryWMTSUrl = "https://t0.tianditu.gov.cn/cia_w/wmts"
const nsmcGeosWMSUrl =
  "https://data.nsmc.org.cn/NSMCAPI/v1/nsmc/image/wms/compose"

function formatGeosIrDatetime(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  const hour = String(date.getUTCHours()).padStart(2, "0")
  return `${year}${month}${day}${hour}00`
}

/** 取上一整点 UTC，避免请求尚未发布的时次。 */
function getGeosIrDatetime(): string {
  const date = new Date()
  date.setUTCMinutes(0, 0, 0)
  date.setUTCHours(date.getUTCHours() - 1)
  return formatGeosIrDatetime(date)
}

const TIANDITU_ADMINISTRATIVE_URL = import.meta.env.DEV
  ? "/tianditu-administrative/v2/administrative"
  : "https://api.tianditu.gov.cn/v2/administrative"
const CHENGDU_ADMIN_CODE = "156510100"

interface TiandituDistrict {
  name: string
  gb: string
  level: number
  boundary?: string
  children?: TiandituDistrict[]
}

interface TiandituAdministrativeResponse {
  status?: number
  message?: string
  code?: number
  data?: {
    district?: TiandituDistrict[]
  }
}

function buildTiandituAdministrativeUrl(
  token: string,
  keyword: string,
  childLevel: number,
  extensions: boolean
): string {
  const url = new URL(TIANDITU_ADMINISTRATIVE_URL, window.location.origin)
  url.searchParams.set("keyword", keyword)
  url.searchParams.set("childLevel", String(childLevel))
  url.searchParams.set("extensions", String(extensions))
  url.searchParams.set("tk", token)
  return url.toString()
}

function districtToFeature(district: TiandituDistrict): GeoJSONFeature | null {
  const boundary = district.boundary?.trim()
  if (!boundary) return null

  const geometry = parseTiandituBoundary(boundary)
  if (!geometry) return null

  return {
    type: "Feature",
    geometry,
    properties: {
      name: district.name,
      gb: district.gb,
      level: district.level,
    },
  }
}

function parseCoordinatePair(pair: string): [number, number] {
  const [lng, lat] = pair.trim().split(/\s+/).map(Number)
  return [lng, lat]
}

function parseRingCoordinates(ring: string): number[][] {
  return ring.split(",").map((pair) => {
    const [lng, lat] = parseCoordinatePair(pair)
    return [lng, lat]
  })
}

/** 天地图 boundary 为 MULTIPOLYGON WKT，需转为 GeoJSON 几何。 */
function parseTiandituBoundary(boundary: string): GeoJSONGeometry | null {
  const trimmed = boundary.trim()
  if (!trimmed) return null

  if (trimmed.startsWith("MULTIPOLYGON")) {
    let inner = trimmed.slice("MULTIPOLYGON".length).trim()
    if (inner.startsWith("(")) inner = inner.slice(1)
    if (inner.endsWith(")")) inner = inner.slice(0, -1)

    const polygonChunks = inner.split(")),((")
    const coordinates = polygonChunks.map((chunk, index, chunks) => {
      let poly = chunk
      if (index === 0) poly = poly.replace(/^\(\(/, "")
      if (index === chunks.length - 1) poly = poly.replace(/\)\)$/, "")
      return poly.split("),(").map(parseRingCoordinates)
    })

    if (coordinates.length === 1) {
      return { type: "Polygon", coordinates: coordinates[0] }
    }

    return { type: "MultiPolygon", coordinates }
  }

  if (trimmed.startsWith("POLYGON")) {
    let inner = trimmed.slice("POLYGON".length).trim()
    if (inner.startsWith("(")) inner = inner.slice(1)
    if (inner.endsWith(")")) inner = inner.slice(0, -1)
    inner = inner.replace(/^\(/, "").replace(/\)$/, "")
    const rings = inner.split("),(").map(parseRingCoordinates)
    return { type: "Polygon", coordinates: rings }
  }

  return { type: "Polygon", coordinates: [parseRingCoordinates(trimmed)] }
}

async function fetchTiandituAdministrative(
  token: string,
  keyword: string,
  childLevel: number,
  extensions: boolean
): Promise<TiandituAdministrativeResponse> {
  const response = await fetch(
    buildTiandituAdministrativeUrl(token, keyword, childLevel, extensions)
  )

  let payload: TiandituAdministrativeResponse
  try {
    payload = (await response.json()) as TiandituAdministrativeResponse
  } catch {
    throw new Error(
      `Tianditu administrative returned non-JSON response (HTTP ${response.status}).`
    )
  }

  if (!response.ok) {
    throw new Error(
      payload.message ??
        `Tianditu administrative request failed (HTTP ${response.status}).`
    )
  }

  if (payload.status !== 200) {
    throw new Error(
      payload.message ??
        `Tianditu administrative returned status ${payload.status ?? payload.code ?? "unknown"}.`
    )
  }

  return payload
}

/** 单次 v2 请求：keyword=156510100&childLevel=0&extensions=true */
async function fetchChengduAdminGeoJSON(
  token: string
): Promise<GeoJSONFeatureCollection> {
  const response = await fetchTiandituAdministrative(
    token,
    CHENGDU_ADMIN_CODE,
    0,
    true
  )
  const district = response.data?.district?.[0]
  if (!district) {
    throw new Error("Tianditu administrative returned no Chengdu district.")
  }

  const feature = districtToFeature(district)
  if (!feature) {
    throw new Error(
      `Tianditu returned Chengdu metadata (${district.name}) but boundary is empty.`
    )
  }

  return { type: "FeatureCollection", features: [feature] }
}

async function loadChengduAdminGeoJSON(
  token: string
): Promise<{ geojson: GeoJSONFeatureCollection | null; issue: string | null }> {
  if (!token) {
    return {
      geojson: null,
      issue: t({ zh: "未配置 VITE_TIANDITU_TOKEN。", en: "VITE_TIANDITU_TOKEN is not set." }),
    }
  }

  try {
    return {
      geojson: await fetchChengduAdminGeoJSON(token),
      issue: null,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tianditu administrative failed."

    console.warn("[data-sources] Failed to load Chengdu administrative boundary:", error)
    return { geojson: null, issue: message }
  }
}

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

if (!(overlayList instanceof HTMLElement)) {
  throw new Error("Overlay list container not found.")
}

const overlayListElement = overlayList
let draggedLayerKey: string | null = null
let dragHoverLayerKey: string | null = null

interface OverlayLayerExample {
  key: string
  label: string
  description: string
  type: "xyz" | "wms" | "wmts" | "geojson"
  initialVisible: boolean
  layer?: ImageryLayer
}

const tiandituImageryXYZLayer: ImageryLayerOptions["source"] =
  createTiandituXYZImagery()

const tiandituImageryWMTSOverlay: ImageryLayerOptions["source"] = {
  type: "wmts",
  url: tiandituImageryWMTSUrl,
  layer: "cia",
  tileMatrixSet: "w",
  style: "default",
  format: "tiles",
  projection: "EPSG:3857",
  levels: 18,
  preprocessURL: tiandituWmtsPreprocessURL,
}

/** NSMC GEOS_IRX 是全球粗分辨率拼图，BBOX 过小会返回空白图；官方示例也使用 lon/lat 顺序。 */
function normalizeNsmcWmsUrl(url: string): string {
  const nextUrl = new URL(url)
  nextUrl.searchParams.set("datetime", getGeosIrDatetime())

  const bbox = nextUrl.searchParams.get("bbox")?.split(",").map(Number)
  if (bbox?.length === 4 && bbox.every(Number.isFinite)) {
    // WMS 1.3.0 EPSG:4326 输出 lat/lon，NSMC 需要 lon/lat。
    nextUrl.searchParams.set(
      "bbox",
      [bbox[1], bbox[0], bbox[3], bbox[2]].join(",")
    )
  }

  return nextUrl.toString()
}

const nsmcGeosWMSOverlay: ImageryLayerOptions["source"] = {
  type: "wms",
  url: nsmcGeosWMSUrl,
  layer: "GEOS_IRX",
  version: "1.3.0",
  crs: "EPSG:4326",
  format: "image/png",
  transparent: false,
  // GEOS 拼图在 BBOX 经纬跨度 < ~25° 时返回空白图。levels:4 时最细瓦片约 22.5°，放大后部分区域会空图。
  levels: 3,
  tileDimension: 256,
  contentBoundingBox: [-180, -90, 180, 90],
  preprocessURL: normalizeNsmcWmsUrl,
}

const chengduAdminStyle: ImageryLayerOptions["style"] = {
  fill: "rgba(20, 184, 166, 0.12)",
  stroke: "#f97316",
  strokeWidth: 2.5,
}

const overlayLayers: OverlayLayerExample[] = [
  {
    key: "tianditu-imagery-xyz",
    label: t({ zh: "天地图影像 XYZ", en: "Tianditu imagery XYZ" }),
    description: "DataServer img_w / Web Mercator",
    type: "xyz",
    initialVisible: Boolean(defaultTiandituToken),
  },
  {
    key: "nsmc-geos-wms",
    label: t({ zh: "风云卫星 GEOS 红外云图 WMS", en: "FY GEOS IR cloud WMS" }),
    description: t({ zh: "NSMC GEOS_IRX / 全球拼图 / 粗粒度 WMS", en: "NSMC GEOS_IRX / global mosaic / coarse WMS" }),
    type: "wms",
    initialVisible: true,
  },
  {
    key: "tianditu-imagery-wmts",
    label: t({ zh: "天地图影像注记 WMTS", en: "Tianditu imagery annotation WMTS" }),
    description: "cia_w / Web Mercator",
    type: "wmts",
    initialVisible: Boolean(defaultTiandituToken),
  },
  {
    key: "chengdu-admin-geojson",
    label: t({ zh: "成都市行政区划", en: "Chengdu administrative boundaries" }),
    description: t({ zh: "天地图 v2/administrative / 156510100", en: "Tianditu v2/administrative / 156510100" }),
    type: "geojson",
    initialVisible: Boolean(defaultTiandituToken),
  },
]

async function main() {
  let chengduAdminGeoJSON: GeoJSONFeatureCollection | null = null
  let adminLoadIssue: string | null = null

  const adminLoadResult = await loadChengduAdminGeoJSON(
    // v2/administrative 只接受单个 tk；多 key 逗号串会导致 400「请求参数非法长度或不合规」。
    // The administrative API accepts a single tk; a comma-joined multi-key string
    // returns HTTP 400 ("illegal parameter length or non-compliant").
    defaultTiandituTokens[0] ?? ""
  )
  chengduAdminGeoJSON = adminLoadResult.geojson
  adminLoadIssue = adminLoadResult.issue

  const adminLayerMeta = overlayLayers.find(
    (layer) => layer.key === "chengdu-admin-geojson"
  )
  const adminLayerReady = Boolean(chengduAdminGeoJSON?.features.length)
  if (adminLayerMeta) {
    adminLayerMeta.initialVisible = adminLayerReady
  }

  const chengduAdminOverlay: ImageryLayerOptions["source"] = {
    type: "geojson",
    geojson: chengduAdminGeoJSON ?? {
      type: "FeatureCollection",
      features: [],
    },
    resolution: 1024,
  }

  const initialLayers: ImageryLayerOptions[] = [
  {
    id: "tianditu-imagery-xyz",
    name: t({ zh: "天地图影像 XYZ", en: "Tianditu imagery XYZ" }),
    source: tiandituImageryXYZLayer,
    visible: Boolean(defaultTiandituToken),
  },
  {
    id: "nsmc-geos-wms",
    name: t({ zh: "风云卫星 GEOS 红外云图 WMS", en: "FY GEOS IR cloud WMS" }),
    source: nsmcGeosWMSOverlay,
    visible: true,
    style: {
      opacity: 0.85,
    },
  },
  {
    id: "tianditu-imagery-wmts",
    name: t({ zh: "天地图影像注记 WMTS", en: "Tianditu imagery annotation WMTS" }),
    source: tiandituImageryWMTSOverlay,
    visible: Boolean(defaultTiandituToken),
    style: {
      opacity: 1,
    },
  },
  {
    id: "chengdu-admin-geojson",
    name: t({ zh: "成都市行政区划", en: "Chengdu administrative boundaries" }),
    source: chengduAdminOverlay,
    visible: adminLayerReady,
    style: {
      ...chengduAdminStyle,
      opacity: 0.92,
    },
  },
]

const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: "/draco/gltf/",
  layers: initialLayers,
  camera: {
    latitude: 30.5728,
    longitude: 104.0668,
    height: 420000,
    heading: 0,
    pitch: -89,
    roll: 0,
  },
  scene: {
    atmosphere: {
      lighting: {
        mode: "light-source",
      },
    },
    clouds: {
      show: false,
    },
  },
})

;(window as any).viewer = viewer

overlayLayers.forEach((item) => {
  const layer = viewer.layers.get(item.key)
  if (!layer) {
    throw new Error(`Layer "${item.key}" not found.`)
  }
  item.layer = layer
})

renderLayerManager()
updateLayerStatus()

function renderLayerManager() {
  overlayListElement.innerHTML = ""

  overlayLayers.forEach((layer) => {
    const item = document.createElement("div")
    item.className = "layer-manager__item"
    item.dataset.layer = layer.key

    const dragHandle = document.createElement("button")
    dragHandle.type = "button"
    dragHandle.className = "layer-manager__drag-handle"
    dragHandle.draggable = true
    dragHandle.setAttribute("aria-label", t({ zh: "拖动 {label} 调整顺序", en: "Drag {label} to reorder" }, { label: layer.label }))
    dragHandle.title = t({ zh: "拖动调整顺序", en: "Drag to reorder" })
    dragHandle.textContent = "≡"
    dragHandle.addEventListener("dragstart", (event) => {
      draggedLayerKey = layer.key
      dragHoverLayerKey = null
      item.classList.add("layer-manager__item--dragging")
      event.dataTransfer?.setData("text/plain", layer.key)
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move"
      }
    })
    dragHandle.addEventListener("dragend", () => {
      draggedLayerKey = null
      dragHoverLayerKey = null
      getLayerItems().forEach((element) => {
        element.classList.remove("layer-manager__item--dragging")
      })
    })

    const input = document.createElement("input")
    input.type = "checkbox"
    input.className = "layer-manager__toggle"
    input.checked = layer.layer?.isVisible() ?? layer.initialVisible
    input.dataset.layer = layer.key
    input.setAttribute("aria-label", t({ zh: "{label} 显隐", en: "{label} visibility" }, { label: layer.label }))
    input.addEventListener("change", () => {
      layer.layer?.setVisible(input.checked)
      updateLayerStatus()
    })

    const text = document.createElement("span")
    text.className = "layer-manager__item-text"

    const name = document.createElement("strong")
    name.textContent = layer.label

    const description = document.createElement("span")
    description.textContent = layer.description

    const type = document.createElement("span")
    type.className = `layer-manager__tag layer-manager__tag--${layer.type}`
    type.textContent = layer.type

    const opacity = layer.layer?.getStyle().opacity ?? 1
    const opacityControl = document.createElement("div")
    opacityControl.className = "layer-manager__opacity"

    const opacityLabel = document.createElement("span")
    opacityLabel.className = "layer-manager__opacity-label"
    opacityLabel.textContent = t({ zh: "透明度", en: "Opacity" })

    const opacityInput = document.createElement("input")
    opacityInput.type = "range"
    opacityInput.className = "layer-manager__opacity-slider"
    opacityInput.min = "0"
    opacityInput.max = "1"
    opacityInput.step = "0.01"
    opacityInput.value = String(opacity)
    opacityInput.setAttribute("aria-label", t({ zh: "{label} 透明度", en: "{label} opacity" }, { label: layer.label }))

    const opacityValue = document.createElement("output")
    opacityValue.className = "layer-manager__opacity-value"
    opacityValue.textContent = formatOpacity(opacity)

    opacityInput.addEventListener("input", () => {
      const nextOpacity = Number(opacityInput.value)
      layer.layer?.setStyle({ opacity: nextOpacity })
      opacityValue.textContent = formatOpacity(nextOpacity)
    })

    opacityControl.append(opacityLabel, opacityInput, opacityValue)
    text.append(name, description, opacityControl)
    item.append(dragHandle, input, text, type)
    overlayListElement.appendChild(item)
  })
}

overlayListElement.addEventListener("dragover", (event) => {
  if (!draggedLayerKey) return

  event.preventDefault()

  const target = getClosestLayerItem(event.target)
  const targetLayerKey = target?.dataset.layer ?? null
  if (!targetLayerKey || targetLayerKey === draggedLayerKey) {
    dragHoverLayerKey = null
  }
})

overlayListElement.addEventListener("dragenter", (event) => {
  if (!draggedLayerKey) return

  const target = getClosestLayerItem(event.target)
  if (!target) return

  event.preventDefault()
  const targetLayerKey = target.dataset.layer
  if (!targetLayerKey) return
  if (targetLayerKey === draggedLayerKey) {
    dragHoverLayerKey = null
    return
  }
  if (targetLayerKey === dragHoverLayerKey) {
    return
  }

  dragHoverLayerKey = targetLayerKey
  reorderOverlayLayer(draggedLayerKey, targetLayerKey)
})

overlayListElement.addEventListener("dragleave", (event) => {
  if (!draggedLayerKey || !dragHoverLayerKey) return

  const target = getClosestLayerItem(event.target)
  const targetLayerKey = target?.dataset.layer
  if (targetLayerKey !== dragHoverLayerKey) return
  if (isPointerInsideElement(event, target)) return

  dragHoverLayerKey = null
})

overlayListElement.addEventListener("drop", (event) => {
  if (!draggedLayerKey) return

  event.preventDefault()
  draggedLayerKey = null
  dragHoverLayerKey = null
})

function reorderOverlayLayer(draggedKey: string, targetKey: string) {
  const fromIndex = overlayLayers.findIndex((layer) => layer.key === draggedKey)
  const toIndex = overlayLayers.findIndex((layer) => layer.key === targetKey)
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return

  const firstRects = captureLayerItemRects()
  const draggedLayer = overlayLayers[fromIndex]
  const targetLayer = overlayLayers[toIndex]
  overlayLayers[fromIndex] = overlayLayers[toIndex]
  overlayLayers[toIndex] = draggedLayer
  targetLayer.layer?.moveTo(fromIndex)
  draggedLayer.layer?.moveTo(toIndex)
  syncLayerItemOrder()
  animateLayerItemMoves(firstRects)
}

function syncLayerItemOrder() {
  overlayLayers.forEach((layer) => {
    const item = getLayerItems().find(
      (element) => element.dataset.layer === layer.key
    )
    if (item) {
      overlayListElement.appendChild(item)
    }
  })
}

function getClosestLayerItem(target: EventTarget | null) {
  return target instanceof Element
    ? target.closest<HTMLElement>(".layer-manager__item")
    : null
}

function getLayerItems() {
  return Array.from(
    overlayListElement.querySelectorAll<HTMLElement>(".layer-manager__item")
  )
}

function isPointerInsideElement(event: DragEvent, element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  )
}

function captureLayerItemRects() {
  const rects = new Map<string, DOMRect>()
  getLayerItems().forEach((item) => {
    const key = item.dataset.layer
    if (key) {
      rects.set(key, item.getBoundingClientRect())
    }
  })
  return rects
}

function animateLayerItemMoves(firstRects: Map<string, DOMRect>) {
  getLayerItems().forEach((item) => {
    const key = item.dataset.layer
    const firstRect = key ? firstRects.get(key) : undefined
    if (!firstRect) return

    const lastRect = item.getBoundingClientRect()
    const deltaX = firstRect.left - lastRect.left
    const deltaY = firstRect.top - lastRect.top
    if (deltaX === 0 && deltaY === 0) return

    item.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: "translate(0, 0)" },
      ],
      {
        duration: 180,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      }
    )
  })
}

function formatOpacity(opacity: number) {
  return `${Math.round(opacity * 100)}%`
}

function updateLayerStatus() {
  if (!layerStatus) return

  const activeCount = overlayLayers.filter((layer) =>
    layer.layer?.isVisible()
  ).length
  const tiandituVisible = overlayLayers.some(
    (layer) =>
      layer.key.startsWith("tianditu-") && layer.layer?.isVisible()
  )
  const statusParts = [
    activeCount === 0
      ? t({ zh: "当前未显示叠加图层。", en: "No overlay layers visible." })
      : t({ zh: "当前显示 {n} 个叠加图层。", en: "{n} overlay layer(s) visible." }, { n: activeCount }),
  ]

  if (tiandituVisible && !defaultTiandituToken) {
    statusParts.push(t({ zh: "天地图图层需要配置 VITE_TIANDITU_TOKEN。", en: "Tianditu layers require VITE_TIANDITU_TOKEN." }))
  }

  const adminLayer = overlayLayers.find(
    (layer) => layer.key === "chengdu-admin-geojson"
  )
  if (adminLayer?.layer?.isVisible() && !adminLayerReady) {
    statusParts.push(
      adminLoadIssue ??
        t({ zh: "成都市 GeoJSON 未加载成功。请检查 tk 是否开通 v2/administrative。", en: "Chengdu GeoJSON failed. Check tk access to v2/administrative." })
    )
  } else if (adminLoadIssue && adminLayerReady) {
    statusParts.push(adminLoadIssue)
  }

  layerStatus.textContent = statusParts.join(" ")
}

window.addEventListener("beforeunload", () => {
  viewer.destroy()
})
}

main().catch((error) => {
  console.error("[data-sources] Failed to initialize example:", error)
})
