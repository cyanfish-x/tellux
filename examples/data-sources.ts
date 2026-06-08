import tellux, {
  type CameraSetViewOptions,
  type ImageryLayer,
  type ImageryLayerOptions,
} from "../src"
import { arcgisWorldImageryUrl } from "./shared"

const container = document.querySelector("#viewer")
const overlayList = document.querySelector<HTMLElement>("#overlay-list")
const layerStatus = document.querySelector<HTMLElement>("#layer-status")
const openInfraMapUrl = "https://openinframap.org/tiles/{z}/{x}/{y}.pbf"
const nasaGIBSWMSUrl =
  "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
const nasaGIBSLandCoverTime = "2024-01-01"

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
  type: "xyz" | "wms" | "geojson" | "mvt"
  initialVisible: boolean
  layer?: ImageryLayer
}

const openInfraMapOverlay: ImageryLayerOptions["source"] = {
  type: "mvt",
  url: openInfraMapUrl,
  levels: 15,
  resolution: 1024,
}

const openInfraMapStyle: ImageryLayerOptions["style"] = {
  getStyle(layerName, properties) {
    if (properties === null) {
      if (
        layerName === "power_substation" ||
        layerName === "power_substation_point"
      )
        return { order: 10 }
      if (layerName === "power_line") return { order: 20 }
      if (layerName === "power_tower" || layerName === "power_pole")
        return { order: 30 }
      if (
        layerName === "power_plant" ||
        layerName === "power_plant_point" ||
        layerName === "power_generator"
      )
        return { order: 35 }
      return { order: 40 }
    }

    if (layerName === "power_substation") {
      return {
        fill: "rgba(2, 201, 213, 0.5)",
        stroke: "#000000",
        strokeWidth: 1,
        order: 10,
      }
    }

    if (layerName === "power_substation_point") {
      return {
        fill: "#02c9d5",
        stroke: "#000000",
        strokeWidth: 1.2,
        radius: 4,
        order: 10,
      }
    }

    if (layerName === "power_line") {
      return {
        stroke: "#e6b800",
        strokeWidth: 2,
        order: 20,
      }
    }

    if (layerName === "power_tower" || layerName === "power_pole") {
      return {
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 1,
        radius: 3,
        order: 30,
      }
    }

    if (
      layerName === "power_plant" ||
      layerName === "power_plant_point" ||
      layerName === "power_generator"
    ) {
      return {
        fill: "rgba(34, 197, 94, 0.72)",
        stroke: "#052e16",
        strokeWidth: 1.2,
        radius: 4,
        order: 35,
      }
    }

    if (layerName.includes("pipeline")) {
      return { stroke: "rgba(125, 211, 252, 0.72)", strokeWidth: 2, order: 38 }
    }

    return { visible: false }
  },
}

const arcgisWorldImageryLayer: ImageryLayerOptions["source"] = {
  type: "xyz",
  url: arcgisWorldImageryUrl,
}

const nasaGIBSLandCoverOverlay: ImageryLayerOptions["source"] = {
  type: "wms",
  url: nasaGIBSWMSUrl,
  layer: "MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual",
  version: "1.1.1",
  crs: "EPSG:4326",
  styles: "default",
  format: "image/png",
  transparent: true,
  levels: 10,
  tileDimension: 512,
  contentBoundingBox: [-180, -90, 180, 90],
  preprocessURL(url) {
    const nextUrl = new URL(url)
    nextUrl.searchParams.set("TIME", nasaGIBSLandCoverTime)
    return nextUrl.toString()
  },
}

const chinaProvinceOverlay: ImageryLayerOptions["source"] = {
  type: "geojson",
  url: "/中国省级行政区划.geojson",
  resolution: 1024,
}

const chinaProvinceStyle: ImageryLayerOptions["style"] = {
  fill: "rgba(20, 184, 166, 0.14)",
  stroke: "#5eead4",
  strokeWidth: 1.4,
  getStyle(_feature, properties) {
    if (properties?.province_type === "直辖市") {
      return {
        fill: "rgba(244, 114, 182, 0.2)",
        stroke: "#f9a8d4",
        strokeWidth: 1.8,
      }
    }

    if (properties?.province_type === "自治区") {
      return {
        fill: "rgba(96, 165, 250, 0.18)",
        stroke: "#93c5fd",
        strokeWidth: 1.5,
      }
    }

    return {}
  }
}

const chinaCamera: CameraSetViewOptions = {
  latitude: 35.2,
  longitude: 104.8,
  height: 8200000,
  heading: -90,
  pitch: -72,
}

const overlayLayers: OverlayLayerExample[] = [
  {
    key: "arcgis-world-imagery",
    label: "ArcGIS XYZ 影像",
    description: "XYZ / World Imagery",
    type: "xyz",
    initialVisible: true,
  },
  {
    key: "nasa-gibs-land-cover-wms",
    label: "NASA GIBS 土地覆盖 WMS",
    description: `MODIS IGBP Land Cover ${nasaGIBSLandCoverTime}`,
    type: "wms",
    initialVisible: true,
  },
  {
    key: "openinframap-mvt",
    label: "OpenInfraMap 电力设施",
    description: "Mapbox Vector Tile",
    type: "mvt",
    initialVisible: false,
  },
  {
    key: "china-province-geojson",
    label: "中国省级行政区划",
    description: "GeoJSONOverlay / public GeoJSON",
    type: "geojson",
    initialVisible: true,
  },
]

const initialLayers: ImageryLayerOptions[] = [
  {
    id: "arcgis-world-imagery",
    name: "ArcGIS XYZ 影像",
    source: arcgisWorldImageryLayer,
    visible: true,
  },
  {
    id: "nasa-gibs-land-cover-wms",
    name: "NASA GIBS 土地覆盖 WMS",
    source: nasaGIBSLandCoverOverlay,
    visible: true,
    style: {
      opacity: 0.82,
    },
  },
  {
    id: "openinframap-mvt",
    name: "OpenInfraMap 电力设施",
    source: openInfraMapOverlay,
    visible: false,
    style: openInfraMapStyle,
  },
  {
    id: "china-province-geojson",
    name: "中国省级行政区划",
    source: chinaProvinceOverlay,
    visible: true,
    style: {
      ...chinaProvinceStyle,
      opacity: 0.92,
    },
  },
]

const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: "/draco/gltf/",
  layers: initialLayers,
  scene: {
    clouds: false,
    toneMappingExposure: 7,
  },
  terrain: undefined,
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
viewer.camera.setView(chinaCamera)
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
    dragHandle.setAttribute("aria-label", `拖动 ${layer.label} 调整顺序`)
    dragHandle.title = "拖动调整顺序"
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
    input.setAttribute("aria-label", `${layer.label} 显隐`)
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
    opacityLabel.textContent = "透明度"

    const opacityInput = document.createElement("input")
    opacityInput.type = "range"
    opacityInput.className = "layer-manager__opacity-slider"
    opacityInput.min = "0"
    opacityInput.max = "1"
    opacityInput.step = "0.01"
    opacityInput.value = String(opacity)
    opacityInput.setAttribute("aria-label", `${layer.label} 透明度`)

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
    const item = getLayerItems().find((element) => element.dataset.layer === layer.key)
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
  layerStatus.textContent =
    activeCount === 0
      ? "当前未显示叠加图层。"
      : `当前显示 ${activeCount} 个叠加图层。`
}

window.addEventListener("beforeunload", () => {
  viewer.destroy()
})
