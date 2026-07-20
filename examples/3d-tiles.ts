import type { TilesetLayer } from "../src"
import tellux from "../src"
import { exampleMapServiceConfig } from "./shared"

type TilesetSource = "url" | "cesium-ion"

const container = document.querySelector("#viewer")
const tilesetSourceSelect =
  document.querySelector<HTMLSelectElement>("#tileset-source")
const urlTilesetFieldGroup = document.querySelector<HTMLElement>(
  "#url-tileset-fields"
)
const ionTilesetFieldGroup = document.querySelector<HTMLElement>(
  "#ion-tileset-fields"
)
const tilesetUrlInput = document.querySelector<HTMLInputElement>("#tileset-url")
const ionAssetIdInput =
  document.querySelector<HTMLInputElement>("#ion-asset-id")
const ionTokenInput = document.querySelector<HTMLInputElement>("#ion-token")
const visibleToggle =
  document.querySelector<HTMLInputElement>("#tileset-visible")
const flyToToggle = document.querySelector<HTMLInputElement>("#tileset-fly-to")
const statusElement = document.querySelector<HTMLElement>("#tileset-status")
const loadButton = document.querySelector<HTMLButtonElement>("#load-tileset")
const removeButton =
  document.querySelector<HTMLButtonElement>("#remove-tileset")

// 打包后直连数据源；开发服务器下走 vite proxy（/3dtiles -> https://data.cyanfish.site）避免跨域。
const PROD_TILESET_URL = "https://data.cyanfish.site/3dtiles/hk/tileset.json"
const DEV_TILESET_URL = "/3dtiles/hk/tileset.json"
const DEFAULT_TILESET_URL =
  import.meta.env.VITE_3D_TILESET_URL ??
  (import.meta.env.DEV ? DEV_TILESET_URL : PROD_TILESET_URL)
const DEFAULT_ION_ASSET_ID =
  import.meta.env.VITE_CESIUM_ION_3D_TILESET_ASSET_ID ?? "354307"
const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

if (
  !tilesetSourceSelect ||
  !urlTilesetFieldGroup ||
  !ionTilesetFieldGroup ||
  !tilesetUrlInput ||
  !ionAssetIdInput ||
  !ionTokenInput ||
  !visibleToggle ||
  !flyToToggle ||
  !loadButton ||
  !removeButton
) {
  throw new Error("3D Tiles controls not found.")
}

const tilesetSourceField = tilesetSourceSelect
const tilesetUrlField = tilesetUrlInput
const ionAssetIdField = ionAssetIdInput
const ionTokenField = ionTokenInput
const tilesetVisibleToggle = visibleToggle
const flyToTilesetToggle = flyToToggle
const loadControl = loadButton
const removeControl = removeButton

const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: "/draco/gltf/",
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  layers: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  scene: {
    atmosphere: {
      lighting: {
        mode: "post-process",
      },
    },
    clouds: {
      show: false,
    },
  },
  widgets: {
    timeline: true,
  },
})

;(window as any).viewer = viewer
viewer.clock.hourUTC = 10

tilesetUrlField.value = DEFAULT_TILESET_URL
ionAssetIdField.value = DEFAULT_ION_ASSET_ID
ionTokenField.value = ""
ionTokenField.placeholder = DEFAULT_ION_TOKEN
  ? "留空使用默认 token"
  : "输入 Cesium Ion token"

let activeLayer: TilesetLayer | null = null

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message
}

function getSelectedTilesetSource(): TilesetSource {
  return tilesetSourceField.value === "cesium-ion" ? "cesium-ion" : "url"
}

function syncTilesetSourceFields() {
  const isUrl = getSelectedTilesetSource() === "url"

  urlTilesetFieldGroup.hidden = !isUrl
  ionTilesetFieldGroup.hidden = isUrl
  tilesetUrlField.disabled = !isUrl
  ionAssetIdField.disabled = isUrl
  ionTokenField.disabled = isUrl
}

function clearActiveLayer() {
  activeLayer?.remove()
  activeLayer = null
}

function syncLayerVisibility() {
  if (activeLayer) {
    activeLayer.show = tilesetVisibleToggle.checked
  }
}

function activateLayer(layer: TilesetLayer, description: string) {
  activeLayer = layer
  syncLayerVisibility()
  if (flyToTilesetToggle.checked) {
    viewer.flyToTarget(layer.tileset, {
      heading: 30,
      pitch: -30,
    })
  }
  setStatus(`${description} 已加入场景。图层 id：${layer.id}`)
}

function loadUrlTileset() {
  const url = tilesetUrlField.value.trim()
  if (!url) {
    setStatus(
      "请先输入 tileset.json URL，或在 .env 中配置 VITE_3D_TILESET_URL。"
    )
    return
  }

  clearActiveLayer()
  activateLayer(
    viewer.load3DTileset({
      type: "url",
      id: "example-3d-tiles",
      url,
      // 香港摄影测量瓦片法线常缺失/不稳定；post-process 光照依赖 NormalPass，
      // 不开 creasedNormals 时 albedo 会被乘成接近 0，模型显示全黑。
      creasedNormals: true,
    }),
    "URL 3D Tiles"
  )
}

function loadIonTileset() {
  const assetId = ionAssetIdField.value.trim()
  const apiToken = ionTokenField.value.trim() || DEFAULT_ION_TOKEN

  if (!assetId || !apiToken) {
    setStatus("请先输入 Cesium Ion asset id 和 token，或在 .env 中配置默认值。")
    return
  }

  clearActiveLayer()
  activateLayer(
    viewer.load3DTileset({
      type: "cesium-ion",
      id: "example-3d-tiles",
      assetId,
      apiToken,
      creasedNormals: true,
    }),
    "Cesium Ion 3D Tiles"
  )
}

function loadSelectedTileset() {
  if (getSelectedTilesetSource() === "url") {
    loadUrlTileset()
    return
  }

  loadIonTileset()
}

tilesetSourceField.addEventListener("change", () => {
  syncTilesetSourceFields()
  setStatus(
    getSelectedTilesetSource() === "url"
      ? "已切换到 URL 加载；填写 tileset.json 地址后点击“加载”。"
      : "已切换到 Cesium Ion 加载；填写 asset id 和 token 后点击“加载”。"
  )
})

loadControl.addEventListener("click", loadSelectedTileset)

tilesetVisibleToggle.addEventListener("change", () => {
  syncLayerVisibility()
  setStatus(
    activeLayer
      ? `3D Tiles 已${tilesetVisibleToggle.checked ? "显示" : "隐藏"}。`
      : "还没有加载 3D Tiles。"
  )
})

removeControl.addEventListener("click", () => {
  clearActiveLayer()
  setStatus("3D Tiles 已移除。")
})

if (DEFAULT_TILESET_URL) {
  tilesetSourceField.value = "url"
} else if (DEFAULT_ION_ASSET_ID && DEFAULT_ION_TOKEN) {
  tilesetSourceField.value = "cesium-ion"
}

syncTilesetSourceFields()

if (DEFAULT_TILESET_URL && getSelectedTilesetSource() === "url") {
  loadUrlTileset()
  setStatus("已自动加载默认 3D Tiles；也可以替换 URL 后重新加载。")
} else if (
  DEFAULT_ION_ASSET_ID &&
  DEFAULT_ION_TOKEN &&
  getSelectedTilesetSource() === "cesium-ion"
) {
  setStatus("已读取 Cesium Ion 默认配置，可点击“加载”。")
} else {
  setStatus(
    getSelectedTilesetSource() === "url"
      ? "输入 tileset.json URL 后点击“加载”。"
      : "输入 Cesium Ion asset id 和 token 后点击“加载”。"
  )
}

window.addEventListener("beforeunload", () => {
  viewer.destroy()
})
