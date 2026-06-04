import tellux, { type ViewerOptions } from '../src'

tellux.baseUrl = '/tellux/'

export const arcgisWorldImageryUrl =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

export function createTelluxViewer(container: HTMLElement, options: ViewerOptions = {}) {
  return new tellux.Viewer(container, {
    imageryProvider: tellux.ImageryProvider.fromResource(tellux.TemplateUrlResource.fromUrl(arcgisWorldImageryUrl)),
    dracoDecoderPath: '/node_modules/three/examples/jsm/libs/draco/gltf/',
    ...options
  })
}

export function showTokenNotice(element: HTMLElement | null) {
  if (!element) return

  element.textContent = '当前示例使用 TemplateUrlResource 加载 ArcGIS World Imagery。'
}
