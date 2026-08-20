/**
 * 地形瓦片加载参数，用于调整地形 LOD 和影像贴图质量。
 *
 * Terrain tile loading options used to tune terrain LOD and imagery texture quality.
 */
export interface TerrainTileLoadingOptions {
  /**
   * 地形瓦片目标屏幕空间误差，默认 `1`。
   *
   * 值越小越倾向加载更高层级瓦片，但会增加请求、解析和渲染成本。
   *
   * Target screen-space error for terrain tiles. Defaults to `1`.
   *
   * Lower values prefer higher-detail tiles, but increase request, parsing, and
   * rendering cost.
   */
  errorTarget?: number
  /**
   * 每个地形瓦片合成影像纹理的画布分辨率，默认 `256`。
   *
   * 提高该值可改善影像贴到较大地形瓦片时的清晰度，但会增加 GPU 内存和合成成本。
   *
   * Canvas resolution used to composite imagery textures for each terrain tile.
   * Defaults to `256`.
   *
   * Higher values can improve imagery clarity on larger terrain tiles, but
   * increase GPU memory and compositing cost.
   */
  imageryResolution?: number
  /**
   * 是否允许影像插件拆分地形瓦片以贴合影像瓦片边界，默认 `false`。
   *
   * 开启后可提升影像边界和高层级贴图清晰度，但会生成额外虚拟瓦片。
   *
   * Allows the imagery plugin to split terrain tiles so they better match imagery
   * tile boundaries. Defaults to `false`.
   *
   * Enabling this can improve imagery boundary alignment and high-level texture
   * clarity, but creates additional virtual tiles.
   */
  enableTileSplitting?: boolean
}

/**
 * Cesium quantized-mesh 地形通用渲染配置。
 *
 * Shared Cesium quantized-mesh terrain rendering options.
 */
export interface TerrainRenderOptions {
  /**
   * 地形瓦片加载参数。
   *
   * 用于调节地形 LOD、地形上的影像合成分辨率和影像瓦片拆分。
   *
   * Terrain tile loading options.
   *
   * Tunes terrain LOD, imagery compositing resolution on terrain, and imagery
   * tile splitting.
   */
  tileLoading?: TerrainTileLoadingOptions
  /**
   * 是否应用 3d-tiles-renderer 推荐的地形加载设置，默认 `true`。
   *
   * Applies the terrain loading settings recommended by 3d-tiles-renderer.
   * Defaults to `true`.
   */
  useRecommendedSettings?: boolean
  /**
   * 地形裙边长度（米）。不传时使用瓦片 geometric error。
   *
   * Terrain skirt length in meters. When omitted, the tile geometric error is used.
   */
  skirtLength?: number | null
  /**
   * 是否混合裙边法线以平滑瓦片边缘，默认 `true`。
   *
   * Blends skirt normals for smoother tile edges. Defaults to `true`.
   */
  smoothSkirtNormals?: boolean
  /**
   * 是否为地形网格生成法线，默认 `true`。
   *
   * Generates normals for terrain meshes. Defaults to `true`.
   */
  generateNormals?: boolean
  /**
   * 是否生成封闭实体网格，默认 `false`。
   *
   * Generates a solid closed mesh. Defaults to `false`.
   */
  solid?: boolean
}

/**
 * URL 形式的 Cesium quantized-mesh 地形配置，用于 {@link ViewerOptions.terrain}。
 *
 * URL-based Cesium quantized-mesh terrain options used by
 * {@link ViewerOptions.terrain}.
 */
export interface UrlTerrainOptions extends TerrainRenderOptions {
  /**
   * 数据源类型。不传时按 URL 地形处理，用于兼容旧配置。
   *
   * Data source type. When omitted, the terrain is treated as URL-based terrain
   * for backward compatibility.
   */
  type?: 'url'
  /**
   * 地形根 URL 或 `layer.json` URL。
   *
   * Terrain root URL or `layer.json` URL.
   */
  url: string
}

/**
 * Cesium Ion quantized-mesh 地形配置，用于 {@link ViewerOptions.terrain}。
 *
 * Cesium Ion quantized-mesh terrain options used by
 * {@link ViewerOptions.terrain}.
 */
export interface CesiumIonTerrainOptions extends TerrainRenderOptions {
  /** 数据源类型。Data source type. */
  type: 'cesium-ion'
  /** Cesium Ion 访问令牌。Cesium Ion access token. */
  apiToken: string
  /** Cesium Ion 地形资源 id。Cesium Ion terrain asset id. */
  assetId: string | number
  /** 是否自动刷新 Cesium Ion endpoint 授权，默认 `true`。Refreshes Cesium Ion endpoint authorization automatically. Defaults to `true`. */
  autoRefreshToken?: boolean
}

/**
 * 天地图 swdx elv_c 高程地形配置，用于 {@link ViewerOptions.terrain}。
 *
 * Tianditu swdx `elv_c` heightmap terrain options used by
 * {@link ViewerOptions.terrain}.
 */
export interface TiandituTerrainOptions extends TerrainRenderOptions {
  /** 数据源类型。Data source type. */
  type: 'tianditu'
  /**
   * 天地图 tk 密钥。
   *
   * 传单个 key 时行为与旧版一致；传数组时，Tellux 会按瓦片坐标确定性
   * 分片到不同 key 上做负载均衡，避免单 key 额度被快速耗尽。同一瓦片
   * 始终命中同一 key，不会破坏浏览器缓存。
   *
   * Tianditu API token (`tk`).
   *
   * A single key keeps the legacy behavior. When an array is provided, Tellux
   * shards deterministically by tile coordinates across the keys for load
   * balancing, so a single key's quota is not exhausted quickly. The same tile
   * always resolves to the same key, preserving browser caching.
   */
  token: string | string[]
  /**
   * swdx 服务 URL 列表（多子域负载均衡）。
   *
   * 不传时使用 `t0`–`t7` 默认地址。
   *
   * swdx service URLs for subdomain load balancing.
   *
   * When omitted, Tellux uses the default `t0`–`t7` endpoints.
   */
  urls?: string[]
  /**
   * 子域编号，默认 `['0',…,'7']`。
   *
   * Subdomain ids. Defaults to `['0',…,'7']`.
   */
  subdomains?: string[]
  /**
   * 开始请求真实 elv_c 数据的层级，默认 `5`。
   *
   * First level that requests real `elv_c` tiles. Defaults to `5`.
   */
  topLevel?: number
  /**
   * 停止继续细分的层级（不含），默认 `12`。
   *
   * Level at which refinement stops (exclusive). Defaults to `12`.
   */
  bottomLevel?: number
}

/**
 * Viewer 支持的地形配置。
 *
 * Terrain options supported by Viewer.
 */
export type TerrainOptions = UrlTerrainOptions | CesiumIonTerrainOptions | TiandituTerrainOptions

/**
 * 地形瓦片的地理包围范围。经纬度单位为度，高程单位为米。
 *
 * Geographic bounds of a terrain tile. Longitudes and latitudes are in degrees;
 * heights are in meters.
 */
export interface TerrainTileRectangle {
  readonly west: number
  readonly south: number
  readonly east: number
  readonly north: number
  readonly minHeight: number
  readonly maxHeight: number
}

/**
 * 已加载地形瓦片的只读快照。
 *
 * `model` 及其 geometry、material 和 BufferAttribute 始终由 Tellux 所有。
 * 观察者只能读取或同步复制所需数据，不能修改、销毁或转移底层 ArrayBuffer。
 * 快照在对应 `unload` 或 `reset` 事件后失效。
 *
 * Read-only snapshot of a loaded terrain tile.
 *
 * Tellux retains ownership of `model`, its geometry, materials, and buffer
 * attributes. Observers may inspect or synchronously copy data, but must not
 * mutate, dispose, or transfer the underlying ArrayBuffers. The snapshot becomes
 * invalid after its matching `unload` or a `reset` event.
 */
export interface TerrainTileSnapshot {
  readonly id: string
  readonly parentId: string | null
  readonly sourceRevision: number
  readonly depth: number
  readonly geometricError: number
  readonly isVirtual: boolean
  readonly rectangle: TerrainTileRectangle
  readonly model: THREE.Object3D
}

export interface TerrainTileLoadEvent {
  readonly type: 'load'
  readonly tile: TerrainTileSnapshot
}

export interface TerrainTileUnloadEvent {
  readonly type: 'unload'
  readonly tile: TerrainTileSnapshot
}

export interface TerrainTileResetEvent {
  readonly type: 'reset'
  readonly sourceRevision: number
  readonly reason: 'source-change' | 'destroy'
}

/** 地形瓦片生命周期事件。Terrain tile lifecycle event. */
export type TerrainTileEvent = TerrainTileLoadEvent | TerrainTileUnloadEvent | TerrainTileResetEvent

/** 地理矩形过滤范围，经纬度单位为度。Geographic rectangle filter in degrees. */
export interface TerrainTileObserverRectangle {
  readonly west: number
  readonly south: number
  readonly east: number
  readonly north: number
}

export interface TerrainTileObserverOptions {
  /** 注册时是否同步回放已加载瓦片，默认 `true`。Synchronously replays loaded tiles on registration. */
  readonly replay?: boolean
  /** 可选地理范围过滤；`reset` 事件不受过滤影响。Optional geographic filter; reset is always delivered. */
  readonly rectangle?: TerrainTileObserverRectangle
}

/** 地形瓦片事件监听函数。Terrain tile event listener. */
export type TerrainTileListener = (event: TerrainTileEvent) => void

/** 地形材质装饰上下文。Terrain material decoration context. */
export interface TerrainMaterialDecoratorContext {
  readonly tile: TerrainTileSnapshot
  readonly mesh: THREE.Mesh
  readonly material: THREE.Material | THREE.Material[]
}

/**
 * 地形材质装饰结果。释放回调由 Tellux 在重建、卸载或注销时调用。
 *
 * Terrain material decoration result. Tellux invokes `dispose` when rebuilding,
 * unloading, or unregistering the decoration.
 */
export interface TerrainMaterialDecoration {
  readonly material: THREE.Material | THREE.Material[]
  readonly dispose: () => void
}

/**
 * 返回新材质的地形装饰器。不得修改输入材质、Mesh 或 geometry。
 *
 * Terrain decorator returning a replacement material. It must not mutate the
 * input material, mesh, or geometry.
 */
export type TerrainMaterialDecorator = (
  context: TerrainMaterialDecoratorContext
) => TerrainMaterialDecoration | null | undefined

/**
 * 场景 3D Tiles 图层瓦片加载参数，用于调整 LOD 和细化策略。
 *
 * Scene 3D Tiles layer loading options used to tune LOD and refinement behavior.
 */
export interface Scene3DTileLoadingOptions {
  /**
   * 3D Tiles 目标屏幕空间误差（像素），默认 `16`。
   *
   * 值越小越倾向加载更高层级瓦片，但会增加请求、解析和渲染成本。
   *
   * Target screen-space error for 3D Tiles in pixels. Defaults to `16`.
   *
   * Lower values prefer higher-detail tiles, but increase request, parsing, and
   * rendering cost.
   */
  errorTarget?: number
  /**
   * 是否在细化某个瓦片时一并加载其兄弟瓦片，默认 `true`。
   *
   * 开启后可减少相机移动时的空洞，但会增加并发下载量。
   *
   * Whether to load sibling tiles while refining a tile. Defaults to `true`.
   *
   * Enabling this can reduce holes while the camera moves, but increases
   * concurrent downloads.
   */
  loadSiblings?: boolean
}

/**
 * 3D Tiles 图层渲染选项。
 *
 * Rendering options shared by 3D Tiles layers.
 */
export interface ThreeDTilesRenderOptions {
  /**
   * 3D Tiles 材质模式。默认根据 Viewer 大气光照模式自动选择：`post-process` 使用 unlit，`light-source` 使用 standard。
   *
   * `unlit` 会把瓦片网格转换为不受 Three.js 光源影响的材质，适合把瓦片颜色作为 Takram 后处理光照的 albedo 输入。
   *
   * 3D Tiles material mode. By default, this follows the Viewer atmosphere
   * lighting mode: `post-process` uses unlit materials, while `light-source`
   * uses standard materials.
   *
   * `unlit` converts tile meshes to materials unaffected by Three.js light
   * sources, suitable for using tile colors as albedo input for Takram
   * post-process lighting.
   */
  materialMode?: 'unlit'
  /**
   * 是否为当前 3D Tiles 图层重新生成折痕法线，默认 `false`。
   *
   * 该处理适合摄影测量等法线缺失或不稳定的瓦片，可改善基于 NormalPass 的后处理光照边缘，但会增加瓦片加载时的 CPU 和内存成本。
   *
   * Regenerates creased normals for this 3D Tiles layer. Defaults to `false`.
   *
   * This is useful for photogrammetry tiles with missing or unstable normals and
   * can improve NormalPass-based post-process lighting edges, but adds CPU and
   * memory cost while tiles load.
   */
  creasedNormals?: boolean
  /**
   * 3D Tiles 瓦片加载参数。
   *
   * 用于调节场景 3D Tiles 图层的 LOD 和细化策略。
   *
   * 3D Tiles tile loading options.
   *
   * Tunes LOD and refinement behavior for scene 3D Tiles layers.
   */
  tileLoading?: Scene3DTileLoadingOptions
}

export interface Url3DTilesetOptions extends ThreeDTilesRenderOptions {
  /** 数据源类型。Data source type. */
  type: 'url'
  /**
   * 图层 id。不传时 Tellux 会自动生成。
   *
   * Layer id. Tellux generates one when omitted.
   */
  id?: string
  /**
   * `tileset.json` 的 URL。
   *
   * URL of the `tileset.json`.
   */
  url: string
}

/**
 * 通过 Cesium Ion 资源加载 3D Tiles 的配置。
 *
 * Options for loading 3D Tiles from a Cesium Ion asset.
 */
export interface CesiumIon3DTilesetOptions extends ThreeDTilesRenderOptions {
  /** 数据源类型。Data source type. */
  type: 'cesium-ion'
  /**
   * 图层 id。不传时 Tellux 会自动生成。
   *
   * Layer id. Tellux generates one when omitted.
   */
  id?: string
  /** Cesium Ion 访问令牌。Cesium Ion access token. */
  apiToken: string
  /** Cesium Ion 3D Tiles 资源 id。Cesium Ion 3D Tiles asset id. */
  assetId: string | number
  /** 是否自动刷新 Cesium Ion endpoint 授权，默认 `true`。Refreshes Cesium Ion endpoint authorization automatically. Defaults to `true`. */
  autoRefreshToken?: boolean
}

/**
 * Viewer 支持的 3D Tiles 加载配置。
 *
 * 3D Tiles 会作为独立场景数据加载，不参与影像 overlay 管线。
 *
 * 3D Tiles loading options supported by Viewer.
 *
 * 3D Tiles are loaded as independent scene data and do not participate in the
 * imagery overlay pipeline.
 */
export type Load3DTilesetOptions = Url3DTilesetOptions | CesiumIon3DTilesetOptions
import type * as THREE from 'three'
