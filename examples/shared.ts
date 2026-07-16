import {
  parseTiandituTokens,
  createTiandituXYZImagerySource,
  createTiandituWmtsPreprocessURLSource
} from "./tiandituLoadBalancer"

export const defaultTerrainUrl = import.meta.env.VITE_CESIUM_TERRAIN_URL ?? ""

export const defaultTiandituToken = import.meta.env.VITE_TIANDITU_TOKEN ?? ""

/**
 * 解析后的天地图 token 数组（去重、去空）。
 *
 * 本地开发只用第一个 token：天地图 token 为「浏览器端」类型，且多数 key
 * 的域名白名单只配了线上域名，localhost 访问会 403。本地开发先用单个已
 * 通过白名单的 token，避免频繁撞防盗链；线上部署用全部 token 做分片。
 *
 * 生产构建（非 DEV）使用全部 token 做多 key 负载均衡。
 *
 * Parsed Tianditu token array (deduped, non-empty). Local dev uses only the
 * first token: Tianditu tokens are "browser-side" and most keys' domain
 * whitelists only allow the production domain, so localhost access is 403'd.
 * Local dev uses a single whitelisted token to avoid anti-hotlinking friction;
 * production uses all tokens for sharding.
 */
const allTiandituTokens = parseTiandituTokens(defaultTiandituToken)
export const defaultTiandituTokens = import.meta.env.DEV
  ? allTiandituTokens.slice(0, 1)
  : allTiandituTokens

export function buildTiandituImageryXYZUrl(token = defaultTiandituToken): string {
  const base =
    "https://t0.tianditu.gov.cn/DataServer?T=img_w&x={x}&y={y}&l={z}"
  return token ? `${base}&tk=${token}` : base
}

/** 天地图卫星影像 XYZ 瓦片（img_w，Web Mercator）。 */
export const tiandituImageryXYZUrl = buildTiandituImageryXYZUrl()

/**
 * 创建天地图卫星影像 XYZ 数据源，preprocessURL 内按瓦片坐标确定性轮换
 * 子域和 token，既突破浏览器并发限制又分摊单 key 额度，同时保证同一
 * 瓦片 URL 稳定以命中浏览器缓存。
 *
 * Creates a Tianditu satellite imagery XYZ source whose `preprocessURL`
 * deterministically rotates the subdomain and token per tile, breaking the
 * browser concurrency limit while sharing quota across keys, yet keeping each
 * tile's URL stable for browser caching.
 */
export function createTiandituXYZImagery(
  tokens = defaultTiandituTokens
) {
  return createTiandituXYZImagerySource(tokens)
}

/**
 * 创建天地图 WMTS 瓦片 URL 预处理函数，按瓦片坐标确定性轮换子域和 token，
 * dev 下走本地代理绕防盗链。
 *
 * Creates a Tianditu WMTS tile URL preprocessor that deterministically rotates
 * subdomain and token per tile, routing through the local proxy in dev.
 */
export function createTiandituWmtsPreprocessURL(tokens = defaultTiandituTokens) {
  return createTiandituWmtsPreprocessURLSource(tokens)
}

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
