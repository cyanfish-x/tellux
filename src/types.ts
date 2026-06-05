import type { TilesRenderer } from '3d-tiles-renderer'
import type { CameraFlightEasingFunction } from './Camera'
import type { Viewer } from './Viewer'

/**
 * 创建 {@link Viewer} 时使用的配置项。
 *
 * Options used to create a {@link Viewer}.
 */
export interface ViewerOptions {
  /**
   * 初始影像图层列表。
   *
   * 图层会按数组顺序从下到上贴到裸球或地形表面。
   *
   * Initial imagery layer list.
   *
   * Layers are drawn from bottom to top on the globe or terrain surface.
   */
  layers?: ImageryLayerOptions[]
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
    /**
     * 是否为 3D Tiles 网格重新生成折痕法线，默认 `false`。
     *
     * 该处理会改善部分瓦片的光照边缘，但会增加瓦片加载时的 CPU 和内存成本。
     *
     * Regenerates creased normals for 3D Tiles meshes. Defaults to `false`.
     *
     * This can improve lighting edges for some tiles, but adds CPU and memory
     * cost while tiles load.
     */
    creasedNormals?: boolean
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
 * 影像图层配置，用于 {@link ViewerOptions.layers} 和 `viewer.layers.add(...)`。
 *
 * Imagery layer options used by {@link ViewerOptions.layers} and
 * `viewer.layers.add(...)`.
 */
export interface ImageryLayerOptions {
  /**
   * 图层 id。不传时 Tellux 会自动生成。
   *
   * Layer id. Tellux generates one when omitted.
   */
  id?: string
  /**
   * 图层名称，用于应用侧展示。
   *
   * Layer name for application UI display.
   */
  name?: string
  /**
   * 图层数据源。
   *
   * Layer data source.
   */
  source: ImageryLayerSourceOptions
  /**
   * 图层是否可见，默认 `true`。
   *
   * Whether the layer is visible. Defaults to `true`.
   */
  visible?: boolean
  /**
   * 图层显示样式。
   *
   * Layer display style.
   */
  style?: ImageryLayerStyleOptions
}

/**
 * 影像图层显示样式。
 *
 * Imagery layer display style.
 */
export interface ImageryLayerStyleOptions {
  /**
   * 图层透明度，范围 `0` 到 `1`，默认 `1`。
   *
   * Layer opacity from `0` to `1`. Defaults to `1`.
   */
  opacity?: number
  /**
   * 图层颜色乘色。
   *
   * Layer color tint.
   */
  color?: number | string
}

/**
 * Viewer 支持的影像图层数据源配置。
 *
 * Imagery layer source options supported by Viewer.
 */
export type ImageryLayerSourceOptions = CesiumIonResourceOptions | TemplateUrlResourceOptions
  | MVTResourceOptions | WMSResourceOptions

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
 * 通过 tileset JSON URL 加载 3D Tiles 的配置。
 *
 * Options for loading 3D Tiles from a tileset JSON URL.
 */
export interface Url3DTilesetOptions {
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
export interface CesiumIon3DTilesetOptions {
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

/**
 * 飞行到 3D Tiles 数据集时的配置。
 *
 * Viewer 会根据 tileset 根包围球自动计算目标经纬度和飞行高度，默认使用
 * 30 度俯视角观察数据集中心。
 *
 * Options for flying to a 3D Tiles dataset.
 *
 * Viewer computes the target longitude, latitude, and flight height from the
 * root bounding sphere, and views the dataset center from a 30-degree downward
 * angle by default.
 */
export interface FlyTo3DTilesetOptions {
  /** 最终航向角（度），默认 `0`。Final heading in degrees. Defaults to `0`. */
  heading?: number
  /** 最终俯仰角（度），默认 `-30`。Final pitch in degrees. Defaults to `-30`. */
  pitch?: number
  /** 最终翻滚角（度），默认 `0`。Final roll in degrees. Defaults to `0`. */
  roll?: number
  /** 飞行持续时间（秒）。Flight duration in seconds. */
  duration?: number
  /** 飞行最高高度（米），用于形成弧线飞行路径。Maximum flight height in meters, used to form an arced path. */
  maximumHeight?: number
  /** 飞行完成时调用。Called when the flight completes. */
  complete?: () => void
  /** 飞行被新飞行、立即定位或用户交互取消时调用。Called when the flight is cancelled by a new flight, immediate view change, or user input. */
  cancel?: () => void
  /** 控制飞行时间插值的缓动函数。Easing function that controls flight time interpolation. */
  easingFunction?: CameraFlightEasingFunction
}

/**
 * 已加载 3D Tiles 图层的控制句柄。
 *
 * Handle for a loaded 3D Tiles layer.
 */
export interface TilesetLayer {
  /** 图层 id。Layer id. */
  readonly id: string
  /** 底层 3D Tiles renderer。Underlying 3D Tiles renderer. */
  readonly tileset: TilesRenderer
  /** 是否显示该图层。Whether the layer is visible. */
  show: boolean
  /**
   * 从 Viewer 中移除该图层并释放资源。
   *
   * Removes the layer from Viewer and releases its resources.
   */
  remove(): void
}

/**
 * Cesium Ion 影像资源配置，用于影像图层。
 *
 * Cesium Ion imagery resource options used by imagery layers.
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
 * 模板 URL 影像资源配置，用于影像图层。
 *
 * Template URL imagery resource options used by imagery layers.
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
 * WMS 影像资源配置，用于影像图层。
 *
 * WMS imagery resource options used by imagery layers.
 */
export interface WMSResourceOptions {
  /** 资源类型。Resource type. */
  type: 'wms'
  /**
   * WMS 服务基础 URL。
   *
   * WMS service base URL.
   */
  url: string
  /**
   * WMS 图层名，对应 GetMap 请求的 `LAYERS` 参数。
   *
   * WMS layer name used as the GetMap `LAYERS` parameter.
   */
  layer: string
  /**
   * 坐标参考系，默认 `EPSG:4326`。
   *
   * Coordinate reference system. Defaults to `EPSG:4326`.
   */
  crs?: 'EPSG:4326' | 'EPSG:3857' | 'CRS:84' | string
  /**
   * 图片格式，默认 `image/png`。
   *
   * Image format. Defaults to `image/png`.
   */
  format?: string
  /**
   * 瓦片像素尺寸，默认 `256`。
   *
   * Tile pixel size. Defaults to `256`.
   */
  tileDimension?: number
  /**
   * WMS 样式名，对应 GetMap 请求的 `STYLES` 参数。
   *
   * WMS style name used as the GetMap `STYLES` parameter.
   */
  styles?: string
  /**
   * WMS 版本，默认 `1.3.0`。
   *
   * WMS version. Defaults to `1.3.0`.
   */
  version?: '1.3.0' | '1.1.1' | string
  /**
   * 瓦片级别数量，默认 `18`。
   *
   * Number of tile levels. Defaults to `18`.
   */
  levels?: number
  /**
   * 是否请求透明背景，默认 `false`。
   *
   * Requests a transparent background. Defaults to `false`.
   */
  transparent?: boolean
  /**
   * 内容范围，顺序为 `[west, south, east, north]`，单位由 `crs` 决定。
   *
   * Content bounds as `[west, south, east, north]`, in the units of `crs`.
   */
  contentBoundingBox?: [number, number, number, number]
  /**
   * 瓦片请求 URL 预处理函数，可用于追加 token 或签名参数。
   *
   * Preprocesses tile request URLs, useful for appending tokens or signatures.
   */
  preprocessURL?: (url: string) => string | null
  /**
   * 瓦片请求配置。
   *
   * Tile request options.
   */
  fetchOptions?: RequestInit
}

/**
 * MVT feature 样式。
 *
 * MVT feature style.
 */
export interface MVTFeatureStyle {
  /** 面填充颜色，使用 CSS 颜色字符串。Polygon fill color as a CSS color string. */
  fill?: string
  /** 线描边颜色，使用 CSS 颜色字符串。Line stroke color as a CSS color string. */
  stroke?: string
  /** 描边宽度（像素）。Stroke width in pixels. */
  strokeWidth?: number
  /** 点半径（像素）。Point radius in pixels. */
  radius?: number
  /** 绘制顺序，数值越小越早绘制。Draw order; lower values draw earlier. */
  order?: number
  /** 是否渲染该 feature。Whether the feature is rendered. */
  visible?: boolean
}

/**
 * MVT feature 属性。
 *
 * MVT feature properties.
 */
export type MVTFeatureProperties = Record<string, unknown>

/**
 * MVT feature 样式回调。
 *
 * MVT feature style callback.
 */
export type MVTGetStyleCallback = (
  layerName: string,
  properties: MVTFeatureProperties | null
) => MVTFeatureStyle | null

/**
 * Mapbox Vector Tile 资源配置，用于影像图层。
 *
 * Mapbox Vector Tile resource options used by imagery layers.
 */
export interface MVTResourceOptions {
  /** 资源类型。Resource type. */
  type: 'mvt'
  /**
   * MVT 瓦片 URL 模板，支持 `{x}`、`{y}`、`{z}` 占位符。
   *
   * MVT tile URL template with `{x}`, `{y}`, and `{z}` placeholders.
   */
  url: string
  /**
   * 瓦片级别数量，默认 `20`。
   *
   * Number of tile levels. Defaults to `20`.
   */
  levels?: number
  /**
   * 投影标识，默认 `EPSG:3857`。
   *
   * Projection identifier. Defaults to `EPSG:3857`.
   */
  projection?: 'EPSG:3857' | 'EPSG:4326' | string
  /**
   * 生成矢量瓦片纹理的画布分辨率，默认 `512`。
   *
   * Canvas resolution used to rasterize vector tile textures. Defaults to `512`.
   */
  resolution?: number
  /**
   * 瓦片请求配置。
   *
   * Tile request options.
   */
  fetchOptions?: RequestInit
  /**
   * 按 MVT 图层名和 feature 属性返回样式；当 `properties` 为 `null` 时只用于获取图层绘制顺序。
   *
   * 返回 `{}` 使用默认样式；返回 `null` 或 `{ visible: false }` 不渲染该 feature。
   *
   * Returns a style from the MVT layer name and feature properties. When
   * `properties` is `null`, the callback is queried only for layer draw order.
   *
   * Return `{}` to use the default style. Return `null` or `{ visible: false }`
   * to skip rendering the feature.
   */
  getStyle?: MVTGetStyleCallback
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
