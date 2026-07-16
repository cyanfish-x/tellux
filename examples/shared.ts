export const defaultTerrainUrl = import.meta.env.VITE_CESIUM_TERRAIN_URL ?? ""

export const defaultTiandituToken = import.meta.env.VITE_TIANDITU_TOKEN ?? ""

export function buildTiandituImageryXYZUrl(token = defaultTiandituToken): string {
  const base =
    "https://t0.tianditu.gov.cn/DataServer?T=img_w&x={x}&y={y}&l={z}"
  return token ? `${base}&tk=${token}` : base
}

/** 天地图卫星影像 XYZ 瓦片（img_w，Web Mercator）。 */
export const tiandituImageryXYZUrl = buildTiandituImageryXYZUrl()

export function buildTiandituTerrainUrl(token = defaultTiandituToken): string {
  const base = "https://t0.tianditu.gov.cn/mapservice/swdx?T=elv_c"
  return token ? `${base}&tk=${token}` : base
}

/** 天地图 swdx 服务模板（不含 tk，用于示例展示）。 */
export const tiandituTerrainServiceTemplate =
  "https://t{s}.tianditu.gov.cn/mapservice/swdx?T=elv_c"

/** @deprecated 请改用 token + buildTiandituTerrainUrls；不要在 UI 中展示含 tk 的完整 URL。 */
export const tiandituTerrainUrl = buildTiandituTerrainUrl()

export const tiandituTerrainSubdomains = ["0", "1", "2", "3", "4", "5", "6", "7"]

export function buildTiandituTerrainUrls(token = defaultTiandituToken): string[] {
  return tiandituTerrainSubdomains.map(
    (subdomain) =>
      `https://t${subdomain}.tianditu.gov.cn/mapservice/swdx?T=elv_c${
        token ? `&tk=${token}` : ""
      }`
  )
}

export function showTokenNotice(element: HTMLElement | null) {
  if (!element) return

  element.textContent = defaultTiandituToken
    ? "当前示例使用天地图卫星影像 XYZ 瓦片。"
    : "当前示例使用天地图卫星影像 XYZ 瓦片，请配置 VITE_TIANDITU_TOKEN。"
}
