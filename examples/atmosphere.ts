import tellux from '../src'
import { bootExampleI18n } from './i18n'
import { exampleMapServiceConfig } from './shared'
import { setupExamplePanels } from './example-panel'

bootExampleI18n()
setupExamplePanels()

const container = document.querySelector('#viewer')
const dujiangyanButton = document.querySelector<HTMLButtonElement>('#dujiangyan')
const himalayaButton = document.querySelector<HTMLButtonElement>('#himalaya')

const initialDaytimeHourUTC = 5

const dujiangyanView = {
  latitude: 31.025122345612274,
  longitude: 103.55132903720038,
  height: 2003.9716012054323,
  heading: -122.64353116544416,
  pitch: -14.837941851547878,
  roll: 0.00004662245553609294,
  clouds: {
    layerAltitude: 2500,
    layerHeight: 650
  }
}

// 近地视角，高度与紫坪铺水库同量级；略抬高以避开珠峰附近地形。
// Near-surface view at Zipingpu-like altitude; slightly raised for Everest terrain.
const himalayaView = {
  latitude: 27.98,
  longitude: 86.92,
  height: 6500,
  heading: -40,
  pitch: -16,
  roll: 0,
  clouds: {
    layerAltitude: 8500,
    layerHeight: 200
  }
}

if (!(container instanceof HTMLElement)) {
  throw new Error('Viewer container not found.')
}

if (!dujiangyanButton || !himalayaButton) {
  throw new Error('Atmosphere controls not found.')
}

const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: '/draco/gltf/',
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  layers: [
    {
      source: exampleMapServiceConfig.createImagerySource()
    }
  ],
  camera: {
    ...dujiangyanView,
    far: 8000000
  },
  scene: {
    atmosphere: {
      show: true,
      lighting: {
        mode: 'post-process'
      }
    },
    clouds: {
      show: true,
      coverage: 0.35
    },
  },
  resolutionScale: 1
})

viewer.clock.setHourUTC(initialDaytimeHourUTC)
viewer.scene.clouds.layerAltitude = dujiangyanView.clouds.layerAltitude
viewer.scene.clouds.layerHeight = dujiangyanView.clouds.layerHeight
;(window as any).viewer = viewer

function applyLocationView(view: typeof dujiangyanView | typeof himalayaView) {
  viewer.scene.clouds.layerAltitude = view.clouds.layerAltitude
  viewer.scene.clouds.layerHeight = view.clouds.layerHeight
  viewer.camera.flyTo({
    destination: {
      latitude: view.latitude,
      longitude: view.longitude,
      height: view.height
    },
    orientation: {
      heading: view.heading,
      pitch: view.pitch,
      roll: view.roll
    }
  })
}

dujiangyanButton.addEventListener('click', () => {
  applyLocationView(dujiangyanView)
})

himalayaButton.addEventListener('click', () => {
  applyLocationView(himalayaView)
})

window.addEventListener('beforeunload', () => {
  viewer.destroy()
})
