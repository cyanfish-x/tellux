import type { Color, Texture, Vector3 } from 'three'
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
   * 贴地配置。`clamp: true`（或 `offset: 0`）时多边形通过 GPU 深度分类真·贴地，
   * 随地形/3D Tiles 起伏贴合，凹多边形支持；此时 {@link height} 被忽略（§4.2），
   * {@link extrudeHeight} / {@link outline} 暂不支持（告警忽略）。填充色支持
   * `rgba(...)` / `#rrggbbaa` 的 alpha 半透明。`offset > 0` 暂未实现（P4），
   * 会降级为绝对高并告警。仅 WebGL 支持。
   *
   * Ground-clamp options. With `clamp: true` (or `offset: 0`) the polygon is
   * draped onto terrain/3D Tiles via GPU depth classification (concave polygons
   * supported); {@link height} is then ignored (§4.2) and {@link extrudeHeight}
   * / {@link outline} are not yet supported (warned and ignored). The fill color
   * honors `rgba(...)` / `#rrggbbaa` alpha. `offset > 0` is not yet implemented
   * (P4) and falls back to absolute height with a warning. WebGL only.
   */
  clamp?: ClampInput
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
 * 图标（billboard）配置。SDF 方案下图标按 alpha 剪影渲染：可任意缩放保持锐利，
 * tint 染色，颜色经反求还原（WYSIWYG）。
 *
 * Icon (billboard) options. Under the SDF scheme the icon is rendered from its
 * alpha silhouette: it stays crisp at any scale, is tinted, and colors are
 * WYSIWYG via tone-mapping inversion.
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
   * `true` = 世界米，`false` = 屏幕像素（默认）。世界米模式暂未实现，会告警降级。
   *
   * `true` = world meters, `false` = screen pixels (default). World-meters mode is
   * not yet implemented and falls back with a warning.
   */
  sizeInMeters?: boolean
  /**
   * tint 颜色，默认白色（不染色）。经 resolveColor 反求。
   *
   * Tint color. Defaults to white (no tint). WYSIWYG via resolveColor.
   */
  color?: ColorInput
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
   * 填充色，默认白色。经 resolveColor 反求。
   *
   * Fill color. Defaults to white. WYSIWYG via resolveColor.
   */
  fillColor?: ColorInput
  /**
   * 描边色；仅 {@link outlineWidth} 大于 0 时生效。经 resolveColor 反求。
   *
   * Outline color; only used when {@link outlineWidth} is greater than 0.
   * WYSIWYG via resolveColor.
   */
  outlineColor?: ColorInput
  /**
   * 描边像素宽，默认 `0`（无描边）。描边在字形外圈，距离化抗锯齿。
   *
   * Outline width in px. Defaults to `0` (no outline). The outline sits outside
   * the glyphs and is anti-aliased via the distance field.
   */
  outlineWidth?: number
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
  /**
   * 贴地配置。Symbol 贴地暂未实现（会告警降级为绝对高）。
   *
   * Ground-clamp options. Symbol clamping is not yet implemented (falls back to
   * absolute height with a warning).
   */
  clamp?: ClampInput
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
   * Entity cartographic position; the point graphics (`point`) and symbol
   * graphics (`symbol`) follow it.
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
