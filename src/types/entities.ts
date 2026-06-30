import type { Color, Vector3 } from 'three'
import type { CartographicInput } from './spatial'
import type { Entity } from '../entities/Entity'

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
   * 实体 id；缺省时自动生成。同一 Viewer 内不可重复。
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
