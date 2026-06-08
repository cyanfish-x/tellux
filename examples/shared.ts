import tellux from "../src"

export const defaultTerrainUrl = import.meta.env.VITE_CESIUM_TERRAIN_URL ?? ""

tellux.baseUrl = "/tellux/"

export const arcgisWorldImageryUrl =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

export function showTokenNotice(element: HTMLElement | null) {
  if (!element) return

  element.textContent =
    "当前示例使用 XYZ 影像数据源加载 ArcGIS World Imagery。"
}
