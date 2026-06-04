import type { Viewer } from './Viewer'

/**
 * 创建 {@link Viewer} 时使用的配置项。
 *
 * Options used to create a {@link Viewer}.
 */
export interface ViewerOptions {
  /**
   * 影像资源配置。
   *
   * 不传时，Tellux 不会注册影像资源。
   *
   * Imagery resource options.
   *
   * When omitted, Tellux does not register an imagery resource.
   */
  imageryProvider?: ImageryProviderOptions
  /**
   * 地形瓦片资源配置。
   *
   * `url` 指向 Cesium quantized-mesh terrain 根目录或 `layer.json` 文件。
   *
   * Terrain tile resource options.
   *
   * The `url` points to a Cesium quantized-mesh terrain root directory or
   * `layer.json` file.
   */
  terrain?: TerrainOptions
  /**
   * 初始相机视角。
   *
   * 经纬度和姿态角使用度作为单位；高度、near 和 far 使用米作为单位。
   *
   * Initial camera view.
   *
   * Geographic coordinates and orientation angles are expressed in degrees.
   * Height, near, and far are expressed in meters.
   */
  camera?: {
    /** 初始纬度（度），默认 `35.6812`。Initial latitude in degrees. Defaults to `35.6812`. */
    latitude?: number
    /** 初始经度（度），默认 `139.8`。Initial longitude in degrees. Defaults to `139.8`. */
    longitude?: number
    /** 初始相机高度（米），默认 `500`。Initial camera height in meters. Defaults to `500`. */
    height?: number
    /** 初始航向角（度），默认 `-90`。Initial heading in degrees. Defaults to `-90`. */
    heading?: number
    /** 初始俯仰角（度），默认 `-10`。Initial pitch in degrees. Defaults to `-10`. */
    pitch?: number
    /** 初始翻滚角（度），默认 `0`。Initial roll in degrees. Defaults to `0`. */
    roll?: number
    /** 透视相机垂直视场角（度），默认 `75`。Perspective camera vertical field of view in degrees. Defaults to `75`. */
    fov?: number
    /** 透视相机近裁剪面（米），默认 `10`。Perspective camera near clipping plane in meters. Defaults to `10`. */
    near?: number
    /** 透视相机远裁剪面（米），默认 `1000000`。Perspective camera far clipping plane in meters. Defaults to `1000000`. */
    far?: number
  }
  /**
   * 初始场景和后处理配置。
   *
   * Initial scene and post-processing options.
   */
  scene?: {
    /** 是否启用体积云，默认 `true`。Enables volumetric clouds. Defaults to `true`. */
    clouds?: boolean
    /** 是否启用大气天空和空气透视，默认 `true`。Enables atmospheric sky and aerial perspective. Defaults to `true`. */
    skyAtmosphere?: boolean
    /** 是否启用镜头光晕后处理，默认 `true`。Enables lens flare post-processing. Defaults to `true`. */
    lensFlare?: boolean
    /** 是否启用 SMAA 抗锯齿后处理，默认 `true`。Enables SMAA anti-aliasing post-processing. Defaults to `true`. */
    smaa?: boolean
    /** 是否启用抖动后处理，默认 `false`。Enables dithering post-processing. Defaults to `false`. */
    dithering?: boolean
    /** 渲染器色调映射曝光值，默认 `10`。Renderer tone mapping exposure. Defaults to `10`. */
    toneMappingExposure?: number
    /** 云覆盖率，范围 `0` 到 `1`，默认 `0.3`。Cloud coverage from `0` to `1`. Defaults to `0.3`. */
    cloudCoverage?: number
  }
  /**
   * 为 `true` 时自动启动渲染循环。
   *
   * 默认 `true`。接入外部渲染循环时可设为 `false`，并手动调用 {@link Viewer.render}。
   *
   * Starts the render loop automatically when `true`.
   *
   * Defaults to `true`. Set this to `false` when integrating with an external
   * render loop and call {@link Viewer.render} yourself.
   */
  useDefaultRenderLoop?: boolean
  /**
   * 渲染器像素比，默认 `Math.min(window.devicePixelRatio, 2)`。
   *
   * Renderer pixel ratio. Defaults to `Math.min(window.devicePixelRatio, 2)`.
   */
  resolutionScale?: number
  /**
   * Draco 解码器文件的公开 URL 路径。
   *
   * 默认 `/draco/gltf/`。
   *
   * Public URL path for Draco decoder files.
   *
   * Defaults to `/draco/gltf/`.
   */
  dracoDecoderPath?: string
}

/**
 * 影像提供器配置，用于 {@link ViewerOptions.imageryProvider}。
 *
 * Imagery provider options used by {@link ViewerOptions.imageryProvider}.
 */
export interface ImageryProviderOptions {
  /** 当前使用的影像资源。Active imagery resource. */
  resource: ImageryProviderResourceOptions
}

/**
 * Viewer 支持的影像资源配置。
 *
 * Imagery resource options supported by Viewer.
 */
export type ImageryProviderResourceOptions = CesiumIonResourceOptions | TemplateUrlResourceOptions

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
 * Cesium Ion 资源配置，用于 {@link ViewerOptions.imageryProvider}。
 *
 * Cesium Ion resource options used by {@link ViewerOptions.imageryProvider}.
 */
export interface CesiumIonResourceOptions {
  /** 资源类型。Resource type. */
  type: 'cesium-ion'
  /** Cesium Ion 访问令牌。Cesium Ion access token. */
  apiToken: string
  /** 要加载的 Cesium Ion 资源 id。Cesium Ion asset id to load. */
  assetId: string | number
  /** 是否自动刷新 Cesium Ion endpoint 授权，默认 `true`。Refreshes Cesium Ion endpoint authorization automatically. Defaults to `true`. */
  autoRefreshToken?: boolean
}

/**
 * 模板 URL 资源配置，用于 {@link ViewerOptions.imageryProvider}。
 *
 * Template URL resource options used by {@link ViewerOptions.imageryProvider}.
 */
export interface TemplateUrlResourceOptions {
  /** 资源类型。Resource type. */
  type: 'template-url'
  /**
   * 瓦片 URL 模板，支持 `{x}`、`{y}`、`{z}` 占位符。
   *
   * Tile URL template with `{x}`, `{y}`, and `{z}` placeholders.
   */
  url: string
  /**
   * 瓦片级别数量，默认 `20`。
   *
   * Number of tile levels. Defaults to `20`.
   */
  levels?: number
  /**
   * 瓦片像素尺寸，默认 `256`。
   *
   * Tile pixel size. Defaults to `256`.
   */
  tileDimension?: number
  /**
   * 投影标识，默认 `EPSG:3857`。
   *
   * Projection identifier. Defaults to `EPSG:3857`.
   */
  projection?: 'EPSG:3857' | 'EPSG:4326' | string
}

/**
 * 屏幕像素坐标，相对于 canvas 左上角。
 *
 * Screen pixel position relative to the top-left corner of the canvas.
 */
export interface ScreenPosition {
  /** 横向像素坐标。Horizontal pixel coordinate. */
  x: number
  /** 纵向像素坐标。Vertical pixel coordinate. */
  y: number
}

/**
 * 经纬高坐标，单位分别为度和米。
 *
 * Cartographic coordinates in degrees and meters.
 */
export interface CartographicCoordinates {
  /** 纬度（度）。Latitude in degrees. */
  latitude: number
  /** 经度（度）。Longitude in degrees. */
  longitude: number
  /** 高度（米）。Height in meters. */
  height: number
}

/**
 * Viewer 事件的基础信息。
 *
 * Base information for Viewer events.
 */
export interface ViewerEvent {
  /** 事件类型。Event type. */
  type: keyof ViewerEventMap
  /** 触发事件的 Viewer 实例。Viewer instance that emitted the event. */
  viewer: Viewer
}

/**
 * Viewer canvas 上的鼠标事件。
 *
 * Mouse event on the Viewer canvas.
 */
export interface ViewerMouseEvent extends ViewerEvent {
  /** 事件类型。Event type. */
  type: 'click' | 'mousemove'
  /** 原始 DOM 鼠标事件。Original DOM mouse event. */
  originalEvent: MouseEvent
  /** 相对于 canvas 左上角的像素坐标。Pixel position relative to the top-left corner of the canvas. */
  position: ScreenPosition
  /**
   * 鼠标位置对应的经纬高；未命中 3D Tiles 或椭球时为 `null`。
   *
   * Cartographic coordinates for the clicked position, or `null` when neither
   * 3D Tiles nor the ellipsoid is hit.
   */
  cartographic: CartographicCoordinates | null
}

/**
 * Viewer canvas 上的点击事件。
 *
 * Click event on the Viewer canvas.
 */
export interface ViewerClickEvent extends ViewerMouseEvent {
  /** 事件类型。Event type. */
  type: 'click'
}

/**
 * Viewer canvas 上的鼠标移动事件。
 *
 * Mouse move event on the Viewer canvas.
 */
export interface ViewerMouseMoveEvent extends ViewerMouseEvent {
  /** 事件类型。Event type. */
  type: 'mousemove'
}

/**
 * Viewer 支持的事件映射。
 *
 * Event map supported by Viewer.
 */
export interface ViewerEventMap {
  click: ViewerClickEvent
  mousemove: ViewerMouseMoveEvent
}

/**
 * Viewer 事件监听函数。
 *
 * Viewer event listener.
 */
export type ViewerEventListener<T extends keyof ViewerEventMap> = (event: ViewerEventMap[T]) => void

export type AnyViewerEventListener = (event: ViewerEventMap[keyof ViewerEventMap]) => void
