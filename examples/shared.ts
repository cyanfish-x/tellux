import tellux, { type ViewerOptions } from "../src"
const DEFAULT_TERRAIN_URL = import.meta.env.VITE_CESIUM_TERRAIN_URL ?? ""

tellux.baseUrl = "/tellux/"

export const arcgisWorldImageryUrl =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

export function createTelluxViewer(
  container: HTMLElement,
  options: ViewerOptions = {}
) {
  const viewer = new tellux.Viewer(container, {
    imageryProvider: tellux.ImageryProvider.fromResource(
      tellux.TemplateUrlResource.fromUrl(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      )
    ),
    dracoDecoderPath: "/node_modules/three/examples/jsm/libs/draco/gltf/",
    terrain: DEFAULT_TERRAIN_URL
      ? {
          url: DEFAULT_TERRAIN_URL,
        }
      : undefined,
    ...options,
  })
  //默认视角固定到川西
  viewer.camera.setView({
    latitude: 30.766820698598725,
    longitude: 103.24595155859873,
    height: 3677.122666944162,
    heading: 83.4376264544071,
    pitch: -12.746698381597836,
    roll: -0.00009952275437999403,
  })
  ;(window as any).viewer = viewer
  return viewer
}

export function showTokenNotice(element: HTMLElement | null) {
  if (!element) return

  element.textContent =
    "当前示例使用 TemplateUrlResource 加载 ArcGIS World Imagery。"
}
