import tellux, { type TerrainOptions } from "../src"
import {
  buildTiandituTerrainUrls,
  createTiandituXYZImagery,
  defaultTiandituToken,
  defaultTiandituTokens,
  tiandituTerrainServiceTemplate,
} from "./shared"
import { bootExampleI18n, t } from "./i18n"
import { setupExamplePanels } from "./example-panel"

bootExampleI18n()
setupExamplePanels()

type TerrainSource = "tianditu" | "cesium-ion"

const DEFAULT_ION_TERRAIN_ASSET_ID =
  import.meta.env.VITE_CESIUM_ION_TERRAIN_ASSET_ID ?? "1"
const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""

const container = document.querySelector("#viewer")
const terrainSourceSelect =
  document.querySelector<HTMLSelectElement>("#terrain-source")
const tiandituTerrainFields = document.querySelector<HTMLElement>(
  "#tianditu-terrain-fields"
)
const tiandituTokenInput =
  document.querySelector<HTMLInputElement>("#tianditu-token")
const tiandituTerrainHint =
  document.querySelector<HTMLElement>("#tianditu-terrain-hint")
const ionTerrainFields = document.querySelector<HTMLElement>(
  "#ion-terrain-fields"
)
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
  !tiandituTerrainFields ||
  !tiandituTokenInput ||
  !ionTerrainFields ||
  !ionTerrainAssetIdInput ||
  !ionTerrainTokenInput ||
  !terrainEnabledInput
) {
  throw new Error("Terrain controls not found.")
}

const terrainSourceField = terrainSourceSelect
const tiandituTerrainFieldGroup = tiandituTerrainFields
const tiandituTokenField = tiandituTokenInput
const ionTerrainFieldGroup = ionTerrainFields
const ionTerrainAssetIdField = ionTerrainAssetIdInput
const ionTerrainTokenField = ionTerrainTokenInput
const terrainEnabledControl = terrainEnabledInput

const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: "/draco/",
  layers: [
    {
      source: createTiandituXYZImagery(),
    },
  ],
  camera: {
    latitude: 30.755465691598996,
    longitude: 103.51293447705049,
    height: 1946.2165657669584,
    heading: -93.06516054169673,
    pitch: -9.028828445592675,
    roll: 0.00005229266806157685,
  },
  scene: {
    clouds: {
      show: false,
    },
  },
})

viewer.clock.hourUTC = 11
;(window as any).viewer = viewer

tiandituTokenField.value = ""
tiandituTokenField.placeholder = defaultTiandituToken
  ? t({ zh: "留空使用 VITE_TIANDITU_TOKEN", en: "Leave empty to use VITE_TIANDITU_TOKEN" })
  : t({ zh: "输入天地图 tk", en: "Enter Tianditu tk" })
if (tiandituTerrainHint) {
  tiandituTerrainHint.textContent = t({ zh: "服务模板：{url}", en: "Service template: {url}" }, {
    url: tiandituTerrainServiceTemplate,
  })
}
// 本地开发优先 Cesium Ion：天地图浏览器端 key 的域名白名单通常不含
// localhost，swdx 会以 HTTP 200 空 body 失败；影像 DataServer 仍可能正常。
// Prefer Cesium Ion in local dev: browser-side Tianditu keys rarely whitelist
// localhost, and swdx often fails with HTTP 200 empty bodies while imagery still works.
const preferIonInDev = import.meta.env.DEV && Boolean(DEFAULT_ION_TOKEN)
terrainSourceField.value =
  preferIonInDev || !defaultTiandituToken ? "cesium-ion" : "tianditu"
ionTerrainAssetIdField.value = DEFAULT_ION_TERRAIN_ASSET_ID
ionTerrainTokenField.value = ""
ionTerrainTokenField.placeholder = DEFAULT_ION_TOKEN
  ? t({ zh: "留空使用 VITE_CESIUM_ION_TOKEN", en: "Leave empty to use VITE_CESIUM_ION_TOKEN" })
  : t({ zh: "输入 Cesium Ion token", en: "Enter Cesium Ion token" })

function setStatus(message: string) {
  if (terrainStatus) terrainStatus.textContent = message
}

function getTiandituTerrainUrls(token: string) {
  return buildTiandituTerrainUrls(token)
}

function getSelectedTerrainSource(): TerrainSource {
  return terrainSourceField.value === "cesium-ion" ? "cesium-ion" : "tianditu"
}

function createTiandituTerrainOptions(): TerrainOptions | null {
  const userInput = tiandituTokenField.value.trim()
  // 用户输入了就用输入的单 key；否则用 .env 解析出的多 key 数组做负载均衡。
  // A user-entered key takes precedence; otherwise the multi-key array parsed
  // from .env is used for load balancing.
  const token: string | string[] = userInput || defaultTiandituTokens
  const firstToken = userInput || defaultTiandituTokens[0] || ""
  const urls = firstToken ? getTiandituTerrainUrls(firstToken) : []

  if (!firstToken || urls.length === 0) {
    setStatus(t({ zh: "请先输入天地图 tk，或在 .env 中配置 VITE_TIANDITU_TOKEN。", en: "Enter Tianditu tk or set VITE_TIANDITU_TOKEN." }))
    return null
  }

  return {
    type: "tianditu",
    token,
    urls,
    tileLoading: {
      enableTileSplitting: true,
    },
  }
}

function createIonTerrainOptions(): TerrainOptions | null {
  const assetId = ionTerrainAssetIdField.value.trim()
  const apiToken = ionTerrainTokenField.value.trim() || DEFAULT_ION_TOKEN

  if (!assetId || !apiToken) {
    setStatus(t({ zh: "请先输入 Cesium Ion terrain asset id 和 token，或在 .env 中配置默认值。", en: "Enter Ion terrain asset id and token, or set defaults." }))
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
  return getSelectedTerrainSource() === "tianditu"
    ? createTiandituTerrainOptions()
    : createIonTerrainOptions()
}

function syncTerrainSourceFields() {
  const source = getSelectedTerrainSource()
  const isTianditu = source === "tianditu"

  tiandituTerrainFieldGroup.hidden = !isTianditu
  tiandituTokenField.disabled = !isTianditu
  if (tiandituTerrainHint) {
    tiandituTerrainHint.hidden = !isTianditu
  }
  ionTerrainAssetIdField.disabled = isTianditu
  ionTerrainTokenField.disabled = isTianditu
  ionTerrainFieldGroup.hidden = isTianditu
}

function enableSelectedTerrain() {
  const terrain = createSelectedTerrainOptions()
  if (!terrain) {
    terrainEnabledControl.checked = false
    return
  }

  viewer.setTerrain(terrain)
  setStatus(
    getSelectedTerrainSource() === "tianditu"
      ? t({ zh: "天地图 swdx 地形已通过 viewer.setTerrain 加载。", en: "Tianditu swdx terrain loaded via viewer.setTerrain." })
      : t({ zh: "Cesium Ion 地形已通过 viewer.setTerrain 加载。", en: "Cesium Ion terrain loaded via viewer.setTerrain." })
  )
}

function disableTerrain() {
  viewer.setTerrain(null)
  setStatus(t({ zh: "地形已关闭，Viewer 已切回无地形模式。", en: "Terrain off; Viewer is in no-terrain mode." }))
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
      getSelectedTerrainSource() === "tianditu"
        ? t({ zh: "已选择天地图 swdx 地形，勾选后加载 elv_c 高程瓦片。", en: "Tianditu swdx selected; enable to load elv_c elevation tiles." })
        : t({ zh: "已选择 Cesium Ion 地形来源，勾选后加载 terrain asset。", en: "Cesium Ion selected; enable to load terrain asset." })
    )
  }
})

terrainEnabledControl.addEventListener("change", syncTerrainEnabledState)

tiandituTokenField.addEventListener("keydown", (event) => {
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

if (preferIonInDev) {
  terrainEnabledControl.checked = true
  enableSelectedTerrain()
  setStatus(t({ zh: "本地开发已默认加载 Cesium Ion 地形。可手动切换到天地图 swdx（需 key 开通三维地形且域名白名单含当前页面来源）。", en: "Dev default: Cesium Ion terrain. Switch to Tianditu swdx if key allows 3D terrain and domain whitelist includes this origin." }))
} else if (defaultTiandituToken) {
  terrainEnabledControl.checked = true
  enableSelectedTerrain()
  setStatus(t({ zh: "已从天地图 swdx 默认配置自动加载地形；也可以切换到 Cesium Ion 地形。", en: "Auto-loaded Tianditu swdx; you can switch to Cesium Ion." }))
} else if (DEFAULT_ION_TOKEN) {
  terrainSourceField.value = "cesium-ion"
  syncTerrainSourceFields()
  terrainEnabledControl.checked = true
  enableSelectedTerrain()
  setStatus(t({ zh: "未检测到 VITE_TIANDITU_TOKEN，已从 Cesium Ion 默认配置自动加载地形。", en: "No VITE_TIANDITU_TOKEN; auto-loaded Cesium Ion defaults." }))
} else {
  setStatus(t({ zh: "请配置 VITE_TIANDITU_TOKEN，或输入天地图 tk / Cesium Ion 凭据后加载。", en: "Set VITE_TIANDITU_TOKEN, or enter Tianditu tk / Ion credentials." }))
}

window.addEventListener("beforeunload", () => {
  viewer.destroy()
})
