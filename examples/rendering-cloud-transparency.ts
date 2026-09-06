import tellux from '../src'
import { startRenderingPrototype } from './rendering-prototypes/startRenderingPrototype'

// 实验：云与透明内容穿插。原型内部接口不能作为公开应用 API 使用。
// Boundary experiment; internal prototype seams are not public application APIs.
const container = document.querySelector<HTMLElement>('#viewer')!
const viewer = new tellux.Viewer(container, {
  useDefaultRenderLoop: false,
  clock: { currentTime: new Date('2026-03-20T12:00:00Z') },
  camera: { destination: { longitude: 0, latitude: 0, height: 4000 } },
  scene: {
    atmosphere: { lighting: { mode: 'light-source' }, scattering: { intensity: 1 } },
    clouds: { show: true },
    surface: { materialMode: 'standard' },
  },
})
void startRenderingPrototype(viewer, 'clouds')
