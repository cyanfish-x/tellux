import tellux from '../src'
import { arcgisWorldImageryUrl } from './shared'

const viewer = new tellux.Viewer('viewer', {
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
    latitude: 48,
    longitude: -82,
    height: 12000000,
    heading: 0,
    pitch: -90,
    far: 30000000
  },
  scene: {
    clouds: false,
    toneMappingExposure: 8
  }
})

;(window as any).viewer = viewer

window.addEventListener('beforeunload', () => {
  viewer.destroy()
})
