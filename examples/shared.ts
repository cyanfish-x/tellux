import {
  parseTiandituTokens,
  createTiandituXYZImagerySource,
  createTiandituWmtsPreprocessURLSource,
  buildTiandituTerrainServiceUrls,
} from "./tiandituLoadBalancer"
import {
  ARCGIS_WORLD_IMAGERY_URL,
  exampleMapServiceConfig,
} from "./map-sources"
import { t } from "./i18n"

export {
  exampleMapServiceConfig,
  exampleMapSourceProfile,
  createExampleMapServiceConfig,
  resolveMapSourceProfile,
  defaultTerrainUrl,
  defaultCesiumIonToken,
} from "./map-sources"
export type {
  ExampleMapServiceConfig,
  CreateExampleMapServiceConfigOptions,
  MapSourceProfileId,
} from "./map-sources"

export const arcgisWorldImageryUrl = ARCGIS_WORLD_IMAGERY_URL
export const defaultTiandituToken = import.meta.env.VITE_TIANDITU_TOKEN ?? ""

/**
 * 解析后的天地图 token 数组（去重、去空）。
 *
 * 本地开发通过 Vite 代理改写 Referer，浏览器端 key 的域名白名单可以继续
 * 只放线上域名。开发与生产都使用全部 token 做分片。
 *
 * Parsed Tianditu token array (deduped, non-empty). Local development rewrites
 * the Referer through a Vite proxy, so browser-side keys can keep a
 * production-only domain whitelist. Both development and production shard
 * across all tokens.
 */
export const defaultTiandituTokens = parseTiandituTokens(defaultTiandituToken)

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
 * 瓦片 URL 稳定以命中浏览器缓存。本地开发会改写到 Vite 代理。
 *
 * Creates a Tianditu satellite imagery XYZ source whose `preprocessURL`
 * deterministically rotates the subdomain and token per tile, breaking the
 * browser concurrency limit while sharing quota across keys, yet keeping each
 * tile's URL stable for browser caching. Local development rewrites to the
 * Vite proxy.
 */
export function createTiandituXYZImagery(
  tokens = defaultTiandituTokens
) {
  return createTiandituXYZImagerySource(tokens)
}

/**
 * 创建天地图 WMTS 瓦片 URL 预处理函数，按瓦片坐标确定性轮换子域和 token，
 * 本地开发走 Vite 代理并改写 Referer。
 *
 * Creates a Tianditu WMTS tile URL preprocessor that deterministically rotates
 * subdomain and token per tile, routing through the local Vite proxy in
 * development.
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
  return buildTiandituTerrainServiceUrls(token)
}

export function getTokenNoticeMessage() {
  if (exampleMapServiceConfig.profile === "local") {
    return t({
      zh: "当前示例使用 ArcGIS 卫星影像和 Cesium Ion 地形。改 map-sources.config.ts 的 localMapSourceProfile 可切到天地图。",
      en: "This example uses ArcGIS satellite imagery and Cesium Ion terrain. Change localMapSourceProfile in map-sources.config.ts to switch to Tianditu.",
    })
  }

  return defaultTiandituToken
    ? t({ zh: "当前示例使用天地图卫星影像 XYZ 瓦片。", en: "This example uses Tianditu satellite imagery XYZ tiles." })
    : t({ zh: "当前示例使用天地图卫星影像 XYZ 瓦片，请配置 VITE_TIANDITU_TOKEN。", en: "This example uses Tianditu satellite imagery XYZ tiles; please set VITE_TIANDITU_TOKEN." })
}

export function showTokenNotice(element: HTMLElement | null) {
  if (!element) return
  element.textContent = getTokenNoticeMessage()
}
