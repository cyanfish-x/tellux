import tellux from "../src"
import type {
  Picked3DTilesFeature,
  TilesetLayer,
  ViewerClickEvent,
  ViewerMouseMoveEvent,
} from "../src"
import { bootExampleI18n, t } from "./i18n"
import { exampleMapServiceConfig } from "./shared"
import { mountLocationReadout } from "./location-readout"
import { setupExamplePanels } from "./example-panel"

bootExampleI18n()
setupExamplePanels()

const container = document.querySelector("#viewer")
const assetIdInput = document.querySelector<HTMLInputElement>("#ion-asset-id")
const tokenInput = document.querySelector<HTMLInputElement>("#ion-token")
const loadButton = document.querySelector<HTMLButtonElement>("#load-tileset")
const clearButton = document.querySelector<HTMLButtonElement>("#clear-selection")
const statusElement = document.querySelector<HTMLElement>("#pick-status")
const hoverElement = document.querySelector<HTMLElement>("#feature-hover")
const popupElement = document.querySelector<HTMLElement>("#feature-popup")

const DEFAULT_ASSET_ID = "75343"
const DEFAULT_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

if (!assetIdInput || !tokenInput || !loadButton || !clearButton || !hoverElement || !popupElement) {
  throw new Error("3D Tiles picking controls not found.")
}

const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: "/draco/gltf/",
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  layers: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  camera: {
    latitude: 40.69114333714821,
    longitude: -74.01881302800248,
    height: 753,
    heading: 21.27879878293835,
    pitch: -21.34390550872461,
    roll: 0.0716951918898415,
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
    highlight: {
      overlay: {
        color: "#7cff5b",
        opacity: 0.58,
        hoverColor: "#38bdf8",
        hoverOpacity: 0.42,
      },
    },
  },
})

;(window as any).viewer = viewer
viewer.clock.hourUTC = 16

assetIdInput.value = DEFAULT_ASSET_ID
tokenInput.value = ""
tokenInput.placeholder = DEFAULT_TOKEN
  ? t("example.3d-tiles-picking.ph.tokenDefault")
  : t("example.3d-tiles-picking.ph.tokenInput")

let activeLayer: TilesetLayer | null = null
let selectedKey: string | null = null
let hoverKey: string | null = null
const locationReadout = mountLocationReadout(viewer, {
  parent: container.parentElement ?? document.body,
  position: "left-bottom",
})

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message
}

function getFeatureKey(feature: Picked3DTilesFeature) {
  return `${feature.layerId}:${feature.object.uuid}:${feature.featureId ?? "object"}`
}

function clearHover() {
  hoverKey = null
  viewer.highlight.setHover(null)
  hoverElement.hidden = true
}

function clearSelection() {
  selectedKey = null
  viewer.highlight.clear()
  popupElement.hidden = true
}

function clearActiveLayer() {
  clearHover()
  clearSelection()
  activeLayer?.remove()
  activeLayer = null
}

function loadTileset() {
  const assetId = assetIdInput.value.trim()
  const apiToken = tokenInput.value.trim() || DEFAULT_TOKEN

  if (!assetId || !apiToken) {
    setStatus(t("example.3d-tiles-picking.status.needCreds"))
    return
  }

  clearActiveLayer()
  activeLayer = viewer.load3DTileset({
    type: "cesium-ion",
    id: "example-3d-tiles-picking",
    assetId,
    apiToken,
  })
  setStatus(t("example.3d-tiles-picking.status.loaded"))
}

function handleMouseMove(event: ViewerMouseMoveEvent) {
  const feature =
    event.pick?.type === "tilesFeature" ? event.pick.feature : null
  if (!feature) {
    clearHover()
    return
  }

  const nextHoverKey = getFeatureKey(feature)
  hoverElement.textContent = getFeatureTitle(feature)
  hoverElement.hidden = false
  positionFloatingElement(hoverElement, event.position.x + 12, event.position.y + 12)

  if (nextHoverKey === selectedKey) {
    hoverKey = nextHoverKey
    viewer.highlight.setHover(null)
    return
  }

  if (nextHoverKey !== hoverKey) {
    hoverKey = nextHoverKey
    viewer.highlight.setHover(event.pick)
  }
}

function handleClick(event: ViewerClickEvent) {
  const feature =
    event.pick?.type === "tilesFeature" ? event.pick.feature : null
  if (!feature) {
    clearSelection()
    return
  }

  selectedKey = getFeatureKey(feature)
  viewer.highlight.set(event.pick)
  if (hoverKey === selectedKey) {
    viewer.highlight.setHover(null)
  }
  renderFeaturePopup(feature)
}

function renderFeaturePopup(feature: Picked3DTilesFeature) {
  popupElement.replaceChildren()

  const title = document.createElement("h2")
  title.textContent = getFeatureTitle(feature)
  popupElement.appendChild(title)

  const meta = document.createElement("p")
  meta.textContent = t("example.3d-tiles-picking.popup.meta", {
    layerId: feature.layerId,
    featureId: feature.featureId ?? "-",
  })
  popupElement.appendChild(meta)

  const rows = [
    ...Object.entries(feature.properties),
    ["Longitude", feature.cartographic.longitude],
    ["Latitude", feature.cartographic.latitude],
    ["Height", feature.cartographic.height],
  ].slice(0, 18)

  if (rows.length === 0) {
    const empty = document.createElement("p")
    empty.className = "feature-empty"
    empty.textContent = t("example.3d-tiles-picking.popup.empty")
    popupElement.appendChild(empty)
  } else {
    const table = document.createElement("table")
    table.className = "feature-properties"
    const tbody = document.createElement("tbody")
    rows.forEach(([key, value]) => {
      const row = document.createElement("tr")
      const th = document.createElement("th")
      const td = document.createElement("td")
      th.textContent = String(key)
      td.textContent = formatValue(value)
      row.append(th, td)
      tbody.appendChild(row)
    })
    table.appendChild(tbody)
    popupElement.appendChild(table)
  }

  popupElement.hidden = false
}

function getFeatureTitle(feature: Picked3DTilesFeature) {
  const properties = feature.properties
  for (const key of ["BIN", "NAME", "Name", "name", "DOITT_ID", "SOURCE_ID", "id"]) {
    const value = properties[key]
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value)
    }
  }

  return feature.featureId === null ? "Picked 3D Tiles object" : `Feature ${feature.featureId}`
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "-"
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(6)
  }
  if (typeof value === "string" || typeof value === "boolean") return String(value)
  if (ArrayBuffer.isView(value)) {
    return Array.from(value as ArrayLike<number>).slice(0, 8).join(", ")
  }

  try {
    const text = JSON.stringify(value)
    return text.length > 120 ? `${text.slice(0, 117)}...` : text
  } catch {
    return String(value)
  }
}

function positionFloatingElement(element: HTMLElement, x: number, y: number) {
  const shell = container.parentElement ?? container
  const margin = 16
  const maxX = Math.max(margin, shell.clientWidth - element.offsetWidth - margin)
  const maxY = Math.max(margin, shell.clientHeight - element.offsetHeight - margin)
  element.style.left = `${Math.min(Math.max(x, margin), maxX)}px`
  element.style.top = `${Math.min(Math.max(y, margin), maxY)}px`
}

loadButton.addEventListener("click", loadTileset)
clearButton.addEventListener("click", () => {
  clearHover()
  clearSelection()
})
viewer.on("mousemove", handleMouseMove)
viewer.on("click", handleClick)

if (DEFAULT_TOKEN) {
  loadTileset()
} else {
  setStatus(t("example.3d-tiles-picking.status.prompt"))
}

window.addEventListener("beforeunload", () => {
  viewer.off("mousemove", handleMouseMove)
  viewer.off("click", handleClick)
  clearActiveLayer()
  locationReadout.destroy()
  viewer.destroy()
})
