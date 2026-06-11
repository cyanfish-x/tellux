import type { Viewer } from '../Viewer'
import type { CartographicCoordinates, Picked3DTilesFeature, ScreenPosition } from './spatial'

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
  /**
   * 鼠标位置命中的 3D Tiles feature；未命中已加载 3D Tiles 时为 `null`。
   *
   * 该值只包含当前场景中已经加载的瓦片内容，不会额外请求更高精度瓦片。
   *
   * 3D Tiles feature hit by the mouse position, or `null` when no loaded 3D
   * Tiles feature is hit.
   *
   * This only uses currently loaded tile content and does not request more
   * detailed tiles.
   */
  tilesetFeature: Picked3DTilesFeature | null
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
