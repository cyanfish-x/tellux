import type { ColorInput } from './entities'
import type { Picked3DTilesFeature } from './spatial'
import type { Object3D } from 'three'

/**
 * 高亮描边（后处理 Outline）配置。
 *
 * Highlight outline (post-process OutlineEffect) options.
 */
export interface ViewerHighlightOutlineOptions {
  /** 是否启用描边高亮，默认 `true`（仅 WebGL）。Enables outline highlight. Defaults to `true` (WebGL only). */
  enabled?: boolean
  /** 可见轮廓颜色，默认 `#7cff5b`。Visible edge color. Defaults to `#7cff5b`. */
  color?: ColorInput
  /** 被遮挡轮廓颜色，默认与 `color` 相同。Hidden edge color. Defaults to the same as `color`. */
  hiddenColor?: ColorInput
  /** 边缘强度，默认 `1.5`。Edge strength. Defaults to `1.5`. */
  edgeStrength?: number
  /** 是否显示被遮挡轮廓（X-Ray），默认 `true`。Shows occluded edges (X-Ray). Defaults to `true`. */
  xray?: boolean
}

/**
 * 高亮叠加几何（Tiles feature 贴膜）配置。
 *
 * Highlight overlay geometry (Tiles feature film) options.
 */
export interface ViewerHighlightOverlayOptions {
  /** 是否启用叠加高亮，默认 `true`。Enables overlay highlight. Defaults to `true`. */
  enabled?: boolean
  /** 选中态颜色，默认 `#7cff5b`。Selection color. Defaults to `#7cff5b`. */
  color?: ColorInput
  /** 选中态不透明度，默认 `0.55`。Selection opacity. Defaults to `0.55`. */
  opacity?: number
  /** 悬停态颜色，默认 `#38bdf8`。Hover color. Defaults to `#38bdf8`. */
  hoverColor?: ColorInput
  /** 悬停态不透明度，默认 `0.42`。Hover opacity. Defaults to `0.42`. */
  hoverOpacity?: number
}

/**
 * Viewer 高亮配置。
 *
 * Viewer highlight options.
 */
export interface ViewerHighlightOptions {
  /** 后处理描边配置。Post-process outline options. */
  outline?: ViewerHighlightOutlineOptions
  /** 叠加几何配置。Overlay geometry options. */
  overlay?: ViewerHighlightOverlayOptions
}

/**
 * 高亮目标：整对象走描边，3D Tiles feature 走叠加几何。
 *
 * Highlight target: whole objects use outline; 3D Tiles features use overlay.
 */
export type HighlightTarget =
  | Object3D
  | Picked3DTilesFeature
  | { type: 'object'; object: Object3D }
  | { type: 'tilesFeature'; feature: Picked3DTilesFeature }
