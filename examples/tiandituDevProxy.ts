/** 天地图 swdx / DataServer 子域名编号。Tianditu subdomain ids. */
export const TIANDITU_SUBDOMAINS = ["0", "1", "2", "3", "4", "5", "6", "7"] as const

/**
 * 本地 Vite 代理前缀。浏览器请求 `/tianditu-t/{n}/...`，开发服务器再转发到
 * `https://t{n}.tianditu.gov.cn/...`，并带上已备案域名的 Referer。
 *
 * Local Vite proxy prefix. The browser requests `/tianditu-t/{n}/...`; the
 * dev server forwards to `https://t{n}.tianditu.gov.cn/...` with a
 * whitelisted Referer.
 */
export const TIANDITU_DEV_TILE_PROXY_PREFIX = "/tianditu-t"
