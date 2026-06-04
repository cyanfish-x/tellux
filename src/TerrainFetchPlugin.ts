const GZIP_ID1 = 0x1f
const GZIP_ID2 = 0x8b

/**
 * 为本地 quantized-mesh 地形瓦片提供 gzip 兜底解压。
 *
 * 一些静态服务会直接托管已经 gzip 压缩的 `.terrain` 文件，但没有返回
 * `Content-Encoding: gzip`。浏览器不会自动解压这类响应，3d-tiles-renderer
 * 随后会把 gzip 字节当作 quantized-mesh 二进制解析。
 *
 * Provides fallback gzip decompression for local quantized-mesh terrain tiles.
 *
 * Some static servers host pre-gzipped `.terrain` files without returning
 * `Content-Encoding: gzip`. Browsers do not decompress those responses
 * automatically, so 3d-tiles-renderer would otherwise parse gzip bytes as
 * quantized-mesh binary data.
 */
export class TerrainFetchPlugin {
  readonly name = 'TELLUX_TERRAIN_FETCH_PLUGIN'

  private readonly inheritedSearchParams: URLSearchParams

  constructor(terrainUrl: string) {
    this.inheritedSearchParams = new URL(terrainUrl, location.href).searchParams
  }

  preprocessURL(url: string | URL) {
    if (!this.hasInheritedSearchParams()) return url

    const requestUrl = new URL(url, location.href)
    if (!this.isTerrainUrl(requestUrl)) return url

    this.inheritedSearchParams.forEach((value, key) => {
      if (!requestUrl.searchParams.has(key)) {
        requestUrl.searchParams.set(key, value)
      }
    })

    return requestUrl.toString()
  }

  fetchData(url: string | URL, options?: RequestInit) {
    const requestUrl = String(url)
    if (!this.isTerrainDataUrl(requestUrl)) return null

    return this.fetchTerrainData(url, options)
  }

  private hasInheritedSearchParams() {
    return Array.from(this.inheritedSearchParams).length > 0
  }

  private isTerrainUrl(url: URL) {
    return this.isLayerUrl(url.pathname) || this.isTerrainDataUrl(url.pathname)
  }

  private isLayerUrl(url: string) {
    return /\/layer\.json$/i.test(url)
  }

  private isTerrainDataUrl(url: string) {
    return /\.terrain(?:[?#]|$)/i.test(url)
  }

  private async fetchTerrainData(url: string | URL, options?: RequestInit) {
    const response = await fetch(url, options)
    if (!response.ok) return response

    const buffer = await response.arrayBuffer()
    if (!this.isGzip(buffer)) return buffer

    return this.decompressGzip(buffer)
  }

  private isGzip(buffer: ArrayBuffer) {
    if (buffer.byteLength < 2) return false

    const bytes = new Uint8Array(buffer, 0, 2)
    return bytes[0] === GZIP_ID1 && bytes[1] === GZIP_ID2
  }

  private async decompressGzip(buffer: ArrayBuffer) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error(
        'Tellux terrain loader: received gzip-compressed .terrain bytes without Content-Encoding: gzip, but this browser does not support DecompressionStream.'
      )
    }

    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
    return new Response(stream).arrayBuffer()
  }
}
