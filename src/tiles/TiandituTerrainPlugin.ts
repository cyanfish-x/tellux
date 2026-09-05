import { Vector3 } from 'three'
import { TilingScheme } from '3d-tiles-renderer/src/three/plugins/images/utils/TilingScheme.js'
import { ProjectionScheme } from '3d-tiles-renderer/src/three/plugins/images/utils/ProjectionScheme.js'
import {
  createFlatTiandituHeights,
  decompressTiandituTerrainBuffer,
  decodeTiandituElvC,
  TiandituHeightmapLoader
} from './TiandituHeightmapLoader'
import { parseTiandituServiceError } from './TiandituSlippyTile'

const TILE_X = Symbol('TILE_X')
const TILE_Y = Symbol('TILE_Y')
const TILE_LEVEL = Symbol('TILE_LEVEL')
const TILE_AVAILABLE = Symbol('TILE_AVAILABLE')
const TILE_SPLIT_SOURCE_SCENE = Symbol('TILE_SPLIT_SOURCE_SCENE')

const INITIAL_HEIGHT_RANGE = 1e4
const DEFAULT_TOP_LEVEL = 5
const DEFAULT_BOTTOM_LEVEL = 12
const DEFAULT_SUBDOMAINS = ['0', '1', '2', '3', '4', '5', '6', '7']
const FLAT_TILE_URI = 'tianditu.flat.terrain'
const MIN_TERRAIN_TILE_BYTES = 1000
const SHARD_X = 31
const SHARD_Y = 257
const SHARD_LEVEL = 6151
const _vec = new Vector3()

export type TiandituTerrainPluginOptions = {
  /**
   * 天地图 tk 密钥，支持单个或多个。传多个时按瓦片坐标确定性分片做
   * 负载均衡，避免单 key 额度被快速耗尽。
   *
   * Tianditu API token (`tk`), single or multiple. When multiple are provided,
   * tiles are sharded deterministically by coordinates for load balancing.
   */
  apiToken: string | string[]
  urls?: string[]
  subdomains?: string[]
  topLevel?: number
  bottomLevel?: number
  useRecommendedSettings?: boolean
  skirtLength?: number | null
  generateNormals?: boolean
}

/**
 * 把单个或多个 token 归一化为去重、去空后的数组。空输入返回空数组。
 *
 * Normalizes a single token or a list into a deduped, non-empty array. Empty
 * input returns an empty array.
 */
function resolveTiandituTokens(token: string | string[] | undefined): string[] {
  if (!token) return []
  const raw = Array.isArray(token) ? token : [token]
  const seen = new Set<string>()
  const result: string[] = []
  for (const piece of raw) {
    const value = piece.trim()
    if (value && !seen.has(value)) {
      seen.add(value)
      result.push(value)
    }
  }
  return result
}

function buildDefaultUrls(token: string, subdomains: string[]) {
  return subdomains.map(
    (subdomain) => `https://t${subdomain}.tianditu.gov.cn/mapservice/swdx?T=elv_c&tk=${token}`
  )
}

/**
 * 确定性分片索引：同一瓦片坐标永远得到同一索引，保证浏览器缓存命中。
 *
 * Deterministic shard index: the same tile coordinates always yield the same
 * index, keeping URLs stable and cache-friendly.
 */
function tiandituShardIndex(x: number, y: number, level: number): number {
  return x * SHARD_X + y * SHARD_Y + level * SHARD_LEVEL
}

function buildTileContentUri(tileX: number, tileY: number, zoom: number, flat: boolean) {
  if (flat) {
    return FLAT_TILE_URI
  }

  const params = new URLSearchParams({
    x: String(tileX),
    y: String(tileY),
    l: String(zoom)
  })
  return `tianditu.terrain?${params.toString()}`
}

export class TiandituTerrainPlugin {
  readonly name = 'TELLUX_TIANDITU_TERRAIN_PLUGIN'
  readonly priority = -1000

  private readonly token: string
  private readonly tokens: string[]
  private readonly urls: string[]
  private readonly topLevel: number
  private readonly bottomLevel: number
  private readonly useRecommendedSettings: boolean
  private readonly skirtLength: number | null
  private readonly generateNormals: boolean
  private lastServiceError: string | null = null

  private tiles: {
    ellipsoid: import('3d-tiles-renderer/three').Ellipsoid
    manager: import('three').LoadingManager
    fetchOptions: RequestInit
    errorTarget: number
    rootURL: string
    invokeAllPlugins: (callback: (plugin: { preprocessURL?: (url: string | URL) => string | URL }) => void) => void
    preprocessTileset: (tileset: object, baseUrl: string) => void
    processNodeQueue: { remove: (tile: object) => void }
  } | null = null

  private readonly tiling = new TilingScheme()
  // 与 Cesium GeoTerrainProvider / GeographicTilingScheme 一致：EPSG:4326，
  // level0 为 2×1；swdx 的 x/y 是地理瓦片坐标，不是 Web Mercator slippy。
  // Matches Cesium GeoTerrainProvider / GeographicTilingScheme: EPSG:4326 with a
  // 2×1 level-0 grid. swdx x/y are geographic tile indices, not Web Mercator.
  private readonly projection = new ProjectionScheme('EPSG:4326')

  constructor(options: TiandituTerrainPluginOptions) {
    const tokens = resolveTiandituTokens(options.apiToken)
    if (tokens.length === 0) {
      throw new Error('TiandituTerrainPlugin: apiToken is required.')
    }

    const subdomains = options.subdomains ?? DEFAULT_SUBDOMAINS
    this.tokens = tokens
    this.token = tokens[0]
    this.urls = options.urls?.length
      ? options.urls
      : buildDefaultUrls(tokens[0], subdomains)
    this.topLevel = options.topLevel ?? DEFAULT_TOP_LEVEL
    this.bottomLevel = options.bottomLevel ?? DEFAULT_BOTTOM_LEVEL
    this.useRecommendedSettings = options.useRecommendedSettings ?? true
    this.skirtLength = options.skirtLength ?? null
    this.generateNormals = options.generateNormals ?? true
  }

  init(tiles: NonNullable<TiandituTerrainPlugin['tiles']>) {
    if (this.useRecommendedSettings) {
      tiles.errorTarget = 2
    }

    this.tiles = tiles
  }

  loadRootTileset() {
    const { tiles } = this
    if (!tiles) {
      throw new Error('TiandituTerrainPlugin: plugin is not initialized.')
    }

    const { tiling, projection } = this
    projection.setScheme('EPSG:4326')
    // 天地图官方 / Cesium GeographicTilingScheme：y=0 在北极。
    // 3d-tiles-renderer 默认 flipY=false 时 y=0 在南极，直接拿去请求 swdx 会得到空包。
    // Official Tianditu / Cesium GeographicTilingScheme: y=0 at the north pole.
    // With the default flipY=false, y=0 is at the south pole — those swdx requests return empty bodies.
    tiling.flipY = true
    tiling.setProjection(projection)
    tiling.generateLevels(this.bottomLevel, projection.tileCountX, projection.tileCountY)

    const children = []
    for (let x = 0; x < projection.tileCountX; x++) {
      for (let y = 0; y < projection.tileCountY; y++) {
        const child = this.createChild(0, x, y)
        if (child) {
          children.push(child)
        }
      }
    }

    const tileset = {
      asset: {
        version: '1.1'
      },
      geometricError: Infinity,
      root: {
        refine: 'REPLACE',
        geometricError: Infinity,
        boundingVolume: {
          region: [...tiling.getContentBounds(), -INITIAL_HEIGHT_RANGE, INITIAL_HEIGHT_RANGE]
        },
        children,
        [TILE_AVAILABLE]: null,
        [TILE_LEVEL]: -1
      }
    }

    let baseUrl = tiles.rootURL
    tiles.invokeAllPlugins((plugin: { preprocessURL?: (url: string | URL, tile: unknown) => string | URL }) => {
      if (plugin.preprocessURL) {
        baseUrl = String(plugin.preprocessURL(baseUrl, null))
      }
    })
    tiles.preprocessTileset(tileset, baseUrl)

    return Promise.resolve(tileset)
  }

  parseToMesh(
    buffer: ArrayBuffer,
    tile: {
      boundingVolume: { region: number[] }
      geometricError: number
      parent?: { boundingVolume: { region: number[] }; engineData: { scene?: object } }
      engineData: { boundingVolume: { setRegionData: (...args: number[]) => void } }
      children: object[]
      internal: { virtualChildCount: number }
      [key: symbol]: unknown
    },
    extension: string
  ) {
    const tiles = this.tiles
    if (!tiles || extension !== 'terrain') {
      return
    }

    const [west, south, east, north] = tile.boundingVolume.region
    const heights =
      buffer.byteLength === 0
        ? createFlatTiandituHeights()
        : decodeTiandituElvC(buffer)

    const loader = new TiandituHeightmapLoader({
      ellipsoid: tiles.ellipsoid,
      minLat: south,
      minLon: west,
      maxLat: north,
      maxLon: east,
      skirtLength: this.skirtLength ?? tile.geometricError,
      generateNormals: this.generateNormals
    })
    const result = loader.parse(heights)

    const { minHeight, maxHeight } = result.userData
    tile.boundingVolume.region[4] = minHeight
    tile.boundingVolume.region[5] = maxHeight
    ;(
      tile.engineData.boundingVolume as {
        setRegionData: (ellipsoid: unknown, ...region: number[]) => void
      }
    ).setRegionData(tiles.ellipsoid, ...tile.boundingVolume.region)

    tile[TILE_SPLIT_SOURCE_SCENE] = result
    this.expandChildren(tile)

    return result
  }

  async fetchData(url: string | URL, options?: RequestInit) {
    const urlString = String(url)

    if (urlString.includes(FLAT_TILE_URI)) {
      return new ArrayBuffer(0)
    }

    if (!urlString.includes('tianditu.terrain')) {
      return null
    }

    const requestUrl = new URL(urlString, location.href)
    const tileX = Number(requestUrl.searchParams.get('x'))
    const tileY = Number(requestUrl.searchParams.get('y'))
    const zoom = Number(requestUrl.searchParams.get('l'))

    if (!Number.isFinite(tileX) || !Number.isFinite(tileY) || !Number.isFinite(zoom)) {
      throw new Error(`TiandituTerrainPlugin: invalid tile request URL "${urlString}".`)
    }

    const serviceUrl = this.buildServiceUrl(tileX, tileY, zoom)
    const response = await fetch(serviceUrl, options)
    if (!response.ok) {
      throw new Error(
        `TiandituTerrainPlugin: failed to load elv_c tile (${response.status} ${response.statusText}).`
      )
    }

    const buffer = await response.arrayBuffer()
    const serviceError = parseTiandituServiceError(buffer)
    if (serviceError) {
      this.reportServiceError(serviceError)
      throw new Error(`TiandituTerrainPlugin: ${serviceError}`)
    }

    if (buffer.byteLength < MIN_TERRAIN_TILE_BYTES) {
      // 天地图常对未授权 / 域名未备案 / 服务不可用返回 HTTP 200 + 空 body，
      // 而不是 403 JSON；影像 DataServer 仍可能正常。
      // 若直接 throw，REPLACE 细化会拆掉父瓦片却装不上子瓦片，出现大块蓝灰空洞。
      // 这里降级为平坦高程（与 FLAT_TILE_URI 相同），保证几何与影像仍可显示。
      //
      // Tianditu often returns HTTP 200 with an empty body (instead of a 403
      // JSON error) when the key lacks elevation access, the Referer domain is
      // not whitelisted, or swdx is unavailable — while imagery may still work.
      // Throwing here leaves REPLACE holes (parent disposed, children never
      // mesh). Fall back to flat heights (same as FLAT_TILE_URI) so geometry
      // and imagery overlays still render.
      this.reportServiceError(
        `elv_c tile response is too small (${buffer.byteLength} bytes); using flat fallback. ` +
          'Check that the tk has 三维地形 (swdx) access, the page origin is in the ' +
          'key domain whitelist, or switch to Cesium Ion / URL terrain.'
      )
      return new ArrayBuffer(0)
    }

    return decompressTiandituTerrainBuffer(buffer)
  }

  disposeTile(tile: {
    [key: symbol]: unknown
    children: object[]
    internal: { virtualChildCount: number }
  }) {
    const tiles = this.tiles
    if (!tiles) return

    delete tile[TILE_SPLIT_SOURCE_SCENE]

    if (TILE_AVAILABLE in tile) {
      const virtualChildCount = tile.internal.virtualChildCount
      const len = tile.children.length
      const start = len - virtualChildCount
      for (let i = start; i < len; i++) {
        tiles.processNodeQueue.remove(tile.children[i])
      }

      tile.children.length = 0
      tile.internal.virtualChildCount = 0
    }
  }

  private reportServiceError(message: string) {
    if (this.lastServiceError === message) {
      return
    }

    this.lastServiceError = message
    console.warn(`Tellux Tianditu terrain: ${message}`)
  }

  private buildServiceUrl(tileX: number, tileY: number, zoom: number) {
    const baseUrl = this.urls[(tileX + tileY) % this.urls.length]
    const url = new URL(baseUrl, location.href)

    if (!url.searchParams.has('T')) {
      url.searchParams.set('T', 'elv_c')
    }

    // 按瓦片坐标确定性选 token，多 key 负载均衡。
    // 同一瓦片始终命中同一 token，保证浏览器缓存不被破坏。
    //
    // Pick the token deterministically by tile coordinates for multi-key load
    // balancing. The same tile always resolves to the same token, preserving
    // browser caching.
    const idx = tiandituShardIndex(tileX, tileY, zoom)
    const tokenIdx =
      ((idx % this.tokens.length) + this.tokens.length) % this.tokens.length
    url.searchParams.set('tk', this.tokens[tokenIdx])

    url.searchParams.set('x', String(tileX))
    url.searchParams.set('y', String(tileY))
    url.searchParams.set('l', String(zoom))

    return url.toString()
  }

  private createChild(level: number, x: number, y: number) {
    const tiles = this.tiles
    if (!tiles) return null

    const { tiling, projection } = this
    const ellipsoid = tiles.ellipsoid
    const region = [...tiling.getTileBounds(x, y, level), -INITIAL_HEIGHT_RANGE, INITIAL_HEIGHT_RANGE]
    const [, south, , north, , maxHeight] = region
    const midLat = south > 0 !== north > 0 ? 0 : Math.min(Math.abs(south), Math.abs(north))

    ellipsoid.getCartographicToPosition(midLat, 0, maxHeight, _vec)
    _vec.z = 0

    const tileCountX = projection.tileCountX
    const maxRadius = Math.max(...ellipsoid.radius)
    const rootGeometricError = (maxRadius * 2 * Math.PI * 0.25) / (65 * tileCountX)
    const geometricError = rootGeometricError / 2 ** level
    const useFlatTile = level < this.topLevel
    // 与 demo GeoTerrainProvider 一致：URL 里 l={z}=level+1，x/y 为当前
    // Geographic 层级的瓦片索引（不是 Web Mercator，也不对 NW 角再做 slippy 转换）。
    // Same as demo GeoTerrainProvider: l={z}=level+1, while x/y are the Geographic
    // tile indices at `level` (not Web Mercator, no NW-corner slippy remapping).
    const requestLevel = level + 1

    return {
      [TILE_AVAILABLE]: null,
      [TILE_LEVEL]: level,
      [TILE_X]: x,
      [TILE_Y]: y,
      refine: 'REPLACE',
      geometricError,
      boundingVolume: { region },
      content: {
        uri: buildTileContentUri(x, y, requestLevel, useFlatTile)
      },
      children: []
    }
  }

  private expandChildren(tile: {
    [key: symbol]: unknown
    children: object[]
    internal: { virtualChildCount: number }
  }) {
    const level = tile[TILE_LEVEL] as number
    const x = tile[TILE_X] as number
    const y = tile[TILE_Y] as number

    if (level >= this.bottomLevel - 1) {
      return
    }

    for (let cx = 0; cx < 2; cx++) {
      for (let cy = 0; cy < 2; cy++) {
        const child = this.createChild(level + 1, 2 * x + cx, 2 * y + cy)
        if (child) {
          tile.children.push(child)
        }
      }
    }
  }
}
