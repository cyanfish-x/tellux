import tellux, {
  type CameraSetViewOptions,
  type ImageryLayer,
  type ImageryLayerOptions,
} from "../src"
import { arcgisWorldImageryUrl, createTelluxViewer } from "./shared"

const container = document.querySelector("#viewer")
const overlayList = document.querySelector<HTMLElement>("#overlay-list")
const layerStatus = document.querySelector<HTMLElement>("#layer-status")
const openInfraMapUrl = "https://openinframap.org/tiles/{z}/{x}/{y}.pbf"
const nasaGIBSWMSUrl =
  "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

if (!(overlayList instanceof HTMLElement)) {
  throw new Error("Overlay list container not found.")
}

const overlayListElement = overlayList

interface OverlayLayerExample {
  key: string
  label: string
  description: string
  type: "xyz" | "wms" | "mvt"
  initialVisible: boolean
  layer?: ImageryLayer
}

const openInfraMapOverlay = tellux.MVTResource.fromUrl(openInfraMapUrl, {
  levels: 15,
  resolution: 1024,
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
})

const arcgisWorldImageryLayer = tellux.TemplateUrlResource.fromUrl(
  arcgisWorldImageryUrl
)

const nasaGIBSReferenceOverlay = tellux.WMSResource.fromUrl(
  nasaGIBSWMSUrl,
  "Reference_Features_15m",
  {
    version: "1.1.1",
    crs: "EPSG:4326",
    styles: "",
    format: "image/png",
    transparent: true,
    levels: 10,
    tileDimension: 512,
    contentBoundingBox: [-180, -90, 180, 90],
  }
)

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
    description: "TemplateUrlResource / World Imagery",
    type: "xyz",
    initialVisible: true,
  },
  {
    key: "nasa-gibs-reference-wms",
    label: "NASA GIBS 边界 WMS",
    description: "Reference_Features_15m",
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
]

const initialLayers: ImageryLayerOptions[] = [
  {
    id: "arcgis-world-imagery",
    name: "ArcGIS XYZ 影像",
    source: arcgisWorldImageryLayer,
    visible: true,
  },
  {
    id: "nasa-gibs-reference-wms",
    name: "NASA GIBS 边界 WMS",
    source: nasaGIBSReferenceOverlay,
    visible: true,
    style: {
      opacity: 0.72,
    },
  },
  {
    id: "openinframap-mvt",
    name: "OpenInfraMap 电力设施",
    source: openInfraMapOverlay,
    visible: false,
  },
]

const viewer = createTelluxViewer(container, {
  layers: initialLayers,
  scene: {
    clouds: false,
    toneMappingExposure: 7,
  },
  terrain: undefined,
})

setTimeout(() => {
  viewer.camera.setView({
    latitude: 28.24955872562373,
    longitude: 112.58837123212457,
    height: 5752668.878183253,
    heading: -39.57750042099313,
    pitch: -89.06082079312655,
    roll: 16.681284373547793,
  })
}, 500)

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
    item.append(input, text, type)
    overlayListElement.appendChild(item)
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
