import * as THREE from "three"
import tellux from "../src"
import type {
  Picked3DTilesFeature,
  TilesetLayer,
  ViewerClickEvent,
  ViewerMouseMoveEvent,
} from "../src"
import { arcgisWorldImageryUrl, defaultTerrainUrl } from "./shared"

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
const HIGHLIGHT_ATTRIBUTE_NAMES = new Set([
  "_BATCHID",
  "BATCHID",
  "_BATCH_ID",
  "BATCH_ID",
  "BATCHID_0",
  "_BATCHID_0",
])

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

if (!assetIdInput || !tokenInput || !loadButton || !clearButton || !hoverElement || !popupElement) {
  throw new Error("3D Tiles picking controls not found.")
}

const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: "/draco/gltf/",
  terrain: defaultTerrainUrl
    ? {
        url: defaultTerrainUrl,
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
    latitude: 40.69114333714821,
    longitude: -74.01881302800248,
    height: 753,
    heading: 21.27879878293835,
    pitch: -21.34390550872461,
    roll: 0.0716951918898415,
  },
  scene: {
    clouds: {
      show: false,
    },
    postProcess: {
      toneMappingExposure: 7,
    },
  },
})

;(window as any).viewer = viewer
viewer.clock.hourUTC = 16

assetIdInput.value = DEFAULT_ASSET_ID
tokenInput.value = ""
tokenInput.placeholder = DEFAULT_TOKEN ? "留空使用默认 token" : "输入 Cesium Ion token"

let activeLayer: TilesetLayer | null = null
let selectedKey: string | null = null
let hoverKey: string | null = null

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message
}

function getFeatureKey(feature: Picked3DTilesFeature) {
  return `${feature.layerId}:${feature.object.uuid}:${feature.featureId ?? "object"}`
}

function clearHover() {
  hoverKey = null
  hoverHighlight.clear()
  hoverElement.hidden = true
}

function clearSelection() {
  selectedKey = null
  selectedHighlight.clear()
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
    setStatus("请先输入 Cesium Ion asset id 和 token，或在 .env 中配置 VITE_CESIUM_ION_TOKEN。")
    return
  }

  clearActiveLayer()
  activeLayer = viewer.load3DTileset({
    type: "cesium-ion",
    id: "example-3d-tiles-picking",
    assetId,
    apiToken,
  })
  setStatus("3D Tiles 已加入场景。等待瓦片加载后移动鼠标拾取 feature。")
}

function handleMouseMove(event: ViewerMouseMoveEvent) {
  const feature = event.tilesetFeature
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
    hoverHighlight.clear()
    return
  }

  if (nextHoverKey !== hoverKey) {
    hoverKey = nextHoverKey
    hoverHighlight.show(feature)
  }
}

function handleClick(event: ViewerClickEvent) {
  const feature = event.tilesetFeature
  if (!feature) {
    clearSelection()
    return
  }

  selectedKey = getFeatureKey(feature)
  selectedHighlight.show(feature)
  if (hoverKey === selectedKey) {
    hoverHighlight.clear()
  }
  renderFeaturePopup(feature)
}

function renderFeaturePopup(feature: Picked3DTilesFeature) {
  popupElement.replaceChildren()

  const title = document.createElement("h2")
  title.textContent = getFeatureTitle(feature)
  popupElement.appendChild(title)

  const meta = document.createElement("p")
  meta.textContent = `图层 ${feature.layerId} · feature ${feature.featureId ?? "-"}`
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
    empty.textContent = "当前命中对象没有可读取的 feature 属性。"
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

class FeatureHighlightLayer {
  private object: THREE.Object3D | null = null

  constructor(
    private readonly color: THREE.ColorRepresentation,
    private readonly opacity: number
  ) {}

  show(feature: Picked3DTilesFeature) {
    this.clear()
    const object = createHighlightObject(feature, this.color, this.opacity)
    if (!object) return

    this.object = object
    object.userData.telluxPickingIgnore = true
    viewer.scene.threeScene.add(object)
  }

  clear() {
    if (!this.object) return

    viewer.scene.threeScene.remove(this.object)
    disposeHighlightObject(this.object)
    this.object = null
  }
}

function disposeHighlightObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh || (child as THREE.LineSegments).isLineSegments) {
      const renderable = child as THREE.Mesh | THREE.LineSegments
      renderable.geometry?.dispose()
      const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material]
      materials.forEach((material) => material?.dispose())
    }
  })
}

function createHighlightObject(
  feature: Picked3DTilesFeature,
  color: THREE.ColorRepresentation,
  opacity: number
) {
  const object = feature.object
  object.updateMatrixWorld(true)

  if ((object as THREE.Mesh).isMesh) {
    const mesh = object as THREE.Mesh
    const geometry = createFeatureGeometry(mesh, feature) ?? createWholeMeshGeometry(mesh)
    if (!geometry) return null

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    })
    const overlay = new THREE.Mesh(geometry, material)
    overlay.frustumCulled = false
    overlay.renderOrder = 1000
    return overlay
  }

  const box = new THREE.Box3().setFromObject(object)
  if (box.isEmpty()) return null

  const helper = new THREE.Box3Helper(box, color)
  helper.userData.telluxPickingIgnore = true
  return helper
}

function createWholeMeshGeometry(mesh: THREE.Mesh) {
  const geometry = mesh.geometry?.clone()
  if (!geometry) return null

  geometry.applyMatrix4(mesh.matrixWorld)
  return geometry
}

function createFeatureGeometry(mesh: THREE.Mesh, feature: Picked3DTilesFeature) {
  if (feature.featureId === null) return null

  const geometry = mesh.geometry
  const position = geometry.getAttribute("position")
  const featureIdAttribute = getFeatureIdAttribute(geometry)
  if (!position || !featureIdAttribute) return null

  const index = geometry.index
  const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(position.count / 3)
  const positions: number[] = []
  const vertex = new THREE.Vector3()

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const a = index ? index.getX(triangle * 3) : triangle * 3
    const b = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1
    const c = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2
    if (Math.round(featureIdAttribute.getX(a)) !== feature.featureId) continue

    pushWorldVertex(position, a, mesh.matrixWorld, vertex, positions)
    pushWorldVertex(position, b, mesh.matrixWorld, vertex, positions)
    pushWorldVertex(position, c, mesh.matrixWorld, vertex, positions)
  }

  if (positions.length === 0) return null

  const highlightGeometry = new THREE.BufferGeometry()
  highlightGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  highlightGeometry.computeBoundingSphere()
  return highlightGeometry
}

function pushWorldVertex(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: number,
  matrixWorld: THREE.Matrix4,
  vertex: THREE.Vector3,
  target: number[]
) {
  vertex
    .set(position.getX(index), position.getY(index), position.getZ(index))
    .applyMatrix4(matrixWorld)
  target.push(vertex.x, vertex.y, vertex.z)
}

function getFeatureIdAttribute(geometry: THREE.BufferGeometry) {
  for (const key of Object.keys(geometry.attributes)) {
    const normalized = key.toUpperCase()
    if (HIGHLIGHT_ATTRIBUTE_NAMES.has(normalized) || normalized.startsWith("_FEATURE_ID_")) {
      return geometry.getAttribute(key)
    }
  }

  return null
}

const hoverHighlight = new FeatureHighlightLayer(0x38bdf8, 0.42)
const selectedHighlight = new FeatureHighlightLayer(0x7cff5b, 0.58)

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
  setStatus("输入 Cesium Ion token 后点击加载；默认 asset id 对应 Cesium NYC buildings 示例。")
}

window.addEventListener("beforeunload", () => {
  viewer.off("mousemove", handleMouseMove)
  viewer.off("click", handleClick)
  clearActiveLayer()
  hoverHighlight.clear()
  selectedHighlight.clear()
  viewer.destroy()
})
