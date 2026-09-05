import type { Color, Texture, Vector3 } from 'three'
import type { LonLatHeightLike } from './spatial'
import type { Entity } from '../entities/Entity'

/**
 * 颜色输入：数值 hex、CSS 颜色字符串或 Three.js Color。
 *
 * Color input: numeric hex, CSS color string, or a Three.js Color.
 */
export type ColorInput = number | string | Color

/**
 * 点 / 文字描边。对象存在即开启；`width` 默认 `1`。
 *
 * Point / text outline. Presence enables the outline; `width` defaults to `1`.
 */
export interface GraphicOutlineOptions {
  /**
   * 描边颜色，点默认白色，文字默认黑色。
   *
   * Outline color. Defaults to white for points and black for text.
   */
  color?: ColorInput
  /**
   * 描边像素宽度，默认 `1`。
   *
   * Outline pixel width. Defaults to `1`.
   */
  width?: number
}

/**
 * 多边形描边。对象存在即开启。WebGL 下线宽恒为 1，不提供 `width`。
 *
 * Polygon outline. Presence enables the outline. WebGL line width is always 1,
 * so `width` is not provided.
 */
export interface PolygonOutlineOptions {
  /**
   * 描边颜色，默认白色。
   *
   * Outline color. Defaults to white.
   */
  color?: ColorInput
}

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
   * 描边。缺省则无描边；传入对象即开启，{@link GraphicOutlineOptions.width} 默认 `1`。
   *
   * Outline. Omitted means no outline; passing an object enables it, and
   * {@link GraphicOutlineOptions.width} defaults to `1`.
   */
  outline?: GraphicOutlineOptions
  /**
   * 透明度 `[0,1]`，默认 `1`。
   *
   * Opacity in `[0,1]`. Defaults to `1`.
   */
  opacity?: number
}

/**
 * 折线图形配置。
 *
 * Polyline graphics options.
 */
export interface PolylineOptions {
  /**
   * 折线顶点的经纬高序列。贴地（{@link clamp}）时忽略顶点高度。
   *
   * Polyline vertices as longitude/latitude/height. Vertex height is ignored
   * while {@link clamp} is enabled.
   */
  positions: readonly LonLatHeightLike[]
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
   * 透明度 `[0,1]`，默认 `1`。
   *
   * Opacity in `[0,1]`. Defaults to `1`.
   */
  opacity?: number
  /**
   * 是否通过 GPU 深度分类贴合 terrain / 3D Tiles。贴地时 {@link width} 以米为
   * 单位，并忽略顶点高度；当前仅 WebGL 支持。
   *
   * Whether to drape the polyline onto terrain / 3D Tiles using GPU depth
   * classification. When clamped, {@link width} is measured in meters and vertex
   * height is ignored. WebGL only.
   */
  clamp?: boolean
}

/**
 * 多边形图形配置。
 *
 * Polygon graphics options.
 */
export interface PolygonOptions {
  /**
   * 外环顶点的经纬高序列。贴地（{@link clamp}）时忽略顶点高度。
   *
   * Outer ring vertices as longitude/latitude/height. Vertex height is ignored
   * while {@link clamp} is enabled.
   */
  positions: readonly LonLatHeightLike[]
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
   * 透明度 `[0,1]`，默认 `1`。
   *
   * Opacity in `[0,1]`. Defaults to `1`.
   */
  opacity?: number
  /**
   * 描边。缺省则无描边；传入对象即开启。WebGL 下线宽恒为 1。
   *
   * Outline. Omitted means no outline; passing an object enables it. WebGL line
   * width is always 1.
   */
  outline?: PolygonOutlineOptions
  /**
   * 是否通过 GPU 深度分类贴合 terrain / 3D Tiles。贴地时忽略 {@link height}
   * 与顶点高度；{@link extrudeHeight} / {@link outline} 暂不支持。当前仅 WebGL 支持。
   *
   * Whether to drape the polygon onto terrain / 3D Tiles using GPU depth
   * classification. {@link height} and vertex height are ignored while clamped;
   * {@link extrudeHeight} and {@link outline} are not yet supported. WebGL only.
   */
  clamp?: boolean
}

/**
 * Symbol 锚点对齐：组合体（icon + text）的哪个位置对齐到实体 position。
 * `bottom`（默认）= 组合体底部对齐锚点，组合体向上展开（典型 POI 指向）。
 *
 * Symbol anchor: which point of the combined icon + text box aligns to the entity
 * position. `bottom` (default) aligns the box's bottom to the anchor so the box
 * extends upward (typical POI marker).
 */
export type SymbolAnchor =
  | 'center' | 'left' | 'right' | 'top' | 'bottom'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/**
 * text 相对 icon 的排布方向；仅二者同时存在时生效。
 *
 * Layout direction of the text relative to the icon; only used when both exist.
 */
export type SymbolTextRelative = 'left' | 'right' | 'top' | 'bottom'

/**
 * 图标（billboard）配置。默认保留图标原色直接渲染（`colorize: false`）；
 * 设 `colorize: true` 则按 alpha 剪影渲染并以 `color` 染色——任意缩放保持锐利。
 *
 * Icon (billboard) options. By default the icon's original colors are rendered
 * directly (`colorize: false`); set `colorize: true` to render as an alpha
 * silhouette tinted by `color` — crisp at any scale.
 */
export interface IconOptions {
  /**
   * 图标来源：URL / Image / Canvas / THREE.Texture。URL 会跨实体共享同一张 SDF 纹理。
   *
   * Icon source: URL / Image / Canvas / THREE.Texture. URLs share one SDF texture
   * across entities.
   */
  image: string | HTMLImageElement | HTMLCanvasElement | Texture
  /**
   * 缩放，默认 `1`。
   *
   * Scale. Defaults to `1`.
   */
  scale?: number
  /**
   * tint 颜色，默认白色（不染色）。Symbol 后合成路径按目标显示色解析。
   *
   * Tint color. Defaults to white (no tint). Resolved as a target display color
   * in the Symbol post-composite path.
   */
  color?: ColorInput
  /**
   * `false`（默认）= 保留图标原色直接渲染，`color` 作为可选乘法调色（默认白色=不调）。
   * `true` = 按 alpha 剪影渲染并以 `color` 染色（单色 marker，任意缩放保持锐利）。
   *
   * `false` (default) = render the icon's original colors directly; `color` is an
   * optional multiply tint (default white = no tint). `true` = render as an alpha
   * silhouette tinted by `color` (monochrome marker, crisp at any scale).
   */
  colorize?: boolean
  /**
   * 透明度 `[0,1]`，默认 `1`。
   *
   * Opacity in `[0,1]`. Defaults to `1`.
   */
  opacity?: number
}

/**
 * 文字标签配置。文字用 canvas 光栅化（仅 alpha）后生成 SDF 纹理：任意缩放锐利，
 * 描边 / halo 由 shader 距离阈值实现（不烘焙），改色不重建，改文字 / 字号才重建。
 *
 * Text label options. Text is canvas-rasterized (alpha only) then turned into an
 * SDF texture: crisp at any scale, outline / halo via shader distance thresholds
 * (not baked). Color changes don't rebuild; text / font-size changes do.
 */
export interface TextOptions {
  /**
   * 文本内容；支持 `\n` 手动换行。
   *
   * Text content; `\n` produces a manual line break.
   */
  text: string
  /**
   * 字体族，默认 `'sans-serif'`。
   *
   * Font family. Defaults to `'sans-serif'`.
   */
  font?: string
  /**
   * 字号（CSS 像素），默认 `16`。
   *
   * Font size in CSS px. Defaults to `16`.
   */
  fontSize?: number
  /**
   * 字重，默认 `'normal'`。
   *
   * Font weight. Defaults to `'normal'`.
   */
  fontWeight?: 'normal' | 'bold' | number
  /**
   * 填充色，默认白色。Symbol 后合成路径按目标显示色解析。
   *
   * Fill color. Defaults to white. Resolved as a target display color in the
   * Symbol post-composite path.
   */
  color?: ColorInput
  /**
   * 描边。缺省则无描边；传入对象即开启，{@link GraphicOutlineOptions.width} 默认 `1`。
   *
   * Outline. Omitted means no outline; passing an object enables it, and
   * {@link GraphicOutlineOptions.width} defaults to `1`.
   */
  outline?: GraphicOutlineOptions
  /**
   * 背景色；缺省透明。背景为圆角矩形（见 {@link backgroundCornerRadius}）。
   *
   * Background color; transparent when omitted. Drawn as a rounded rect (see
   * {@link backgroundCornerRadius}).
   */
  backgroundColor?: ColorInput
  /**
   * 背景圆角半径（CSS 像素），默认 `0`（直角）。
   *
   * Background corner radius in CSS px. Defaults to `0` (square corners).
   */
  backgroundCornerRadius?: number
  /**
   * 背景内边距 `[x, y]`（CSS 像素），默认 `[4, 2]`。
   *
   * Background padding `[x, y]` in CSS px. Defaults to `[4, 2]`.
   */
  padding?: [number, number]
  /**
   * 行高倍数，默认 `1.2`。
   *
   * Line-height multiplier. Defaults to `1.2`.
   */
  lineHeight?: number
  /**
   * 最大宽度（CSS 像素），超出自动按词换行；缺省不换行（仍尊重手动 `\n`）。
   *
   * Maximum width in CSS px; wraps by word when exceeded. Omitted = no wrapping
   * (manual `\n` still honored).
   */
  maxWidth?: number
  /**
   * 透明度 `[0,1]`，默认 `1`。同时作用于文字与背景。
   *
   * Opacity in `[0,1]`. Defaults to `1`. Applied to both text and background.
   */
  opacity?: number
}

/**
 * Symbol 图形配置：一个锚点上的 icon + text 组合，始终面向屏幕。icon 与 text 可
 * 任意组合（仅 icon / 仅 text / 二者同在），共享锚点、偏移、旋转、排布。
 *
 * Symbol graphics options: an icon + text combo at one anchor, always
 * screen-facing. Icon and text may combine freely (icon-only / text-only / both)
 * and share the anchor, offset, rotation and layout.
 */
export interface SymbolOptions {
  /**
   * 图标配置；与 text 可同时存在。
   *
   * Icon options; may coexist with text.
   */
  icon?: IconOptions
  /**
   * 文字配置；与 icon 可同时存在。
   *
   * Text options; may coexist with icon.
   */
  text?: TextOptions
  /**
   * 组合体锚点对齐，默认 `'bottom'`。
   *
   * Combined-box anchor alignment. Defaults to `'bottom'`.
   */
  anchor?: SymbolAnchor
  /**
   * 相对锚点的像素偏移 `[dx, dy]`（CSS 像素，x 向右、y 向上），默认 `[0, 0]`。
   *
   * Pixel offset `[dx, dy]` from the anchor in CSS px (x right, y up). Defaults
   * to `[0, 0]`.
   */
  pixelOffset?: [number, number]
  /**
   * text 相对 icon 的排布方向，默认 `'right'`。
   *
   * Layout direction of text relative to icon. Defaults to `'right'`.
   */
  textRelative?: SymbolTextRelative
  /**
   * icon 与 text 间距（CSS 像素），默认 `2`。
   *
   * Spacing between icon and text in CSS px. Defaults to `2`.
   */
  textIconSpacing?: number
  /**
   * 旋转（弧度，屏幕空间逆时针），默认 `0`。
   *
   * Rotation in radians (screen-space, counterclockwise). Defaults to `0`.
   */
  rotation?: number
}

/**
 * 实体配置。一个实体可以挂载任意组合的点、线、面、symbol 图形组件，共享同一个
 * id、位置和属性。
 *
 * Entity options. An entity may attach any combination of point, polyline,
 * polygon and symbol graphics that share the same id, position and properties.
 */
export interface EntityOptions {
  /**
   * 实体 id；缺省时自动生成。同一个 Viewer 内不可重复。
   *
   * Entity id; auto-generated when omitted. Must be unique within a Viewer.
   */
  id?: string
  /**
   * 实体经纬高位置；点图形（`point`）与 symbol 图形（`symbol`）会跟随此位置。
   *
   * Entity longitude/latitude/height; the point graphics (`point`) and symbol
   * graphics (`symbol`) follow it.
   */
  position?: LonLatHeightLike
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
   * Symbol 图形配置（屏幕空间图标 + 文字标签），点锚定、始终面向屏幕。
   *
   * Symbol graphics options (screen-space icon + text label), point-anchored
   * and always screen-facing.
   */
  symbol?: SymbolOptions
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
