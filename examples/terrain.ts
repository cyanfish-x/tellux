import tellux, { type TerrainOptions } from "../src"
import { arcgisWorldImageryUrl } from "./shared"

type TerrainSource = "url" | "cesium-ion"

const DEFAULT_TERRAIN_URL = import.meta.env.VITE_CESIUM_TERRAIN_URL ?? ""
const DEFAULT_ION_TERRAIN_ASSET_ID =
  import.meta.env.VITE_CESIUM_ION_TERRAIN_ASSET_ID ?? "1"
const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""

const container = document.querySelector("#viewer")
const terrainSourceSelect =
  document.querySelector<HTMLSelectElement>("#terrain-source")
const urlTerrainField = document.querySelector<HTMLElement>("#url-terrain-field")
const terrainUrlInput = document.querySelector<HTMLInputElement>("#terrain-url")
const ionTerrainFields = document.querySelector<HTMLElement>("#ion-terrain-fields")
const ionTerrainAssetIdInput = document.querySelector<HTMLInputElement>(
  "#ion-terrain-asset-id"
)
const ionTerrainTokenInput =
  document.querySelector<HTMLInputElement>("#ion-terrain-token")
const terrainEnabledInput =
  document.querySelector<HTMLInputElement>("#terrain-enabled")
const terrainStatus = document.querySelector<HTMLElement>("#terrain-status")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

if (
  !terrainSourceSelect ||
  !urlTerrainField ||
  !terrainUrlInput ||
  !ionTerrainFields ||
  !ionTerrainAssetIdInput ||
  !ionTerrainTokenInput ||
  !terrainEnabledInput
) {
  throw new Error("Terrain controls not found.")
}

const terrainSourceField = terrainSourceSelect
const urlTerrainFieldGroup = urlTerrainField
const terrainUrlField = terrainUrlInput
const ionTerrainFieldGroup = ionTerrainFields
const ionTerrainAssetIdField = ionTerrainAssetIdInput
const ionTerrainTokenField = ionTerrainTokenInput
const terrainEnabledControl = terrainEnabledInput

const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: "/draco/gltf/",
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
    latitude: 30.73605413066788,
    longitude: 103.51750379494544,
    height: 1946.5761978745659,
    heading: -60.2233623473377,
    pitch: -9.036646445693787,
    roll: 0.00004544608651084398,
  },
  scene: {
    clouds: {
      show: false
    },
    postProcess: {
      toneMappingExposure: 7
    }
  },
})

viewer.clock.hourUTC = 12
;(window as any).viewer = viewer

terrainUrlField.value = ""
terrainUrlField.placeholder = DEFAULT_TERRAIN_URL
  ? "留空使用 VITE_CESIUM_TERRAIN_URL"
  : "输入地形根目录或 layer.json 地址"
terrainSourceField.value = DEFAULT_ION_TOKEN ? "cesium-ion" : "url"
ionTerrainAssetIdField.value = DEFAULT_ION_TERRAIN_ASSET_ID
ionTerrainTokenField.value = ""
ionTerrainTokenField.placeholder = DEFAULT_ION_TOKEN
  ? "留空使用 VITE_CESIUM_ION_TOKEN"
  : "输入 Cesium Ion token"

function setStatus(message: string) {
  if (terrainStatus) terrainStatus.textContent = message
}

function getTerrainUrl() {
  return terrainUrlField.value.trim() || DEFAULT_TERRAIN_URL
}

function getSelectedTerrainSource(): TerrainSource {
  return terrainSourceField.value === "cesium-ion" ? "cesium-ion" : "url"
}

function createUrlTerrainOptions(): TerrainOptions | null {
  const url = getTerrainUrl()
  if (!url) {
    setStatus("请先输入 quantized-mesh 地形根目录或 layer.json 地址，或配置 VITE_CESIUM_TERRAIN_URL。")
    return null
  }

  return {
    type: "url",
    url,
    tileLoading: {
      enableTileSplitting: true,
    },
  }
}

function createIonTerrainOptions(): TerrainOptions | null {
  const assetId = ionTerrainAssetIdField.value.trim()
  const apiToken = ionTerrainTokenField.value.trim() || DEFAULT_ION_TOKEN

  if (!assetId || !apiToken) {
    setStatus("请先输入 Cesium Ion terrain asset id 和 token，或在 .env 中配置默认值。")
    return null
  }

  return {
    type: "cesium-ion",
    assetId,
    apiToken,
    tileLoading: {
      enableTileSplitting: true,
    },
  }
}

function createSelectedTerrainOptions(): TerrainOptions | null {
  return getSelectedTerrainSource() === "url"
    ? createUrlTerrainOptions()
    : createIonTerrainOptions()
}

function syncTerrainSourceFields() {
  const source = getSelectedTerrainSource()
  const isUrl = source === "url"

  urlTerrainFieldGroup.hidden = !isUrl
  terrainUrlField.disabled = !isUrl
  ionTerrainAssetIdField.disabled = isUrl
  ionTerrainTokenField.disabled = isUrl
  ionTerrainFieldGroup.hidden = isUrl
}

function enableSelectedTerrain() {
  const terrain = createSelectedTerrainOptions()
  if (!terrain) {
    terrainEnabledControl.checked = false
    return
  }

  viewer.setTerrain(terrain)
  setStatus(
    getSelectedTerrainSource() === "url"
      ? "URL 地形已通过 viewer.setTerrain 加载。"
      : "Cesium Ion 地形已通过 viewer.setTerrain 加载。"
  )
}

function disableTerrain() {
  viewer.setTerrain(null)
  setStatus("地形已关闭，Viewer 已切回无地形模式。")
}

function syncTerrainEnabledState() {
  if (terrainEnabledControl.checked) {
    enableSelectedTerrain()
  } else {
    disableTerrain()
  }
}

terrainSourceField.addEventListener("change", () => {
  syncTerrainSourceFields()
  if (terrainEnabledControl.checked) {
    enableSelectedTerrain()
  } else {
    setStatus(
      getSelectedTerrainSource() === "url"
        ? "已选择 URL 地形来源，勾选后加载 quantized-mesh 地形。"
        : "已选择 Cesium Ion 地形来源，勾选后加载 terrain asset。"
    )
  }
})

terrainEnabledControl.addEventListener("change", syncTerrainEnabledState)

terrainUrlField.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    terrainEnabledControl.checked = true
    syncTerrainEnabledState()
  }
})

ionTerrainAssetIdField.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    terrainEnabledControl.checked = true
    syncTerrainEnabledState()
  }
})

ionTerrainTokenField.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    terrainEnabledControl.checked = true
    syncTerrainEnabledState()
  }
})

syncTerrainSourceFields()

if (DEFAULT_ION_TOKEN) {
  terrainEnabledControl.checked = true
  enableSelectedTerrain()
  setStatus("已从 Cesium Ion 默认配置自动加载地形；也可以切换到 URL 地形。")
} else if (DEFAULT_TERRAIN_URL) {
  terrainEnabledControl.checked = true
  enableSelectedTerrain()
  setStatus("未检测到 Cesium Ion token，已从 VITE_CESIUM_TERRAIN_URL 自动加载 URL 地形。")
} else {
  setStatus("输入 terrain URL，或提供 Cesium Ion terrain asset id 和 token 后加载。")
}

window.addEventListener("beforeunload", () => {
  viewer.destroy()
})
