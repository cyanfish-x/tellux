import { createTelluxViewer } from './shared'

const container = document.querySelector('#viewer')
const pacificButton = document.querySelector<HTMLButtonElement>('#pacific')
const himalayaButton = document.querySelector<HTMLButtonElement>('#himalaya')

if (!(container instanceof HTMLElement)) {
  throw new Error('Viewer container not found.')
}

if (!pacificButton || !himalayaButton) {
  throw new Error('Atmosphere controls not found.')
}

const viewer = createTelluxViewer(
  container,
  {
    camera: {
      latitude: 22.8,
      longitude: 151.4,
      height: 760000,
      heading: -55,
      pitch: -38,
      far: 8000000
    },
    scene: {
      clouds: true,
      skyAtmosphere: true,
      cloudCoverage: 0.35,
      toneMappingExposure: 8,
      lensFlare: true,
      smaa: true
    },
    resolutionScale: 1
  },
  {
    hourUTC: 8,
    cloudLayerAltitude: 750,
    cloudLayerHeight: 650
  }
)

pacificButton.addEventListener('click', () => {
  viewer.camera.flyTo({
    destination: {
      latitude: 22.8,
      longitude: 151.4,
      height: 760000
    },
    orientation: {
      heading: -55,
      pitch: -38
    }
  })
})

himalayaButton.addEventListener('click', () => {
  viewer.camera.flyTo({
    destination: {
      latitude: 28.1,
      longitude: 86.9,
      height: 340000
    },
    orientation: {
      heading: -95,
      pitch: -32
    }
  })
})

window.addEventListener('beforeunload', () => {
  viewer.destroy()
})
