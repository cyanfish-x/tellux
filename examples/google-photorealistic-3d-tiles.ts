import type { TilesetLayer } from "../src"
import tellux from "../src"
import * as THREE from "three"

const container = document.querySelector("#viewer")
const tokenInput = document.querySelector<HTMLInputElement>("#ion-token")
const statusElement = document.querySelector<HTMLElement>("#tileset-status")
const loadButton = document.querySelector<HTMLButtonElement>("#load-tileset")
const flyToCityButton =
  document.querySelector<HTMLButtonElement>("#fly-to-city")
const attributionsElement = document.querySelector<HTMLElement>(
  "#google-attributions"
)

const GOOGLE_PHOTOREALISTIC_ASSET_ID = 2275207
const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""
const TOKYO_VIEW = {
  latitude: 35.67892292593304,
  longitude: 139.7578734062542,
  height: 333.7182476466302,
  heading: 55.39167218405104,
  pitch: -9.004347303873784,
  roll: -0.000007967030826951874,
}

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

if (!tokenInput || !loadButton || !flyToCityButton) {
  throw new Error("Massive city model controls not found.")
}

const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: "/draco/gltf/",
  camera: TOKYO_VIEW,
  scene: {
    atmosphere: {
      lighting: {
        mode: "post-process",
        sunLight: true,
        skyLight: true,
        albedoScale: 1,
      },
    },
    clouds: {
      show: true,
      quality: "ultra",
    },
    postProcess: {
      toneMappingExposure: 4,
    },
  },
  widgets: {
    timeline: true,
  },
})

;(window as any).viewer = viewer
viewer.clock.hourUTC = 21
viewer.tileset.group.visible = false

tokenInput.value = ""
tokenInput.placeholder = DEFAULT_ION_TOKEN
  ? "留空使用 VITE_CESIUM_ION_TOKEN"
  : "输入 Cesium Ion token"

let activeLayer: TilesetLayer | null = null
let attributionFrame = 0
let materialDebugTileCount = 0
let materialDebugTotalCount = 0
let materialDebugBasicCount = 0

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message
}

function flyToTokyo() {
  viewer.camera.flyTo({
    destination: {
      latitude: TOKYO_VIEW.latitude,
      longitude: TOKYO_VIEW.longitude,
      height: TOKYO_VIEW.height,
    },
    orientation: {
      heading: TOKYO_VIEW.heading,
      pitch: TOKYO_VIEW.pitch,
      roll: TOKYO_VIEW.roll,
    },
    duration: 1.4,
  })
}

function summarizeTileMaterials(scene: THREE.Object3D) {
  const materialTypes = new Map<string, number>()
  const materialSamples: Array<Record<string, unknown>> = []
  let total = 0
  let basic = 0
  let withMap = 0
  let toneMapped = 0
  let transparent = 0

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.material) return

    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]
    for (const material of materials) {
      total += 1
      const materialType = material.constructor.name
      const isBasicMaterial = material instanceof THREE.MeshBasicMaterial
      const map = "map" in material ? material.map : null

      if (isBasicMaterial) basic += 1
      if (map) withMap += 1
      if (material.toneMapped) toneMapped += 1
      if (material.transparent) transparent += 1

      materialTypes.set(
        materialType,
        (materialTypes.get(materialType) ?? 0) + 1
      )

      if (materialSamples.length < 5) {
        materialSamples.push({
          name: material.name || "(unnamed)",
          type: materialType,
          isMeshBasicMaterial: isBasicMaterial,
          hasMap: Boolean(map),
          toneMapped: material.toneMapped,
          transparent: material.transparent,
          opacity: material.opacity,
        })
      }
    }
  })

  return {
    total,
    basic,
    nonBasic: total - basic,
    withMap,
    toneMapped,
    transparent,
    materialTypes: Object.fromEntries(materialTypes),
    materialSamples,
  }
}

function logTileMaterialDebug(event: { scene: THREE.Object3D; url?: string }) {
  const summary = summarizeTileMaterials(event.scene)
  materialDebugTileCount += 1
  materialDebugTotalCount += summary.total
  materialDebugBasicCount += summary.basic
}

function renderAttributions() {
  if (!attributionsElement) return

  const attributions = activeLayer?.tileset.getAttributions() ?? []
  attributionsElement.replaceChildren()

  for (const attribution of attributions) {
    if (attribution.type === "image") {
      const image = document.createElement("img")
      image.src = String(attribution.value)
      image.alt = ""
      attributionsElement.append(image)
      continue
    }

    if (attribution.value) {
      const item = document.createElement("span")
      item.innerHTML = String(attribution.value)
      attributionsElement.append(item)
    }
  }
}

function scheduleAttributionUpdate() {
  renderAttributions()
  attributionFrame = window.requestAnimationFrame(scheduleAttributionUpdate)
}

function loadGooglePhotorealisticTiles() {
  const apiToken = tokenInput.value.trim() || DEFAULT_ION_TOKEN

  if (!apiToken) {
    setStatus(
      "请先输入 Cesium Ion token，或在 .env 中配置 VITE_CESIUM_ION_TOKEN。"
    )
    return
  }

  activeLayer?.remove()
  activeLayer = viewer.load3DTileset({
    type: "cesium-ion",
    id: "google-photorealistic-3d-tiles",
    assetId: GOOGLE_PHOTOREALISTIC_ASSET_ID,
    apiToken,
    creasedNormals: true,
  })
  materialDebugTileCount = 0
  materialDebugTotalCount = 0
  materialDebugBasicCount = 0
  ;(activeLayer.tileset as any).addEventListener(
    "load-model",
    logTileMaterialDebug
  )
  flyToTokyo()
  setStatus("已通过 viewer.load3DTileset 加载城市级海量 3D Tiles 模型。")
}

loadButton.addEventListener("click", loadGooglePhotorealisticTiles)
flyToCityButton.addEventListener("click", flyToTokyo)

if (DEFAULT_ION_TOKEN) {
  loadGooglePhotorealisticTiles()
} else {
  setStatus("输入 Cesium Ion token 后加载城市级海量 3D Tiles 模型。")
}

scheduleAttributionUpdate()

window.addEventListener("beforeunload", () => {
  window.cancelAnimationFrame(attributionFrame)
  viewer.destroy()
})
