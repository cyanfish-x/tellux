import tellux, { type CameraSetViewOptions, type Viewer, type ViewerOptions } from '../src'
import { createTelluxViewer } from './shared'

const container = document.querySelector('#viewer')
const buttonsContainer = document.querySelector('#source-buttons')
const sourceStatus = document.querySelector<HTMLElement>('#source-status')
const mvtOverlayToggle = document.querySelector<HTMLInputElement>('#mvt-overlay-toggle')
const cesiumIonToken = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined
const openInfraMapUrl = 'https://openinframap.org/tiles/{z}/{x}/{y}.pbf'

if (!(container instanceof HTMLElement)) {
  throw new Error('Viewer container not found.')
}

if (!(buttonsContainer instanceof HTMLElement)) {
  throw new Error('Source buttons container not found.')
}

if (!(mvtOverlayToggle instanceof HTMLInputElement)) {
  throw new Error('MVT overlay toggle not found.')
}

interface ImageryProviderExample {
  key: string
  label: string
  description: string
  notice?: string
  imageryProvider: NonNullable<ViewerOptions['imageryProvider']>
  camera?: CameraSetViewOptions
}

const imageryProviderExamples: ImageryProviderExample[] = [
  {
    key: 'template-url',
    label: 'XYZ 模板',
    description: 'TemplateUrlResource / ArcGIS World Imagery',
    imageryProvider: tellux.ImageryProvider.fromResource(
      tellux.TemplateUrlResource.fromUrl(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      )
    )
  },
  {
    key: 'cesium-ion',
    label: 'Cesium Ion',
    description: 'CesiumIonResource / asset 2275207',
    notice: cesiumIonToken ? undefined : '未检测到 VITE_CESIUM_ION_TOKEN，Cesium Ion Resource 可能无法加载。',
    imageryProvider: tellux.ImageryProvider.fromResource(
      tellux.CesiumIonResource.fromAssetId(2275207, {
        apiToken: cesiumIonToken ?? ''
      })
    )
  }
]

const openInfraMapOverlay = tellux.MVTResource.fromUrl(openInfraMapUrl, {
  levels: 15,
  resolution: 1024,
  getStyle(layerName, properties) {
    if (properties === null) {
      if (layerName === 'power_substation' || layerName === 'power_substation_point') return { order: 10 }
      if (layerName === 'power_line') return { order: 20 }
      if (layerName === 'power_tower' || layerName === 'power_pole') return { order: 30 }
      if (layerName === 'power_plant' || layerName === 'power_plant_point' || layerName === 'power_generator') return { order: 35 }
      return { order: 40 }
    }

    if (layerName === 'power_substation') {
      return { fill: 'rgba(2, 201, 213, 0.5)', stroke: '#000000', strokeWidth: 1, order: 10 }
    }

    if (layerName === 'power_substation_point') {
      return { fill: '#02c9d5', stroke: '#000000', strokeWidth: 1.2, radius: 4, order: 10 }
    }

    if (layerName === 'power_line') {
      return {
        stroke: '#e6b800',
        strokeWidth: 2,
        order: 20
      }
    }

    if (layerName === 'power_tower' || layerName === 'power_pole') {
      return { fill: '#ffffff', stroke: '#000000', strokeWidth: 1, radius: 3, order: 30 }
    }

    if (layerName === 'power_plant' || layerName === 'power_plant_point' || layerName === 'power_generator') {
      return { fill: 'rgba(34, 197, 94, 0.72)', stroke: '#052e16', strokeWidth: 1.2, radius: 4, order: 35 }
    }

    if (layerName.includes('pipeline')) {
      return { stroke: 'rgba(125, 211, 252, 0.72)', strokeWidth: 2, order: 38 }
    }

    return { visible: false }
  }
})

const mvtCamera: CameraSetViewOptions = {
  latitude: 31.2304,
  longitude: 121.4737,
  height: 120000,
  heading: -90,
  pitch: -62
}

const initialCamera = {
  latitude: 31.2304,
  longitude: 121.4737,
  height: 5000000,
  heading: -90,
  pitch: -45
}

let viewer: Viewer | null = null
let activeKey = imageryProviderExamples[0].key
const sourceButtonsContainer = buttonsContainer
const mvtToggle = mvtOverlayToggle

function createSourceButton(source: ImageryProviderExample) {
  const button = document.createElement('button')
  button.className = 'button'
  button.type = 'button'
  button.dataset.source = source.key
  button.textContent = source.label
  button.addEventListener('click', () => {
    switchImagerySource(source)
  })
  return button
}

function updateSourceReadout(source: ImageryProviderExample) {
  activeKey = source.key
  if (sourceStatus) {
    const overlayText = mvtToggle.checked ? '已叠加 OpenInfraMap MVT。' : '未叠加 MVT。'
    sourceStatus.textContent = source.notice
      ? `当前底图：${source.description}。${source.notice}${overlayText}`
      : `当前底图：${source.description}。${overlayText}`
  }

  sourceButtonsContainer.querySelectorAll<HTMLButtonElement>('[data-source]').forEach((button) => {
    const isActive = button.dataset.source === activeKey
    button.classList.toggle('button--active', isActive)
    button.setAttribute('aria-pressed', String(isActive))
  })
}

function switchImagerySource(source: ImageryProviderExample) {
  if (!viewer) {
    viewer = createTelluxViewer(container as HTMLElement, {
      imageryProvider: source.imageryProvider,
      camera: source.camera ?? initialCamera,
      imageryOverlays: mvtToggle.checked ? [openInfraMapOverlay] : [],
      scene: {
        clouds: false,
        lensFlare: false,
        toneMappingExposure: 7
      }
    })
  } else {
    viewer.setImageryProvider(source.imageryProvider)
    viewer.setImageryOverlays(mvtToggle.checked ? [openInfraMapOverlay] : [])
    if (source.camera) {
      viewer.camera.setView(source.camera)
    }
  }

  updateSourceReadout(source)
}

imageryProviderExamples.forEach((source) => {
  sourceButtonsContainer.appendChild(createSourceButton(source))
})

mvtToggle.addEventListener('change', () => {
  if (!viewer) return

  viewer.setImageryOverlays(mvtToggle.checked ? [openInfraMapOverlay] : [])
  if (mvtToggle.checked) {
    viewer.camera.setView(mvtCamera)
  }
  updateSourceReadout(imageryProviderExamples.find((source) => source.key === activeKey) ?? imageryProviderExamples[0])
})

switchImagerySource(imageryProviderExamples[0])

window.addEventListener('beforeunload', () => {
  viewer?.destroy()
})
