import tellux from "../src"
import { arcgisWorldImageryUrl } from "./shared"

const DEFAULT_TERRAIN_URL = import.meta.env.VITE_CESIUM_TERRAIN_URL ?? ""

const container = document.querySelector("#viewer")
const terrainUrlInput = document.querySelector<HTMLInputElement>("#terrain-url")
const terrainToggle =
  document.querySelector<HTMLInputElement>("#terrain-toggle")
const terrainStatus = document.querySelector<HTMLElement>("#terrain-status")
const applyTerrainButton =
  document.querySelector<HTMLButtonElement>("#apply-terrain")
const clearTerrainButton =
  document.querySelector<HTMLButtonElement>("#clear-terrain")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

if (
  !terrainUrlInput ||
  !terrainToggle ||
  !applyTerrainButton ||
  !clearTerrainButton
) {
  throw new Error("Terrain controls not found.")
}

const terrainUrlField = terrainUrlInput
const terrainToggleControl = terrainToggle
const applyTerrainControl = applyTerrainButton
const clearTerrainControl = clearTerrainButton

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

;(window as any).viewer = viewer

terrainUrlField.value = DEFAULT_TERRAIN_URL
terrainToggleControl.checked = Boolean(DEFAULT_TERRAIN_URL)

function setStatus(message: string) {
  if (terrainStatus) terrainStatus.textContent = message
}

function getTerrainUrl() {
  return terrainUrlField.value.trim()
}

function enableTerrain() {
  const url = getTerrainUrl()
  if (!url) {
    terrainToggleControl.checked = false
    setStatus("请先输入 quantized-mesh 地形根目录或 layer.json 地址。")
    return
  }

  viewer.setTerrain({
    url,
    tileLoading: {
      enableTileSplitting: true,
    },
  })
  terrainToggleControl.checked = true
  setStatus("地形已开启，当前 tileset 已通过 setTerrain 热切换。")
}

function disableTerrain() {
  viewer.setTerrain(null)
  terrainToggleControl.checked = false
  setStatus("地形已关闭，Viewer 已切回无地形模式。")
}

applyTerrainControl.addEventListener("click", enableTerrain)
clearTerrainControl.addEventListener("click", disableTerrain)
terrainToggleControl.addEventListener("change", () => {
  if (terrainToggleControl.checked) {
    enableTerrain()
  } else {
    disableTerrain()
  }
})

terrainUrlField.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    enableTerrain()
  }
})

setStatus(
  DEFAULT_TERRAIN_URL
    ? "已从 VITE_CESIUM_TERRAIN_URL 初始化地形，可关闭后重新开启观察热切换。"
    : "未设置 VITE_CESIUM_TERRAIN_URL，可粘贴 terrain URL 后开启地形。"
)

window.addEventListener("beforeunload", () => {
  viewer.destroy()
})
