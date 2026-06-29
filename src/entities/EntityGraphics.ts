import type { ColorInput } from '../types'
import type { PointGraphic } from './PointGraphic'
import type { PolylineGraphic } from './PolylineGraphic'
import type { PolygonGraphic } from './PolygonGraphic'

/**
 * 点图形运行时句柄。修改字段会即时反映到渲染。
 *
 * Runtime handle for point graphics. Mutating fields updates rendering
 * immediately.
 */
export class PointGraphics {
  constructor(private readonly graphic: PointGraphic) {}

  get color() {
    return this.graphic.color
  }

  set color(value: ColorInput) {
    this.graphic.setColor(value)
  }

  get pixelSize() {
    return this.graphic.pixelSize
  }

  set pixelSize(value: number) {
    this.graphic.setPixelSize(value)
  }
}

/**
 * 折线图形运行时句柄。
 *
 * Runtime handle for polyline graphics.
 */
export class PolylineGraphics {
  constructor(private readonly graphic: PolylineGraphic) {}

  get color() {
    return this.graphic.color
  }

  set color(value: ColorInput) {
    this.graphic.setColor(value)
  }

  get width() {
    return this.graphic.width
  }

  set width(value: number) {
    this.graphic.setWidth(value)
  }
}

/**
 * 多边形图形运行时句柄。
 *
 * Runtime handle for polygon graphics.
 */
export class PolygonGraphics {
  constructor(private readonly graphic: PolygonGraphic) {}

  get color() {
    return this.graphic.color
  }

  set color(value: ColorInput) {
    this.graphic.setColor(value)
  }

  get outlineColor() {
    return this.graphic.outlineColor
  }

  set outlineColor(value: ColorInput) {
    this.graphic.setOutlineColor(value)
  }
}
