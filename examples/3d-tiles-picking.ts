import tellux from "../src"
import type {
  Picked3DTilesFeature,
  TilesetLayer,
  ViewerClickEvent,
  ViewerMouseMoveEvent,
} from "../src"
import { bootExampleI18n, t } from "./i18n"
import { createTelluxPanel, type TelluxPanel } from "./example-panel-leva"
import { exampleMapServiceConfig } from "./shared"
import { mountLocationReadout } from "./location-readout"

bootExampleI18n()

const DEFAULT_ASSET_ID = "75343"
const DEFAULT_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""

const container = document.querySelector("#viewer")
const hoverElement = document.querySelector<HTMLElement>("#feature-hover")
const popupElement = document.querySelector<HTMLElement>("#feature-popup")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

if (!hoverElement || !popupElement) {
  throw new Error("3D Tiles picking overlays not found.")
}

const initialClockTime = new Date()
initialClockTime.setUTCHours(16, 0, 0, 0)

const viewer = new tellux.Viewer(container, {
  clock: {
    currentTime: initialClockTime,
  },
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  overlays: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  camera: {
    destination: {
      longitude: -74.01881302800248,
      latitude: 40.69114333714821,
      height: 753,
    },
    orientation: {
      heading: 21.27879878293835,
      pitch: -21.34390550872461,
      roll: 0.0716951918898415,
    },
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

let panel: TelluxPanel | undefined
let activeLayer: TilesetLayer | null = null
let selectedKey: string | null = null
let hoverKey: string | null = null

const locationReadout = mountLocationReadout(viewer, {
  parent: container.parentElement ?? document.body,
  position: "left-bottom",
})

function setStatus(message: string) {
  panel?.setStatus(message)
}

function getFeatureKey(feature: Picked3DTilesFeature) {
  return `${feature.layerId}:${feature.object.uuid}:${feature.featureId ?? "object"}`
}

function clearHover() {
  hoverKey = null
  viewer.highlighter.setHover(null)
  hoverElement.hidden = true
}

function clearSelection() {
  selectedKey = null
  viewer.highlighter.clear()
  popupElement.hidden = true
}

function clearActiveLayer() {
  clearHover()
  clearSelection()
  activeLayer?.remove()
  activeLayer = null
}

function loadTileset() {
  if (!panel) return
  const assetId = panel.controls.load.assetId.trim()
  const apiToken = panel.controls.load.token.trim() || DEFAULT_TOKEN

  if (!assetId || !apiToken) {
    setStatus(
      t({
        zh: "请先输入 Cesium Ion asset id 和 token，或在 .env 中配置 VITE_CESIUM_ION_TOKEN。",
        en: "Enter asset id and token, or set VITE_CESIUM_ION_TOKEN.",
      })
    )
    return
  }

  clearActiveLayer()
  activeLayer = viewer.tilesets.add({
    source: {
      type: "cesium-ion",
      assetId: assetId,
      apiToken: apiToken,
    },
    id: "example-3d-tiles-picking",
  })
  setStatus(
    t({
      zh: "3D Tiles 已加入场景。等待瓦片加载后移动鼠标拾取 feature。",
      en: "3D Tiles added. After tiles load, move the mouse to pick features.",
    })
  )
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
    viewer.highlighter.setHover(null)
    return
  }

  if (nextHoverKey !== hoverKey) {
    hoverKey = nextHoverKey
    viewer.highlighter.setHover(event.pick)
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
  viewer.highlighter.set(event.pick)
  if (hoverKey === selectedKey) {
    viewer.highlighter.setHover(null)
  }
  renderFeaturePopup(feature)
}

function renderFeaturePopup(feature: Picked3DTilesFeature) {
  popupElement.replaceChildren()

  const title = document.createElement("h2")
  title.textContent = getFeatureTitle(feature)
  popupElement.appendChild(title)

  const meta = document.createElement("p")
  meta.textContent = t(
    {
      zh: "图层 {layerId} · feature {featureId}",
      en: "Layer {layerId} · feature {featureId}",
    },
    {
      layerId: feature.layerId,
      featureId: feature.featureId ?? "-",
    }
  )
  popupElement.appendChild(meta)

  const rows = [
    ...Object.entries(feature.properties),
    ["Longitude", feature.cartographic.longitude],
    ["Latitude", feature.cartographic.latitude],
    ["Height", feature.cartographic.height],
  ].slice(0,  18)

  if (rows.length === 0) {
    const empty = document.createElement("p")
    empty.className = "feature-empty"
    empty.textContent = t({
      zh: "当前命中对象没有可读取的 feature 属性。",
      en: "No readable feature properties on this hit.",
    })
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

  return feature.featureId === null
    ? "Picked 3D Tiles object"
    : `Feature ${feature.featureId}`
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

function getInitialStatus() {
  return DEFAULT_TOKEN
    ? t({
        zh: "3D Tiles 已加入场景。等待瓦片加载后移动鼠标拾取 feature。",
        en: "3D Tiles added. After tiles load, move the mouse to pick features.",
      })
    : t({
        zh: "输入 Cesium Ion token 后点击加载；默认 asset id 对应 Cesium NYC buildings 示例。",
        en: "Enter token then Load; default asset id is Cesium NYC buildings.",
      })
}

const pickingSchema = () =>
  ({
    load: {
      $: { label: t({ zh: "加载", en: "Load" }) },
      hint: {
        type: "hint" as const,
        value: t({
          zh: "移动鼠标高亮 feature，点击后锁定选择并展示属性。",
          en: "Hover to highlight features; click to lock selection and show properties.",
        }),
      },
      assetId: {
        value: DEFAULT_ASSET_ID,
        label: t({ zh: "Cesium Ion asset id", en: "Cesium Ion asset id" }),
      },
      token: {
        value: "",
        label: t({ zh: "Cesium Ion token", en: "Cesium Ion token" }),
      },
      loadTileset: {
        onClick: () => loadTileset(),
        label: t({ zh: "加载", en: "Load" }),
      },
      clearSelection: {
        onClick: () => {
          clearHover()
          clearSelection()
        },
        label: t({ zh: "清除选择", en: "Clear selection" }),
      },
    },
    status: {
      $: { label: t({ zh: "状态", en: "Status" }) },
      message: {
        type: "hint" as const,
        value: getInitialStatus(),
      },
    },
  }) as const

panel = createTelluxPanel(pickingSchema, {
  id: "3d-tiles-picking-panel",
  title: () => t({ zh: "拾取与高亮", en: "Pick & highlight" }),
  statusPath: "status.message",
})

viewer.on("mousemove", handleMouseMove)
viewer.on("click", handleClick)

if (DEFAULT_TOKEN) {
  loadTileset()
}

window.addEventListener("beforeunload", () => {
  viewer.off("mousemove", handleMouseMove)
  viewer.off("click", handleClick)
  clearActiveLayer()
  locationReadout.destroy()
  panel?.dispose()
  viewer.destroy()
})
