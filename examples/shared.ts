import tellux, { type ViewerOptions } from '../src'

export const cesiumIonToken = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined
tellux.baseUrl = '/tellux/'

export function createTelluxViewer(container: HTMLElement, options: ViewerOptions = {}) {
  return new tellux.Viewer(container, {
    imageryProvider: tellux.CesiumIonResource.fromAssetId(2275207, {
      apiToken: cesiumIonToken ?? ''
    }),
    dracoDecoderPath: '/node_modules/three/examples/jsm/libs/draco/gltf/',
    ...options
  })
}

export function showTokenNotice(element: HTMLElement | null) {
  if (!element || cesiumIonToken) return

  element.textContent = '未检测到 VITE_CESIUM_ION_TOKEN，Cesium Ion 资源可能无法加载。'
}
