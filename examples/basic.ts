import tellux from '../src'
import { arcgisWorldImageryUrl, defaultTerrainUrl, showTokenNotice } from './shared'

const container = document.querySelector('#viewer')
const tokenStatus = document.querySelector<HTMLElement>('#token-status')

if (!(container instanceof HTMLElement)) {
  throw new Error('Viewer container not found.')
}

showTokenNotice(tokenStatus)

const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: '/draco/gltf/',
  terrain: defaultTerrainUrl
    ? {
        url: defaultTerrainUrl
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
    latitude: 35.6812,
    longitude: 139.8,
    height: 650,
    heading: -90,
    pitch: -12
  },
  scene: {
    clouds: {
      show: false
    },
    postProcess: {
      toneMappingExposure: 8
    }
  }
})

;(window as any).viewer = viewer

document.querySelector('#tokyo')?.addEventListener('click', () => {
  viewer.camera.flyTo({
    destination: {
      latitude: 35.6812,
      longitude: 139.8,
      height: 650
    },
    orientation: {
      heading: -90,
      pitch: -12
    }
  })
})

document.querySelector('#shanghai')?.addEventListener('click', () => {
  viewer.camera.flyTo({
    destination: {
      latitude: 31.2304,
      longitude: 121.4737,
      height: 1200
    },
    orientation: {
      heading: -80,
      pitch: -18
    }
  })
})

window.addEventListener('beforeunload', () => {
  viewer.destroy()
})
