import tellux, { type Viewer, type ViewerOptions } from '../src'
import { createTelluxViewer } from './shared'

const container = document.querySelector('#viewer')
const buttonsContainer = document.querySelector('#source-buttons')
const sourceStatus = document.querySelector<HTMLElement>('#source-status')
const cesiumIonToken = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined

if (!(container instanceof HTMLElement)) {
  throw new Error('Viewer container not found.')
}

if (!(buttonsContainer instanceof HTMLElement)) {
  throw new Error('Source buttons container not found.')
}

interface ImageryProviderExample {
  key: string
  label: string
  description: string
  notice?: string
  imageryProvider: NonNullable<ViewerOptions['imageryProvider']>
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

const initialCamera = {
  latitude: 31.2304,
  longitude: 121.4737,
  height: 5000000,
  heading: -90,
  pitch: -45
}

let viewer: Viewer | null = null
let activeKey = imageryProviderExamples[0].key

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
    sourceStatus.textContent = source.notice ? `当前数据源：${source.description}。${source.notice}` : `当前数据源：${source.description}`
  }

  buttonsContainer.querySelectorAll<HTMLButtonElement>('[data-source]').forEach((button) => {
    const isActive = button.dataset.source === activeKey
    button.classList.toggle('button--active', isActive)
    button.setAttribute('aria-pressed', String(isActive))
  })
}

function switchImagerySource(source: ImageryProviderExample) {
  if (!viewer) {
    viewer = createTelluxViewer(container as HTMLElement, {
      imageryProvider: source.imageryProvider,
      camera: initialCamera,
      scene: {
        clouds: false,
        lensFlare: false,
        toneMappingExposure: 7
      }
    })
  } else {
    viewer.setImageryProvider(source.imageryProvider)
  }

  updateSourceReadout(source)
}

imageryProviderExamples.forEach((source) => {
  buttonsContainer.appendChild(createSourceButton(source))
})

switchImagerySource(imageryProviderExamples[0])

window.addEventListener('beforeunload', () => {
  viewer?.destroy()
})
