import type { Object3D, Vector3 } from 'three'
import type { TilesRenderer } from '3d-tiles-renderer'

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
 * 3D Tiles feature 属性键值表。
 *
 * Property map for a 3D Tiles feature.
 */
export type TilesetFeatureProperties = Record<string, unknown>

/**
 * 3D Tiles feature 拾取结果。
 *
 * Pick result for a 3D Tiles feature.
 */
export interface Picked3DTilesFeature {
  /** 命中的 3D Tiles 图层 id。Picked 3D Tiles layer id. */
  readonly layerId: string
  /** 命中的底层 3D Tiles renderer。Picked underlying 3D Tiles renderer. */
  readonly tileset: TilesRenderer
  /** 命中的 Three.js 对象。Picked Three.js object. */
  readonly object: Object3D
  /** 命中的世界坐标。Picked world position. */
  readonly point: Vector3
  /** 射线到命中点的距离。Distance from the ray origin to the picked point. */
  readonly distance: number
  /** 命中的三角面索引；不可用时为 `null`。Picked face index, or `null` when unavailable. */
  readonly faceIndex: number | null
  /** 命中的 feature id；数据未提供 feature id 时为 `null`。Picked feature id, or `null` when unavailable. */
  readonly featureId: number | null
  /** 命中 feature 的属性。Properties of the picked feature. */
  readonly properties: TilesetFeatureProperties
  /** 命中点经纬高。Cartographic coordinates of the picked point. */
  readonly cartographic: CartographicCoordinates
}

/**
 * 经纬高输入，顺序为 `[经度, 纬度, 高度]`。
 *
 * Cartographic input as `[longitude, latitude, height]`.
 */
export type CartographicCoordinateTuple = [longitude: number, latitude: number, height?: number]

/**
 * 经纬高输出，顺序为 `[经度, 纬度, 高度]`。
 *
 * Cartographic output as `[longitude, latitude, height]`.
 */
export type CartographicHeightTuple = [longitude: number, latitude: number, height: number]

/**
 * 高精度高度采样结果；未命中时为 `undefined`。
 *
 * Most-detailed height sampling result; `undefined` when no surface is hit.
 */
export type SampleHeightMostDetailedResult = CartographicHeightTuple | undefined

/**
 * 经纬高点位输入。
 *
 * Cartographic point input.
 */
export type CartographicInput = CartographicCoordinateTuple | CartographicCoordinates

/**
 * 高度采样的数据源范围。
 *
 * Height sampling source range.
 */
export type HeightSamplingSource = 'all' | 'terrain' | 'tileset'

/**
 * 高度采样选项。
 *
 * Height sampling options.
 */
export interface SampleHeightOptions {
  /**
   * 参与采样的数据源，默认 `'all'`。
   *
   * Source to sample from. Defaults to `'all'`.
   */
  source?: HeightSamplingSource
  /**
   * 沿当地地表法线向下采样的最低高度（米），默认 `-10000`。
   *
   * Minimum height in meters along the local surface-normal sampling ray.
   * Defaults to `-10000`.
   */
  minimumHeight?: number
  /**
   * 沿当地地表法线向下采样的最高高度（米），默认 `100000`。
   *
   * Maximum height in meters along the local surface-normal sampling ray.
   * Defaults to `100000`.
   */
  maximumHeight?: number
}

/**
 * 高精度高度采样调试选项。
 *
 * Most-detailed height sampling debug options.
 */
export interface SampleHeightMostDetailedDebugOptions {
  /**
   * 控制台日志标签。
   *
   * Console log label.
   */
  label?: string
  /**
   * 是否输出每个 batch 的诊断信息，默认 `true`。
   *
   * Whether to log diagnostics for each batch. Defaults to `true`.
   */
  logBatches?: boolean
  /**
   * 每隔多少个 batch 输出一次日志，默认 `1`。
   *
   * Batch interval for diagnostics. Defaults to `1`.
   */
  batchInterval?: number
  /**
   * 超过多少毫秒的 batch 总是输出日志，默认 `500`。
   *
   * Always log batches slower than this threshold in milliseconds. Defaults to `500`.
   */
  slowBatchMilliseconds?: number
}

/**
 * 高精度高度采样选项。
 *
 * Most-detailed height sampling options.
 */
export interface SampleHeightMostDetailedOptions extends SampleHeightOptions {
  /**
   * 离屏采样相机的像素分辨率，默认 `256`。
   *
   * Pixel resolution used by the offscreen sampling camera. Defaults to `256`.
   */
  resolution?: number
  /**
   * 等待瓦片加载和细化的最大更新帧数，默认 `120`。
   *
   * Maximum number of update frames to wait for tile loading and refinement.
   * Defaults to `120`.
   */
  maxFrames?: number
  /**
   * 是否输出高度采样调试信息。
   *
   * 传 `true` 使用默认调试配置；也可以传入对象控制日志标签、batch
   * 输出频率和慢 batch 阈值。
   *
   * Whether to log height sampling diagnostics.
   *
   * Pass `true` to use default debug settings, or pass an object to configure
   * the log label, batch logging interval, and slow batch threshold.
   */
  debug?: boolean | SampleHeightMostDetailedDebugOptions
}

/**
 * 经纬高局部坐标框架选项。
 *
 * Cartographic local frame options.
 */
export interface CartographicFrameOptions {
  /** 航向角（度），相对当地正北顺时针。Heading in degrees, clockwise from local north. */
  heading?: number
  /** 俯仰角（度）。Pitch in degrees. */
  pitch?: number
  /** 翻滚角（度）。Roll in degrees. */
  roll?: number
}
