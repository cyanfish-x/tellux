import type { TilesetLayer } from '../src'
import { createTelluxViewer } from './shared'

const container = document.querySelector('#viewer')
const tilesetUrlInput = document.querySelector<HTMLInputElement>('#tileset-url')
const ionAssetIdInput = document.querySelector<HTMLInputElement>('#ion-asset-id')
const ionTokenInput = document.querySelector<HTMLInputElement>('#ion-token')
const visibleToggle = document.querySelector<HTMLInputElement>('#tileset-visible')
const flyToToggle = document.querySelector<HTMLInputElement>('#tileset-fly-to')
const statusElement = document.querySelector<HTMLElement>('#tileset-status')
const loadUrlButton = document.querySelector<HTMLButtonElement>('#load-url-tileset')
const loadIonButton = document.querySelector<HTMLButtonElement>('#load-ion-tileset')
const removeButton = document.querySelector<HTMLButtonElement>('#remove-tileset')

const DEFAULT_TILESET_URL = import.meta.env.VITE_3D_TILESET_URL ?? ''
const DEFAULT_ION_ASSET_ID = import.meta.env.VITE_CESIUM_ION_3D_TILESET_ASSET_ID ?? ''
const DEFAULT_ION_TOKEN = ''

if (!(container instanceof HTMLElement)) {
  throw new Error('Viewer container not found.')
}

if (!tilesetUrlInput || !ionAssetIdInput || !ionTokenInput || !visibleToggle || !flyToToggle || !loadUrlButton || !loadIonButton || !removeButton) {
  throw new Error('3D Tiles controls not found.')
}

const tilesetUrlField = tilesetUrlInput
const ionAssetIdField = ionAssetIdInput
const ionTokenField = ionTokenInput
const tilesetVisibleToggle = visibleToggle
const flyToTilesetToggle = flyToToggle
const loadUrlControl = loadUrlButton
const loadIonControl = loadIonButton
const removeControl = removeButton

const viewer = createTelluxViewer(container, {
  scene: {
    clouds: false,
    lensFlare: false,
    toneMappingExposure: 7
  }
})

tilesetUrlField.value = DEFAULT_TILESET_URL
ionAssetIdField.value = DEFAULT_ION_ASSET_ID
ionTokenField.value = DEFAULT_ION_TOKEN

let activeLayer: TilesetLayer | null = null

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message
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
    viewer.flyTo(layer.tileset)
  }
  setStatus(`${description} 已加入场景。图层 id：${layer.id}`)
}

loadUrlControl.addEventListener('click', () => {
  const url = tilesetUrlField.value.trim()
  if (!url) {
    setStatus('请先输入 tileset.json URL，或在 .env 中配置 VITE_3D_TILESET_URL。')
    return
  }

  clearActiveLayer()
  activateLayer(
    viewer.load3DTileset({
      type: 'url',
      id: 'example-3d-tiles',
      url
    }),
    'URL 3D Tiles'
  )
})

loadIonControl.addEventListener('click', () => {
  const assetId = ionAssetIdField.value.trim()
  const apiToken = ionTokenField.value.trim()

  if (!assetId || !apiToken) {
    setStatus('请先输入 Cesium Ion asset id 和 token，或在 .env 中配置默认值。')
    return
  }

  clearActiveLayer()
  activateLayer(
    viewer.load3DTileset({
      type: 'cesium-ion',
      id: 'example-3d-tiles',
      assetId,
      apiToken
    }),
    'Cesium Ion 3D Tiles'
  )
})

tilesetVisibleToggle.addEventListener('change', () => {
  syncLayerVisibility()
  setStatus(activeLayer ? `3D Tiles 已${tilesetVisibleToggle.checked ? '显示' : '隐藏'}。` : '还没有加载 3D Tiles。')
})

removeControl.addEventListener('click', () => {
  clearActiveLayer()
  setStatus('3D Tiles 已移除。')
})

if (DEFAULT_TILESET_URL) {
  setStatus('已读取 VITE_3D_TILESET_URL，可点击“加载 URL”。')
} else if (DEFAULT_ION_ASSET_ID && DEFAULT_ION_TOKEN) {
  setStatus('已读取 Cesium Ion 默认配置，可点击“加载 Cesium Ion”。')
} else {
  setStatus('输入 tileset.json URL，或配置 Cesium Ion asset id 和 token 后加载。')
}

window.addEventListener('beforeunload', () => {
  viewer.destroy()
})
