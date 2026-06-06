import { createTelluxViewer } from './shared'

const container = document.querySelector('#viewer')
const dujiangyanButton = document.querySelector<HTMLButtonElement>('#dujiangyan')
const pacificButton = document.querySelector<HTMLButtonElement>('#pacific')
const himalayaButton = document.querySelector<HTMLButtonElement>('#himalaya')

const dujiangyanView = {
  latitude: 31.025122345612274,
  longitude: 103.55132903720038,
  height: 2003.9716012054323,
  heading: -122.64353116544416,
  pitch: -14.837941851547878,
  roll: 0.00004662245553609294
}

if (!(container instanceof HTMLElement)) {
  throw new Error('Viewer container not found.')
}

if (!dujiangyanButton || !pacificButton || !himalayaButton) {
  throw new Error('Atmosphere controls not found.')
}

const viewer = createTelluxViewer(
  container,
  {
    camera: {
      ...dujiangyanView,
      far: 8000000
    },
    scene: {
      clouds: true,
      skyAtmosphere: true,
      cloudCoverage: 0.35,
      atmosphereLightingMode: 'post-process',
      toneMappingExposure: 8,
      lensFlare: true,
      smaa: true
    },
    resolutionScale: 1
  },
  {
    cloudLayerAltitude: 1500,
    cloudLayerHeight: 650
  }
)

dujiangyanButton.addEventListener('click', () => {
  viewer.camera.flyTo({
    destination: {
      latitude: dujiangyanView.latitude,
      longitude: dujiangyanView.longitude,
      height: dujiangyanView.height
    },
    orientation: {
      heading: dujiangyanView.heading,
      pitch: dujiangyanView.pitch,
      roll: dujiangyanView.roll
    }
  })
})

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
