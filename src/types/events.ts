import type { Viewer } from '../Viewer'
import type { LonLatHeight, ScreenPosition } from './spatial'
import type { ViewerPickResult } from './pick'

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
  cartographic: LonLatHeight | null
  /**
   * 最近的可选中对象命中；未命中时为 `null`。
   *
   * `click` 来自完整 `pickAll`；`mousemove` 来自 nearest-only（`picks` 至多一项）。
   *
   * Nearest selectable hit, or `null` when nothing is hit.
   *
   * For `click` this comes from full `pickAll`; for `mousemove` it comes from
   * nearest-only picking (`picks` has at most one entry).
   */
  pick: ViewerPickResult | null
  /**
   * 可选中对象命中列表，由近到远。
   *
   * `click` 为完整 drill 结果；`mousemove` 默认仅含最近一项。
   *
   * Selectable hits nearest first.
   *
   * For `click` this is the full drill result; for `mousemove` it defaults to
   * at most the nearest hit.
   */
  picks: ViewerPickResult[]
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
