import tellux from '../src'
import { startMediumIntegration } from './rendering-prototypes/startMediumIntegration'

// A1：真实云源项 + 大气单次散射的联合积分实验，不是生产管线。
// A1: real cloud source plus single-scattering air; not the production pipeline.
const viewer = new tellux.Viewer(document.querySelector<HTMLElement>('#viewer')!, {
  useDefaultRenderLoop: false,
  clock: { currentTime: new Date('2026-03-20T12:00:00Z') },
  camera: { destination: { longitude: 0, latitude: 0, height: 3000 } },
  scene: {
    atmosphere: { lighting: { mode: 'light-source' }, scattering: { intensity: 1 } },
    clouds: { show: true }, surface: { materialMode: 'standard' },
  },
})
startMediumIntegration(viewer)
