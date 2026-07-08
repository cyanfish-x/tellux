export const defaultTerrainUrl = import.meta.env.VITE_CESIUM_TERRAIN_URL ?? ""

export const defaultTiandituToken = import.meta.env.VITE_TIANDITU_TOKEN ?? ""

export function buildTiandituImageryXYZUrl(token = defaultTiandituToken): string {
  const base =
    "https://t0.tianditu.gov.cn/DataServer?T=img_w&x={x}&y={y}&l={z}"
  return token ? `${base}&tk=${token}` : base
}

/** 天地图卫星影像 XYZ 瓦片（img_w，Web Mercator）。 */
export const tiandituImageryXYZUrl = buildTiandituImageryXYZUrl()

export function showTokenNotice(element: HTMLElement | null) {
  if (!element) return

  element.textContent = defaultTiandituToken
    ? "当前示例使用天地图卫星影像 XYZ 瓦片。"
    : "当前示例使用天地图卫星影像 XYZ 瓦片，请配置 VITE_TIANDITU_TOKEN。"
}
