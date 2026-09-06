import type { ColorInput } from '../types'
import type { PointGraphic } from './PointGraphic'
import type { PolylineGraphic } from './PolylineGraphic'
import type { PolygonGraphic } from './PolygonGraphic'
import type { SymbolGraphic } from './SymbolGraphic'

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

  get opacity() {
    return this.graphic.opacity
  }

  set opacity(value: number) {
    this.graphic.setOpacity(value)
  }

  /**
   * 描边句柄；初始化未提供 outline 时为 undefined。点和文字的宽度 0 隐藏描边，正数恢复。
   * Outline handle, or undefined when omitted at init. For points and text, width 0 hides it; a positive width restores it.
   */
  get outline() {
    const graphic = this.graphic
    if (!graphic.hasOutline) return undefined
    return {
      /** 描边颜色。Outline color. */
      get color() { return graphic.outlineColor },
      set color(value: ColorInput) { graphic.setOutlineColor(value) },
      /** 描边像素宽度。Outline width in pixels. */
      get width() { return graphic.outlineWidth },
      set width(value: number) { graphic.setOutlineWidth(value) }
    }
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

  get opacity() {
    return this.graphic.opacity
  }

  set opacity(value: number) {
    this.graphic.setOpacity(value)
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

  /**
   * 描边句柄；初始化未提供 outline 时为 undefined。点和文字的宽度 0 隐藏描边，正数恢复。
   * Outline handle, or undefined when omitted at init. For points and text, width 0 hides it; a positive width restores it.
   */
  get outline() {
    const graphic = this.graphic
    if (!graphic.hasOutline) return undefined
    return {
      /** 描边颜色。Outline color. */
      get color() { return graphic.outlineColor },
      set color(value: ColorInput) { graphic.setOutlineColor(value) }
    }
  }

  get opacity() {
    return this.graphic.opacity
  }

  set opacity(value: number) {
    this.graphic.setOpacity(value)
  }
}

/**
 * Symbol 图形运行时句柄。修改字段会即时反映到渲染。
 *
 * Runtime handle for symbol graphics. Mutating fields updates rendering
 * immediately.
 */
export class SymbolGraphics {
  constructor(private readonly graphic: SymbolGraphic) {}

  /** 图标句柄；未配置 icon 时为 `null`。Icon handle, or `null`. */
  get icon(): IconGraphics | null {
    return this.graphic.hasIcon ? new IconGraphics(this.graphic) : null
  }

  /** 文字句柄；未配置 text 时为 `null`。Text handle, or `null`. */
  get text(): TextGraphics | null {
    return this.graphic.hasText ? new TextGraphics(this.graphic) : null
  }

  get rotation() {
    return this.graphic.rotationValue
  }

  set rotation(value: number) {
    this.graphic.setRotation(value)
  }

  get pixelOffset(): [number, number] {
    return this.graphic.pixelOffsetValue
  }

  set pixelOffset(value: [number, number]) {
    this.graphic.setPixelOffset(value[0], value[1])
  }
}

/**
 * 图标运行时句柄（挂在 {@link SymbolGraphics} 下）。
 *
 * Runtime handle for the icon part of a symbol.
 */
export class IconGraphics {
  constructor(private readonly graphic: SymbolGraphic) {}

  get color() {
    return this.graphic.iconColorHex
  }

  set color(value: ColorInput) {
    this.graphic.setIconColor(value)
  }

  get scale() {
    return this.graphic.iconScaleValue
  }

  set scale(value: number) {
    this.graphic.setIconScale(value)
  }

  get opacity() {
    return this.graphic.iconOpacityValue
  }

  set opacity(value: number) {
    this.graphic.setIconOpacity(value)
  }
}

/**
 * 文字标签运行时句柄（挂在 {@link SymbolGraphics} 下）。
 *
 * Runtime handle for the text part of a symbol.
 */
export class TextGraphics {
  constructor(private readonly graphic: SymbolGraphic) {}

  get text() {
    return this.graphic.textValue
  }

  set text(value: string) {
    this.graphic.setText(value)
  }

  get color() {
    return this.graphic.fillColorHex
  }

  set color(value: ColorInput) {
    this.graphic.setFillColor(value)
  }

  /**
   * 描边句柄；初始化未提供 outline 时为 undefined。点和文字的宽度 0 隐藏描边，正数恢复。
   * Outline handle, or undefined when omitted at init. For points and text, width 0 hides it; a positive width restores it.
   */
  get outline() {
    const graphic = this.graphic
    if (!graphic.hasTextOutline) return undefined
    return {
      /** 描边颜色。Outline color. */
      get color() { return graphic.outlineColorHex },
      set color(value: ColorInput) { graphic.setOutlineColor(value) },
      /** 描边像素宽度。Outline width in pixels. */
      get width() { return graphic.outlineWidthValue },
      set width(value: number) { graphic.setOutlineWidth(value) }
    }
  }

  get backgroundColor() {
    return this.graphic.backgroundColorHex
  }

  set backgroundColor(value: ColorInput | null) {
    this.graphic.setBackgroundColor(value)
  }

  get fontSize() {
    return this.graphic.fontSizeValue
  }

  set fontSize(value: number) {
    this.graphic.setFontSize(value)
  }

  get opacity() {
    return this.graphic.textOpacityValue
  }

  set opacity(value: number) {
    this.graphic.setTextOpacity(value)
  }
}
