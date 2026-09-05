import type { ColorInput } from '../types'
import type { ResolvedHighlightOptions } from './SceneOptions'

function colorsEqual(a: ColorInput, b: ColorInput) {
  return a === b
}

class HighlightOutlineSettings {
  readonly #options: ResolvedHighlightOptions['outline']
  readonly #onChange: () => void

  constructor(
    options: ResolvedHighlightOptions['outline'],
    onChange: () => void
  ) {
    this.#options = options
    this.#onChange = onChange
  }

  /** 是否启用描边高亮。Whether outline highlight is enabled. */
  get enabled() {
    return this.#options.enabled
  }

  set enabled(value: boolean) {
    if (this.#options.enabled === value) return
    this.#options.enabled = value
    this.#onChange()
  }

  /** 可见轮廓颜色。Visible edge color. */
  get color() {
    return this.#options.color
  }

  set color(value: ColorInput) {
    if (colorsEqual(this.#options.color, value)) return
    this.#options.color = value
    this.#onChange()
  }

  /** 被遮挡轮廓颜色。Hidden edge color. */
  get hiddenColor() {
    return this.#options.hiddenColor
  }

  set hiddenColor(value: ColorInput) {
    if (colorsEqual(this.#options.hiddenColor, value)) return
    this.#options.hiddenColor = value
    this.#onChange()
  }

  /** 边缘强度。Edge strength. */
  get edgeStrength() {
    return this.#options.edgeStrength
  }

  set edgeStrength(value: number) {
    if (this.#options.edgeStrength === value) return
    this.#options.edgeStrength = value
    this.#onChange()
  }

  /** 是否显示被遮挡轮廓。Whether occluded edges are visible (X-Ray). */
  get xray() {
    return this.#options.xray
  }

  set xray(value: boolean) {
    if (this.#options.xray === value) return
    this.#options.xray = value
    this.#onChange()
  }
}

class HighlightOverlaySettings {
  readonly #options: ResolvedHighlightOptions['overlay']
  readonly #onChange: () => void

  constructor(
    options: ResolvedHighlightOptions['overlay'],
    onChange: () => void
  ) {
    this.#options = options
    this.#onChange = onChange
  }

  /** 是否启用叠加高亮。Whether overlay highlight is enabled. */
  get enabled() {
    return this.#options.enabled
  }

  set enabled(value: boolean) {
    if (this.#options.enabled === value) return
    this.#options.enabled = value
    this.#onChange()
  }

  /** 选中态颜色。Selection color. */
  get color() {
    return this.#options.color
  }

  set color(value: ColorInput) {
    if (colorsEqual(this.#options.color, value)) return
    this.#options.color = value
    this.#onChange()
  }

  /** 选中态不透明度。Selection opacity. */
  get opacity() {
    return this.#options.opacity
  }

  set opacity(value: number) {
    const next = Math.min(Math.max(value, 0), 1)
    if (this.#options.opacity === next) return
    this.#options.opacity = next
    this.#onChange()
  }

  /** 悬停态颜色。Hover color. */
  get hoverColor() {
    return this.#options.hoverColor
  }

  set hoverColor(value: ColorInput) {
    if (colorsEqual(this.#options.hoverColor, value)) return
    this.#options.hoverColor = value
    this.#onChange()
  }

  /** 悬停态不透明度。Hover opacity. */
  get hoverOpacity() {
    return this.#options.hoverOpacity
  }

  set hoverOpacity(value: number) {
    const next = Math.min(Math.max(value, 0), 1)
    if (this.#options.hoverOpacity === next) return
    this.#options.hoverOpacity = next
    this.#onChange()
  }
}

/**
 * 高亮（描边 / 叠加）运行时设置。
 *
 * Highlight (outline / overlay) runtime settings.
 */
export class HighlightSettings {
  readonly outline: HighlightOutlineSettings
  readonly overlay: HighlightOverlaySettings

  constructor(
    options: ResolvedHighlightOptions,
    onChange: () => void
  ) {
    this.outline = new HighlightOutlineSettings(options.outline, onChange)
    this.overlay = new HighlightOverlaySettings(options.overlay, onChange)
  }
}
