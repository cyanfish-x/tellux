/**
 * 天地图多 token / 多子域确定性负载均衡工具。
 *
 * Deterministic load-balancing helpers for Tianditu across multiple tokens and
 * subdomains.
 *
 * 设计要点 / Design notes:
 *
 * 子域和 token 都由瓦片坐标确定性地绑定，绝不用计数器或随机轮换。
 * 这样同一瓦片 (x, y, level) 永远得到相同的 URL，浏览器缓存才能命中，
 * 否则会因 URL 变化反复请求同一瓦片，反而加速 token 额度消耗。
 *
 * Both the subdomain and the token are deterministically bound to the tile
 * coordinates, never round-robined or randomized. This keeps the URL for a
 * given tile stable so browser caching hits; otherwise the same tile would be
 * re-fetched under different URLs, burning quota faster.
 */

/** 天地图 swdx / DataServer 子域名编号。Tianditu subdomain ids. */
export const TIANDITU_SUBDOMAINS = ["0", "1", "2", "3", "4", "5", "6", "7"] as const

/**
 * 分片哈希常量。8 子域与 5 token 互质，分布天然错位均匀。
 *
 * Shard hash constants. 8 subdomains and 5 tokens are coprime, so the
 * distribution is naturally even and staggered.
 */
const SHARD_X = 31
const SHARD_Y = 257
const SHARD_LEVEL = 6151

/**
 * 把 `.env` 里的逗号分隔 token 串解析为去重、去空后的数组。
 *
 * Parses a comma-separated token string (as stored in `.env`) into a deduped,
 * non-empty token array.
 */
export function parseTiandituTokens(raw: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const piece of raw.split(",")) {
    const token = piece.trim()
    if (token && !seen.has(token)) {
      seen.add(token)
      result.push(token)
    }
  }
  return result
}

/**
 * 确定性分片索引：同一瓦片坐标永远得到同一索引。
 *
 * Deterministic shard index: the same tile coordinates always yield the same
 * index, which is what keeps URLs stable and cache-friendly.
 */
export function tiandituShardIndex(x: number, y: number, level: number): number {
  return x * SHARD_X + y * SHARD_Y + level * SHARD_LEVEL
}

/**
 * 在 tokens 上确定性取一个；tokens 为空时返回空串。
 *
 * Deterministically picks a token; returns an empty string when tokens is empty.
 */
export function pickTiandituToken(
  tokens: string[],
  x: number,
  y: number,
  level: number
): string {
  if (tokens.length === 0) return ""
  const idx = tiandituShardIndex(x, y, level)
  const normalized = ((idx % tokens.length) + tokens.length) % tokens.length
  return tokens[normalized]
}

/**
 * 把 `t0.tianditu.gov.cn` 这类子域替换为指定编号。
 *
 * Replaces the `tN` subdomain number in a `*.tianditu.gov.cn` host.
 */
function replaceTiandituSubdomain(host: string, subdomain: string): string {
  return host.replace(/t\d+(\.tianditu)/, `t${subdomain}$1`)
}

/**
 * 创建天地图卫星影像 XYZ 数据源（`img_w`，Web Mercator）。
 *
 * Creates a Tianditu satellite imagery XYZ source (`img_w`, Web Mercator) with
 * a `preprocessURL` that deterministically rotates the subdomain and token per
 * tile so that both concurrency and quota are balanced while keeping each
 * tile's URL stable for browser caching.
 *
 * `preprocessURL` 收到的是库已替换完 `{x}{y}{z}` 的完整 URL，天地图
 * DataServer 用 `l` 表示层级，这里从 query 解析 `x`/`y`/`l` 再算分片。
 *
 * The `preprocessURL` callback receives the full URL after `{x}{y}{z}`
 * substitution. Tianditu DataServer uses `l` for the level, so we parse
 * `x`/`y`/`l` from the query and compute the shard from those.
 */
export function createTiandituXYZImagerySource(tokens: string[]) {
  const tokenCount = tokens.length
  return {
    type: "xyz" as const,
    url: "https://t0.tianditu.gov.cn/DataServer?T=img_w&x={x}&y={y}&l={z}",
    projection: "EPSG:3857",
    levels: 18,
    preprocessURL: (url: string): string => {
      const parsed = new URL(url, location.href)
      const x = Number(parsed.searchParams.get("x"))
      const y = Number(parsed.searchParams.get("y"))
      const level = Number(parsed.searchParams.get("l") ?? parsed.searchParams.get("z"))

      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(level)) {
        const idx = tiandituShardIndex(x, y, level)
        const sub = TIANDITU_SUBDOMAINS[((idx % TIANDITU_SUBDOMAINS.length) + TIANDITU_SUBDOMAINS.length) % TIANDITU_SUBDOMAINS.length]
        parsed.hostname = replaceTiandituSubdomain(parsed.hostname, sub)
        if (tokenCount > 0) {
          const tokenIdx = ((idx % tokenCount) + tokenCount) % tokenCount
          parsed.searchParams.set("tk", tokens[tokenIdx])
        }
      }

      return parsed.toString()
    }
  }
}

/**
 * 创建天地图 WMTS 瓦片 URL 预处理函数，按瓦片坐标确定性轮换子域和 token。
 *
 * WMTS 请求用 `TileCol`/`TileRow`/`TileMatrix` 参数标识瓦片，这里从 query
 * 解析后算分片。dev 下走本地代理绕防盗链，prod 直连。
 *
 * Creates a Tianditu WMTS tile URL preprocessor that deterministically rotates
 * subdomain and token per tile. WMTS requests identify tiles via
 * `TileCol`/`TileRow`/`TileMatrix`, which are parsed from the query to compute
 * the shard. Routes through the local proxy in dev, connects directly in prod.
 */
export function createTiandituWmtsPreprocessURLSource(tokens: string[]) {
  const tokenCount = tokens.length
  return (url: string): string => {
    const parsed = new URL(url, location.href)
    const col = Number(parsed.searchParams.get("TileCol"))
    const row = Number(parsed.searchParams.get("TileRow"))
    const matrix = Number(parsed.searchParams.get("TileMatrix"))

    if (Number.isFinite(col) && Number.isFinite(row) && Number.isFinite(matrix)) {
      const idx = tiandituShardIndex(col, row, matrix)
      const sub = TIANDITU_SUBDOMAINS[((idx % TIANDITU_SUBDOMAINS.length) + TIANDITU_SUBDOMAINS.length) % TIANDITU_SUBDOMAINS.length]
      parsed.hostname = replaceTiandituSubdomain(parsed.hostname, sub)
      if (tokenCount > 0) {
        const tokenIdx = ((idx % tokenCount) + tokenCount) % tokenCount
        parsed.searchParams.set("tk", tokens[tokenIdx])
      }
    }

    return parsed.toString()
  }
}
