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
  /**
   * 面填充颜色，适用于 GeoJSON 和 MVT 图层。
   *
   * Polygon fill color for GeoJSON and MVT layers.
   */
  fill?: string
  /**
   * 线描边颜色，适用于 GeoJSON 和 MVT 图层。
   *
   * Line stroke color for GeoJSON and MVT layers.
   */
  stroke?: string
  /**
   * 描边宽度（像素），适用于 GeoJSON 和 MVT 图层。
   *
   * Stroke width in pixels for GeoJSON and MVT layers.
   */
  strokeWidth?: number
  /**
   * 点半径（像素），适用于 GeoJSON 和 MVT 图层。
   *
   * Point radius in pixels for GeoJSON and MVT layers.
   */
  pointRadius?: number
  /**
   * 按矢量 feature 返回样式。
   *
   * GeoJSON 图层接收 `(feature, properties)`；MVT 图层接收
   * `(layerName, properties)`，当 `properties` 为 `null` 时仅用于获取
   * MVT 图层绘制顺序。
   *
   * Returns per-feature vector styling.
   *
   * GeoJSON layers receive `(feature, properties)`. MVT layers receive
   * `(layerName, properties)`; when `properties` is `null`, the callback is
   * queried only for MVT layer draw order.
   */
  getStyle?: GeoJSONGetStyleCallback | MVTGetStyleCallback
}

/**
 * Viewer 支持的影像图层数据源配置。
 *
 * Imagery layer source options supported by Viewer.
 */
export type ImageryLayerSourceOptions =
  | CesiumIonImagerySourceOptions
  | XYZImagerySourceOptions
  | WMSImagerySourceOptions
  | GeoJSONImagerySourceOptions
  | MVTImagerySourceOptions

/**
 * Cesium Ion 影像数据源配置，用于影像图层。
 *
 * Cesium Ion imagery source options used by imagery layers.
 */
export interface CesiumIonImagerySourceOptions {
  /** 数据源类型。Source type. */
  type: 'cesium-ion'
  /** Cesium Ion 访问令牌。Cesium Ion access token. */
  apiToken: string
  /** 要加载的 Cesium Ion 资源 id。Cesium Ion asset id to load. */
  assetId: string | number
  /** 是否自动刷新 Cesium Ion endpoint 授权，默认 `true`。Refreshes Cesium Ion endpoint authorization automatically. Defaults to `true`. */
  autoRefreshToken?: boolean
}

/**
 * XYZ 瓦片影像数据源配置，用于影像图层。
 *
 * XYZ tile imagery source options used by imagery layers.
 */
export interface XYZImagerySourceOptions {
  /** 数据源类型。Source type. */
  type: 'xyz'
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
 * WMS 影像数据源配置，用于影像图层。
 *
 * WMS imagery source options used by imagery layers.
 */
export interface WMSImagerySourceOptions {
  /** 数据源类型。Source type. */
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
 * GeoJSON 几何对象。
 *
 * GeoJSON geometry object.
 */
export interface GeoJSONGeometry {
  /** GeoJSON 几何类型。GeoJSON geometry type. */
  type: string
  /** 几何坐标。Geometry coordinates. */
  coordinates?: unknown
  /** GeometryCollection 中的子几何。Child geometries in a GeometryCollection. */
  geometries?: GeoJSONGeometry[]
  /** 允许应用携带额外 GeoJSON 成员。Allows applications to carry extra GeoJSON members. */
  [key: string]: unknown
}

/**
 * GeoJSON feature 属性。
 *
 * GeoJSON feature properties.
 */
export type GeoJSONFeatureProperties = Record<string, unknown>

/**
 * GeoJSON feature 对象。
 *
 * GeoJSON feature object.
 */
export interface GeoJSONFeature {
  /** GeoJSON 对象类型。GeoJSON object type. */
  type: 'Feature'
  /** Feature 几何。Feature geometry. */
  geometry: GeoJSONGeometry | null
  /** Feature 属性。Feature properties. */
  properties?: GeoJSONFeatureProperties | null
  /** 允许应用携带额外 GeoJSON 成员。Allows applications to carry extra GeoJSON members. */
  [key: string]: unknown
}

/**
 * GeoJSON feature collection 对象。
 *
 * GeoJSON feature collection object.
 */
export interface GeoJSONFeatureCollection {
  /** GeoJSON 对象类型。GeoJSON object type. */
  type: 'FeatureCollection'
  /** Feature 列表。Feature list. */
  features: GeoJSONFeature[]
  /** 允许应用携带额外 GeoJSON 成员。Allows applications to carry extra GeoJSON members. */
  [key: string]: unknown
}

/**
 * 可作为 GeoJSON 图层输入的数据。
 *
 * GeoJSON data accepted by a GeoJSON layer.
 */
export type GeoJSONData = GeoJSONFeatureCollection | GeoJSONFeature | GeoJSONGeometry

/**
 * GeoJSON feature 样式。
 *
 * GeoJSON feature style.
 */
export interface GeoJSONFeatureStyle {
  /** 面填充颜色，使用 CSS 颜色字符串。Polygon fill color as a CSS color string. */
  fill?: string
  /** 线描边颜色，使用 CSS 颜色字符串。Line stroke color as a CSS color string. */
  stroke?: string
  /** 描边宽度（像素）。Stroke width in pixels. */
  strokeWidth?: number
  /** 点半径（像素）。Point radius in pixels. */
  radius?: number
  /** 是否渲染该 feature。Whether the feature is rendered. */
  visible?: boolean
}

/**
 * GeoJSON feature 样式回调。
 *
 * GeoJSON feature style callback.
 */
export type GeoJSONGetStyleCallback = (
  feature: GeoJSONFeature,
  properties: GeoJSONFeatureProperties | null
) => GeoJSONFeatureStyle | null

/**
 * GeoJSON 数据源配置，用于影像图层。
 *
 * GeoJSON source options used by imagery layers.
 */
export interface GeoJSONImagerySourceOptions {
  /** 数据源类型。Source type. */
  type: 'geojson'
  /**
   * GeoJSON 数据对象。
   *
   * GeoJSON data object.
   */
  geojson?: GeoJSONData
  /**
   * GeoJSON 文件 URL。未传 `geojson` 时会在初始化时请求该 URL。
   *
   * GeoJSON file URL. When `geojson` is omitted, this URL is fetched on init.
   */
  url?: string
  /**
   * 生成 GeoJSON 纹理的画布分辨率，默认 `256`。
   *
   * Canvas resolution used to rasterize GeoJSON textures. Defaults to `256`.
   */
  resolution?: number
  /**
   * 请求 URL 预处理函数，可用于追加 token 或签名参数。
   *
   * Preprocesses request URLs, useful for appending tokens or signatures.
   */
  preprocessURL?: (url: string) => string | null
  /**
   * GeoJSON 请求配置。
   *
   * GeoJSON request options.
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
 * Mapbox Vector Tile 数据源配置，用于影像图层。
 *
 * Mapbox Vector Tile source options used by imagery layers.
 */
export interface MVTImagerySourceOptions {
  /** 数据源类型。Source type. */
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
}
