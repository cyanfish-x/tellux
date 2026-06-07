import tellux from '../src'

const DEFAULT_TERRAIN_URL = import.meta.env.VITE_CESIUM_TERRAIN_URL ?? ''
const HERO_CLOCK_TIME = new Date(1780747337456)
const arcgisWorldImageryUrl =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

tellux.baseUrl = '/tellux/'

const nav = document.querySelector('.portal-nav')
const globeContainer = document.querySelector('#portal-globe-viewer')

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
    terrain: DEFAULT_TERRAIN_URL
      ? {
          url: DEFAULT_TERRAIN_URL,
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
      clouds: true,
      skyAtmosphere: true,
      cloudCoverage: 0.35,
      lensFlare: true,
      smaa: true,
      toneMappingExposure: 8
    },
    resolutionScale: Math.min(window.devicePixelRatio, 1.5)
  })

  viewer.scene.cloudLayerAltitude = 1500
  viewer.scene.cloudLayerHeight = 650
  viewer.clock.currentTime = HERO_CLOCK_TIME
  viewer.clock.animate = false
  ;(window as any).viewer = viewer
  ;(window as any).portalViewer = viewer

  window.addEventListener('beforeunload', () => {
    viewer.destroy()
  })
}
