import { createTelluxViewer } from './shared'

const DEFAULT_TERRAIN_URL = import.meta.env.VITE_CESIUM_TERRAIN_URL ?? 'http://localhost/cesium_terrain/sichuan/'

const container = document.querySelector('#viewer')
const terrainUrlInput = document.querySelector<HTMLInputElement>('#terrain-url')
const terrainToggle = document.querySelector<HTMLInputElement>('#terrain-toggle')
const terrainStatus = document.querySelector<HTMLElement>('#terrain-status')
const applyTerrainButton = document.querySelector<HTMLButtonElement>('#apply-terrain')
const clearTerrainButton = document.querySelector<HTMLButtonElement>('#clear-terrain')

if (!(container instanceof HTMLElement)) {
  throw new Error('Viewer container not found.')
}

if (!terrainUrlInput || !terrainToggle || !applyTerrainButton || !clearTerrainButton) {
  throw new Error('Terrain controls not found.')
}

const viewer = createTelluxViewer(container, {
  camera: {
    latitude: 46.8523,
    longitude: -121.7603,
    height: 12000,
    heading: -35,
    pitch: -28
  },
  scene: {
    clouds: false,
    lensFlare: false,
    toneMappingExposure: 7
  },
  terrain: DEFAULT_TERRAIN_URL
    ? {
        url: DEFAULT_TERRAIN_URL
      }
    : undefined
})

terrainUrlInput.value = DEFAULT_TERRAIN_URL
terrainToggle.checked = Boolean(DEFAULT_TERRAIN_URL)

function setStatus(message: string) {
  if (terrainStatus) terrainStatus.textContent = message
}

function getTerrainUrl() {
  return terrainUrlInput.value.trim()
}

function enableTerrain() {
  const url = getTerrainUrl()
  if (!url) {
    terrainToggle.checked = false
    setStatus('请先输入 quantized-mesh 地形根目录或 layer.json 地址。')
    return
  }

  viewer.setTerrain({ url })
  terrainToggle.checked = true
  setStatus('地形已开启，当前 tileset 已通过 setTerrain 热切换。')
}

function disableTerrain() {
  viewer.setTerrain(null)
  terrainToggle.checked = false
  setStatus('地形已关闭，Viewer 已切回无地形模式。')
}

applyTerrainButton.addEventListener('click', enableTerrain)
clearTerrainButton.addEventListener('click', disableTerrain)
terrainToggle.addEventListener('change', () => {
  if (terrainToggle.checked) {
    enableTerrain()
  } else {
    disableTerrain()
  }
})

terrainUrlInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    enableTerrain()
  }
})

setStatus(
  DEFAULT_TERRAIN_URL
    ? '已从 VITE_CESIUM_TERRAIN_URL 初始化地形，可关闭后重新开启观察热切换。'
    : '未设置 VITE_CESIUM_TERRAIN_URL，可粘贴 terrain URL 后开启地形。'
)

window.addEventListener('beforeunload', () => {
  viewer.destroy()
})
