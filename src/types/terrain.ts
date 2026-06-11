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
 * Cesium quantized-mesh 地形配置，用于 {@link ViewerOptions.terrain}。
 *
 * Cesium quantized-mesh terrain options used by {@link ViewerOptions.terrain}.
 */
export interface TerrainOptions {
  /**
   * 地形根 URL 或 `layer.json` URL。
   *
   * Terrain root URL or `layer.json` URL.
   */
  url: string
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
