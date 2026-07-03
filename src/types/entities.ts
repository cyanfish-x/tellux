import type { Color, Vector3 } from 'three'
import type { CartographicInput, HeightSamplingSource } from './spatial'
import type { Entity } from '../entities/Entity'

/**
 * 贴地（Ground Clamp）配置。贴地是坐标的垂直定位属性，只有两个正交轴：
 * 贴到哪个面（{@link source}）、离那个面多高（{@link offset}）。
 *
 * Ground-clamp options. Clamping is a vertical-positioning property with two
 * orthogonal axes: which surface to clamp to ({@link source}) and how far above
 * it ({@link offset}).
 *
 * 详见 `docs/design/ground-clamp.md` §4。
 */
export interface GroundClamp {
  /**
   * 贴到什么面；直接透传给高度采样的 `source`。默认 `'all'`（terrain 与
   * 3D Tiles 取上）。
   *
   * Which surface to clamp to; forwarded to the height-sampling `source`.
   * Defaults to `'all'` (terrain and 3D Tiles, whichever is higher).
   */
  source?: HeightSamplingSource
  /**
   * 地表之上的偏移（米）。`0` 或缺省 = 真·贴地；`> 0` = 抬离地表。
   *
   * Offset above the surface in meters. `0` or omitted = true ground clamp;
   * `> 0` = lifted above the surface.
   */
  offset?: number
}

/**
 * 贴地字段：`boolean` 走常见场景，对象走精细控制。
 * - 缺省 / `false` → 绝对椭球高（不贴地）。
 * - `true` → `{ source: 'all', offset: 0 }`，贴地。
 * - 对象 → 精细控制。
 *
 * Ground-clamp field: `boolean` for the common case, object for fine control.
 * - omitted / `false` → absolute ellipsoidal height (no clamp).
 * - `true` → `{ source: 'all', offset: 0 }`, clamped.
 * - object → fine control.
 */
export type ClampInput = boolean | GroundClamp

/**
 * 颜色输入：数值 hex、CSS 颜色字符串或 Three.js Color。
 *
 * Color input: numeric hex, CSS color string, or a Three.js Color.
 */
export type ColorInput = number | string | Color

/**
 * 点图形配置。
 *
 * Point graphics options.
 */
export interface PointOptions {
  /**
   * 像素直径，默认 `8`。
   *
   * Pixel diameter. Defaults to `8`.
   */
  pixelSize?: number
  /**
   * 填充颜色，默认白色。
   *
   * Fill color. Defaults to white.
   */
  color?: ColorInput
  /**
   * 描边颜色；仅在 {@link outlineWidth} 大于 0 时生效。
   *
   * Outline color; only used when {@link outlineWidth} is greater than 0.
   */
  outlineColor?: ColorInput
  /**
   * 描边像素宽度，默认 `0`（无描边）。
   *
   * Outline pixel width. Defaults to `0` (no outline).
   */
  outlineWidth?: number
  /**
   * 贴地配置。点贴地为 CPU 采样（P2 尚未实现，当前会降级为绝对高并告警）。
   *
   * Ground-clamp options. Point clamping is CPU-sampled (P2, not yet
   * implemented; currently falls back to absolute height with a warning).
   */
  clamp?: ClampInput
}

/**
 * 折线图形配置。
 *
 * Polyline graphics options.
 */
export interface PolylineOptions {
  /**
   * 折线顶点的经纬高序列。
   *
   * Polyline vertices as cartographic coordinates.
   */
  positions: CartographicInput[]
  /**
   * 像素宽度，默认 `2`。
   *
   * Pixel width. Defaults to `2`.
   */
  width?: number
  /**
   * 颜色，默认白色。
   *
   * Color. Defaults to white.
   */
  color?: ColorInput
  /**
   * 贴地配置。`clamp: true`（或 `offset: 0`）时折线通过 GPU 深度分类真·贴地，
   * 随地形/3D Tiles 起伏贴合；此时 {@link width} 语义为**米**（贴地 ribbon 宽度），
   * 非像素。`offset > 0` 暂未实现（P4），会降级为绝对高并告警。仅 WebGL 支持。
   *
   * Ground-clamp options. With `clamp: true` (or `offset: 0`) the polyline is
   * draped onto terrain/3D Tiles via GPU depth classification; {@link width} is
   * then interpreted in **meters** (ground ribbon width), not pixels. `offset > 0`
   * is not yet implemented (P4) and falls back to absolute height with a warning.
   * WebGL only.
   */
  clamp?: ClampInput
}

/**
 * 多边形图形配置。
 *
 * Polygon graphics options.
 */
export interface PolygonOptions {
  /**
   * 外环顶点的经纬高序列。
   *
   * Outer ring vertices as cartographic coordinates.
   */
  positions: CartographicInput[]
  /**
   * 底面高度（米），默认 `0`。
   *
   * Base height in meters. Defaults to `0`.
   */
  height?: number
  /**
   * 拉伸顶面高度（米）；缺省时渲染为贴给定高度的平面多边形。
   *
   * Extruded top height in meters; when omitted, renders as a flat polygon at
   * {@link height}.
   */
  extrudeHeight?: number
  /**
   * 是否填充，默认 `true`。
   *
   * Whether to fill. Defaults to `true`.
   */
  fill?: boolean
  /**
   * 填充颜色，默认白色。
   *
   * Fill color. Defaults to white.
   */
  color?: ColorInput
  /**
   * 是否显示描边，默认 `false`。
   *
   * Whether to show the outline. Defaults to `false`.
   */
  outline?: boolean
  /**
   * 描边颜色；仅在 {@link outline} 为 `true` 时生效。
   *
   * Outline color; only used when {@link outline} is `true`.
   */
  outlineColor?: ColorInput
  /**
   * 贴地配置。面贴地为 GPU 阴影体分类（P1 尚未实现，当前会降级为平面并告警）。
   *
   * Ground-clamp options. Polygon clamping uses GPU shadow-volume classification
   * (P1, not yet implemented; currently falls back to a flat polygon with a
   * warning).
   */
  clamp?: ClampInput
}

/**
 * 实体配置。一个实体可以挂载任意组合的点、线、面图形组件，共享同一个
 * id、位置和属性。
 *
 * Entity options. An entity may attach any combination of point, polyline and
 * polygon graphics that share the same id, position and properties.
 */
export interface EntityOptions {
  /**
   * 实体 id；缺省时自动生成。同一个 Viewer 内不可重复。
   *
   * Entity id; auto-generated when omitted. Must be unique within a Viewer.
   */
  id?: string
  /**
   * 实体经纬高位置；点图形（`point`）会跟随此位置。
   *
   * Entity cartographic position; the point graphics (`point`) follows it.
   */
  position?: CartographicInput
  /**
   * 点图形配置。
   *
   * Point graphics options.
   */
  point?: PointOptions
  /**
   * 折线图形配置。
   *
   * Polyline graphics options.
   */
  polyline?: PolylineOptions
  /**
   * 多边形图形配置。
   *
   * Polygon graphics options.
   */
  polygon?: PolygonOptions
  /**
   * 自定义属性，会在拾取结果中回传。
   *
   * Custom properties, returned in pick results.
   */
  properties?: Record<string, unknown>
  /**
   * 是否可见，默认 `true`。
   *
   * Whether the entity is visible. Defaults to `true`.
   */
  show?: boolean
}

/**
 * 实体拾取选项。
 *
 * Entity picking options.
 */
export interface PickEntityOptions {
  /**
   * 点和线实体的屏幕空间拾取容差，单位为 CSS 像素。默认 `0`。
   *
   * Screen-space picking tolerance for point and polyline entities, in CSS
   * pixels. Defaults to `0`.
   */
  tolerance?: number
}

/**
 * 实体拾取结果。
 *
 * Entity pick result.
 */
export interface PickedEntity {
  /** 命中的实体。Picked entity. */
  readonly entity: Entity
  /** 命中的世界坐标。Picked world position. */
  readonly point: Vector3
  /** 射线到命中点的距离。Distance from the ray origin to the picked point. */
  readonly distance: number
}
