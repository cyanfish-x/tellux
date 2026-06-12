import tellux from '../src'

const HERO_CLOCK_TIME = new Date(1780747337456)
const DEFAULT_ION_TERRAIN_ASSET_ID =
  import.meta.env.VITE_CESIUM_ION_TERRAIN_ASSET_ID ?? '1'
const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ''
const arcgisWorldImageryUrl =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

tellux.baseUrl = '/tellux/'

const nav = document.querySelector('.portal-nav')
const docsLink = document.querySelector<HTMLAnchorElement>('[data-docs-link]')
const globeContainer = document.querySelector('#portal-globe-viewer')

const getDocsUrl = () => {
  const isLocalExamplesDev =
    (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') &&
    window.location.port === '5173'

  if (isLocalExamplesDev) {
    return 'http://127.0.0.1:5174/docs/'
  }

  return new URL('./docs/', window.location.href).toString()
}

if (docsLink) {
  docsLink.href = getDocsUrl()
}

if (nav instanceof HTMLElement) {
  const updateNavigationSurface = () => {
    nav.toggleAttribute('data-scrolled', window.scrollY > 24)
  }

  updateNavigationSurface()
  window.addEventListener('scroll', updateNavigationSurface, { passive: true })
}

document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const targetId = link.getAttribute('href')
    if (!targetId || targetId === '#') {
      return
    }

    const target = document.querySelector(targetId)
    if (!(target instanceof HTMLElement)) {
      return
    }

    event.preventDefault()
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
})

if (globeContainer instanceof HTMLElement) {
  const viewer = new tellux.Viewer(globeContainer, {
    dracoDecoderPath: '/draco/gltf/',
    terrain: DEFAULT_ION_TOKEN
      ? {
          type: 'cesium-ion',
          assetId: DEFAULT_ION_TERRAIN_ASSET_ID,
          apiToken: DEFAULT_ION_TOKEN,
          tileLoading: {
            enableTileSplitting: true
          }
        }
      : undefined,
    layers: [
      {
        source: {
          type: 'xyz',
          url: arcgisWorldImageryUrl,
          levels: 19
        }
      }
    ],
    camera: {
      latitude: 22.43553679586459,
      longitude: 150.70922294685923,
      height: 1744994.2899068573,
      heading: -34.957906111869555,
      pitch: -39.21757772672109,
      roll: 0.021620386152015957,
      far: 8000000
    },
    scene: {
      atmosphere: {
        show: true
      },
      clouds: {
        show: true,
        coverage: 0.35
      },
      postProcess: {
        lensFlare: true,
        smaa: true,
        toneMappingExposure: 8
      }
    },
    resolutionScale: Math.min(window.devicePixelRatio, 1.5)
  })

  viewer.scene.clouds.layerAltitude = 1500
  viewer.scene.clouds.layerHeight = 650
  viewer.clock.currentTime = HERO_CLOCK_TIME
  viewer.clock.animate = false
  ;(window as any).viewer = viewer
  ;(window as any).portalViewer = viewer

  window.addEventListener('beforeunload', () => {
    viewer.destroy()
  })
}
