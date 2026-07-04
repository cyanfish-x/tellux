import * as THREE from 'three'
import type { ColorInput, IconOptions, SymbolAnchor, SymbolOptions, SymbolTextRelative, TextOptions } from '../types'
import { resolveColor } from './invertToneMapping'
import { AnchorQuadGraphic } from './AnchorQuadGraphic'
import { generateSDF, sampleRoundedRectAlpha, sampleSdfAlpha, type SDFResult } from './sdf'

/** 图标 SDF 的源距离场半径（源像素）。Icon SDF source radius (source px). */
const ICON_SPREAD = 16
/** 文字 SDF 的基础距离场半径（CSS 像素）。Base text SDF radius (CSS px). */
const TEXT_SPREAD_BASE = 8

interface IconCacheEntry {
  sdf: SDFResult
  naturalWidth: number
  naturalHeight: number
  refCount: number
}

/** URL → 共享图标 SDF，多实体同 URL 复用同一张纹理（引用计数释放）。Shared icon SDF by URL. */
const iconCache = new Map<string, IconCacheEntry>()

interface Size2 {
  w: number
  h: number
}

/** 屏幕空间拾取用的单个 quad 矩形（CSS 像素，y 向上，相对锚点）。Screen-space pick rect. */
interface PickRect {
  /** 矩形中心相对锚点的 CSS 偏移（y 向上）。Center offset from anchor in CSS px (y up). */
  cx: number
  cy: number
  /** 矩形 CSS 尺寸（含 SDF spread / 背景内边距）。CSS size (incl. SDF spread / bg padding). */
  w: number
  h: number
  kind: 'sdf' | 'bg'
  canvas?: HTMLCanvasElement
  spread?: number
  outlineWidth?: number
  smoothing: number
  cornerRadius?: number
  /** 绘制缓冲尺寸（bg 程序化 alpha 用）。Drawing-buffer size (bg procedural alpha). */
  sizeDx?: number
  sizeDy?: number
}

interface SymbolGraphicOptions {
  position: THREE.Vector3
  options: SymbolOptions
  pixelRatio: number
}

/**
 * Symbol 图形：一个锚点上的 icon + 文字标签组合，始终面向屏幕。
 *
 * 持 1~2 个 {@link AnchorQuadGraphic}（icon quad / text quad），可选一个程序化圆角矩形
 * 背景 quad。icon 从图片 alpha 生成 SDF（按 URL 共享缓存），text 先用 canvas 光栅化（仅
 * alpha）再生成 SDF；描边 / halo 由 shader 距离阈值实现，不烘焙。布局（textRelative /
 * anchor / spacing / pixelOffset）在 CPU 算，每个 quad 得到自己的像素偏移；颜色作为
 * uniform 经 {@link resolveColor} 反求（WYSIWYG）。
 *
 * Symbol graphics: an icon + text label combo at one anchor, always screen-facing.
 * Holds 1–2 AnchorQuadGraphics (icon / text) and an optional procedural rounded-rect
 * background. Icons generate an SDF from image alpha (shared cache by URL); text is
 * canvas-rasterized (alpha only) then turned into an SDF. Outline / halo is shader
 * distance-thresholded, not baked. Layout (textRelative / anchor / spacing / pixelOffset)
 * is computed on the CPU; colors are WYSIWYG uniforms via resolveColor.
 */
export class SymbolGraphic {
  readonly object3D: THREE.Group
  private readonly iconQuad: AnchorQuadGraphic | null
  private readonly textQuad: AnchorQuadGraphic | null
  private bgQuad: AnchorQuadGraphic | null

  private position: THREE.Vector3
  private pixelRatio: number
  private rotation: number
  private pixelOffset: [number, number]
  private anchor: SymbolAnchor
  private textRelative: SymbolTextRelative
  private textIconSpacing: number

  // icon 状态 / icon state
  private iconScale: number
  private iconOpacity: number
  private iconNatural: Size2 | null = null
  private iconSdf: SDFResult | null = null
  private iconCacheKey: string | null = null
  private iconOwnsTexture = false

  // text 状态 / text state
  private textContent: Size2 | null = null
  private textSdf: SDFResult | null = null
  private textConfig: Required<Pick<TextOptions, 'text' | 'font' | 'fontSize' | 'fontWeight' | 'outlineWidth' | 'lineHeight'>> & {
    maxWidth?: number
    padding: [number, number]
    fillColor: THREE.Color
    outlineColor: THREE.Color
    backgroundColor: THREE.Color | null
    backgroundCornerRadius: number
    opacity: number
    spread: number
  }
  private disposed = false
  private pickRects: PickRect[] = []

  constructor({ position, options, pixelRatio }: SymbolGraphicOptions) {
    this.position = position.clone()
    this.pixelRatio = pixelRatio
    this.rotation = options.rotation ?? 0
    this.pixelOffset = options.pixelOffset ? [options.pixelOffset[0], options.pixelOffset[1]] : [0, 0]
    this.anchor = options.anchor ?? 'bottom'
    this.textRelative = options.textRelative ?? 'right'
    this.textIconSpacing = options.textIconSpacing ?? 2
    this.object3D = new THREE.Group()
    this.object3D.matrixAutoUpdate = false
    this.object3D.updateMatrix()

    // ---- icon ----
    this.iconQuad = options.icon ? new AnchorQuadGraphic() : null
    this.iconScale = options.icon?.scale ?? 1
    this.iconOpacity = options.icon?.opacity ?? 1
    if (this.iconQuad) {
      this.iconQuad.setPosition(this.position)
      this.iconQuad.setTint(options.icon?.color ?? 0xffffff)
      this.iconQuad.setOpacity(this.iconOpacity)
      this.iconQuad.setOutlineWidth(0)
      this.iconQuad.setRenderOrder(1)
      this.object3D.add(this.iconQuad.object3D)
      if (options.icon) {
        if (options.icon.sizeInMeters) {
          console.warn('[tellux] Symbol icon sizeInMeters 暂未实现，按屏幕像素渲染。')
        }
        void this.loadIcon(options.icon)
      }
    }

    // ---- text ----
    const text = options.text
    this.textQuad = text ? new AnchorQuadGraphic() : null
    const outlineWidth = text?.outlineWidth ?? 0
    this.textConfig = {
      text: text?.text ?? '',
      font: text?.font ?? 'sans-serif',
      fontSize: text?.fontSize ?? 16,
      fontWeight: text?.fontWeight ?? 'normal',
      outlineWidth,
      lineHeight: text?.lineHeight ?? 1.2,
      maxWidth: text?.maxWidth,
      padding: text?.padding ? [text.padding[0], text.padding[1]] : [4, 2],
      fillColor: resolveColor(text?.fillColor ?? 0xffffff),
      outlineColor: resolveColor(text?.outlineColor ?? 0x000000),
      backgroundColor: text?.backgroundColor === undefined ? null : resolveColor(text.backgroundColor),
      backgroundCornerRadius: text?.backgroundCornerRadius ?? 0,
      opacity: text?.opacity ?? 1,
      spread: Math.max(TEXT_SPREAD_BASE, outlineWidth + 4)
    }
    const bgColor = this.textConfig.backgroundColor
    this.bgQuad = bgColor ? new AnchorQuadGraphic() : null
    if (this.bgQuad && bgColor) {
      this.bgQuad.setPosition(this.position)
      this.bgQuad.setProceduralBackground()
      this.bgQuad.setTintRaw(bgColor)
      this.bgQuad.setOpacity(this.textConfig.opacity)
      this.bgQuad.setCornerRadius(this.textConfig.backgroundCornerRadius)
      this.bgQuad.setRenderOrder(-1)
      this.object3D.add(this.bgQuad.object3D)
    }
    if (this.textQuad) {
      this.textQuad.setPosition(this.position)
      this.applyTextUniforms()
      this.textQuad.setRenderOrder(0)
      this.object3D.add(this.textQuad.object3D)
      this.rebuildTextSdf()
    }

    this.update()
  }

  setPosition(position: THREE.Vector3) {
    this.position.copy(position)
    this.iconQuad?.setPosition(position)
    this.textQuad?.setPosition(position)
    this.bgQuad?.setPosition(position)
  }

  setRotation(rotation: number) {
    this.rotation = rotation
    this.iconQuad?.setRotation(rotation)
    this.textQuad?.setRotation(rotation)
    this.bgQuad?.setRotation(rotation)
  }

  setPixelOffset(dx: number, dy: number) {
    this.pixelOffset = [dx, dy]
    this.update()
  }

  // ----- 只读状态（供 SymbolGraphics / IconGraphics / TextGraphics 句柄读取）-----
  // Read-only state exposed to the *Graphics runtime handles.
  get hasIcon(): boolean { return this.iconQuad !== null }
  get hasText(): boolean { return this.textQuad !== null }
  get rotationValue(): number { return this.rotation }
  get pixelOffsetValue(): [number, number] { return [this.pixelOffset[0], this.pixelOffset[1]] }
  get iconColorHex(): number { return this.iconQuad?.tintHex ?? 0xffffff }
  get iconScaleValue(): number { return this.iconScale }
  get iconOpacityValue(): number { return this.iconOpacity }
  get textValue(): string { return this.textConfig.text }
  get fillColorHex(): number { return this.textConfig.fillColor.getHex() }
  get outlineColorHex(): number { return this.textConfig.outlineColor.getHex() }
  get backgroundColorHex(): number | null {
    return this.textConfig.backgroundColor ? this.textConfig.backgroundColor.getHex() : null
  }
  get fontSizeValue(): number { return this.textConfig.fontSize }
  get textOpacityValue(): number { return this.textConfig.opacity }

  // ----- text 句柄 / text handle -----
  setText(text: string) {
    if (!this.textQuad) return
    this.textConfig.text = text
    this.rebuildTextSdf()
    this.update()
  }

  setFillColor(color: ColorInput) {
    this.textConfig.fillColor = resolveColor(color)
    this.applyTextUniforms()
  }

  setOutlineColor(color: ColorInput) {
    this.textConfig.outlineColor = resolveColor(color)
    this.applyTextUniforms()
  }

  setOutlineWidth(width: number) {
    if (!this.textQuad) return
    this.textConfig.outlineWidth = Math.max(0, width)
    this.textConfig.spread = Math.max(TEXT_SPREAD_BASE, this.textConfig.outlineWidth + 4)
    this.rebuildTextSdf()
    this.update()
  }

  setFontSize(size: number) {
    if (!this.textQuad) return
    this.textConfig.fontSize = size
    this.rebuildTextSdf()
    this.update()
  }

  setTextOpacity(opacity: number) {
    this.textConfig.opacity = Math.max(0, Math.min(1, opacity))
    this.textQuad?.setOpacity(this.textConfig.opacity)
    this.bgQuad?.setOpacity(this.textConfig.opacity)
  }

  setBackgroundColor(color: ColorInput | null) {
    const resolved = color === null ? null : resolveColor(color)
    this.textConfig.backgroundColor = resolved
    if (resolved && !this.bgQuad) {
      // 首次设置背景：创建 bg quad。
      const quad = new AnchorQuadGraphic()
      quad.setPosition(this.position)
      quad.setProceduralBackground()
      quad.setTint(resolved)
      quad.setOpacity(this.textConfig.opacity)
      quad.setCornerRadius(this.textConfig.backgroundCornerRadius)
      quad.setRenderOrder(-1)
      this.bgQuad = quad
      this.object3D.add(quad.object3D)
    } else if (this.bgQuad) {
      if (resolved) {
        this.bgQuad.setTint(resolved)
      } else {
        this.object3D.remove(this.bgQuad.object3D)
        this.bgQuad.dispose()
        this.bgQuad = null
      }
    }
    this.update()
  }

  // ----- icon 句柄 / icon handle -----
  setIconColor(color: ColorInput) {
    this.iconQuad?.setTint(color)
  }

  setIconScale(scale: number) {
    this.iconScale = scale
    this.update()
  }

  setIconOpacity(opacity: number) {
    this.iconOpacity = Math.max(0, Math.min(1, opacity))
    this.iconQuad?.setOpacity(this.iconOpacity)
  }

  syncResolution(width: number, height: number, pixelRatio: number) {
    this.iconQuad?.syncResolution(width, height)
    this.textQuad?.syncResolution(width, height)
    this.bgQuad?.syncResolution(width, height)
    if (pixelRatio !== this.pixelRatio) {
      this.pixelRatio = pixelRatio
      // pixelRatio 变化影响文字 SDF 分辨率与所有 quad 的像素尺寸 / spread，需重建 + 重排。
      // pixelRatio changes text SDF resolution and every quad's pixel size / spread.
      if (this.textQuad) this.rebuildTextSdf()
      this.update()
    }
  }

  dispose() {
    this.disposed = true
    if (this.iconCacheKey) {
      const entry = iconCache.get(this.iconCacheKey)
      if (entry) {
        entry.refCount -= 1
        if (entry.refCount <= 0) {
          entry.sdf.texture.dispose()
          iconCache.delete(this.iconCacheKey)
        }
      }
    } else if (this.iconSdf && this.iconOwnsTexture) {
      this.iconSdf.texture.dispose()
    }
    this.iconQuad?.dispose()
    this.textQuad?.dispose()
    this.bgQuad?.dispose()
    this.textSdf?.texture.dispose()
  }

  // ----- 内部 / internals -----

  private applyTextUniforms() {
    if (!this.textQuad) return
    this.textQuad.setTintRaw(this.textConfig.fillColor)
    this.textQuad.setOutlineColorRaw(this.textConfig.outlineColor)
    this.textQuad.setOutlineWidth(this.textConfig.outlineWidth * this.pixelRatio)
    this.textQuad.setOpacity(this.textConfig.opacity)
  }

  private async loadIcon(icon: IconOptions) {
    if (!this.iconQuad) return
    let source: HTMLImageElement | HTMLCanvasElement
    let url: string | undefined
    try {
      const resolved = await resolveIconSource(icon.image)
      source = resolved.source
      url = resolved.url
    } catch (error) {
      console.error('[tellux] Symbol 图标加载失败：', error)
      return
    }
    // 异步加载期间实体可能已 dispose；此时不获取任何缓存引用，直接退出避免泄漏。
    // The entity may have been disposed during the async load; bail before acquiring
    // any cache reference to avoid leaking a refcount.
    if (this.disposed) return
    const natW = source instanceof HTMLImageElement ? source.naturalWidth : source.width
    const natH = source instanceof HTMLImageElement ? source.naturalHeight : source.height
    if (url) {
      const cached = iconCache.get(url)
      if (cached) {
        cached.refCount += 1
        this.iconCacheKey = url
        this.iconNatural = { w: cached.naturalWidth, h: cached.naturalHeight }
        this.iconSdf = cached.sdf
        this.applyIconSdf()
        return
      }
      const sdf = generateSDF(source, ICON_SPREAD)
      iconCache.set(url, {
        sdf,
        naturalWidth: natW,
        naturalHeight: natH,
        refCount: 1
      })
      this.iconCacheKey = url
      this.iconNatural = { w: natW, h: natH }
      this.iconSdf = sdf
      this.applyIconSdf()
      return
    }
    // 非 URL 源：每个实体独占一张 SDF，dispose 时释放。
    const sdf = generateSDF(source, ICON_SPREAD)
    this.iconSdf = sdf
    this.iconOwnsTexture = true
    this.iconNatural = { w: natW, h: natH }
    this.applyIconSdf()
  }

  private applyIconSdf() {
    if (this.disposed || !this.iconQuad || !this.iconSdf) return
    this.iconQuad.setMap(this.iconSdf.texture)
    this.update()
  }

  private rebuildTextSdf() {
    if (!this.textQuad) return
    const pr = this.pixelRatio
    const cfg = this.textConfig
    const { canvas, contentW, contentH } = buildTextCanvas(cfg, pr)
    const spreadSource = Math.round(cfg.spread * pr)
    this.textSdf = generateSDF(canvas, spreadSource)
    this.textContent = { w: contentW, h: contentH }
    this.textQuad.setMap(this.textSdf.texture)
    this.textQuad.setSpread(this.textSdf.spread)
  }

  /** 重算所有 quad 的像素尺寸、spread、像素偏移。Recompute every quad's size, spread, offset. */
  private update() {
    const pr = this.pixelRatio
    const iconBox = this.iconNatural
      ? { w: this.iconNatural.w * this.iconScale, h: this.iconNatural.h * this.iconScale }
      : null
    const textBox = this.textContent ? { w: this.textContent.w, h: this.textContent.h } : null

    // icon quad 尺寸 / spread（SDF 被拉伸 scale×pr）。
    if (this.iconQuad && this.iconSdf && iconBox) {
      const sx = this.iconSdf.width * this.iconScale * pr
      const sy = this.iconSdf.height * this.iconScale * pr
      this.iconQuad.setPixelSize(sx, sy)
      this.iconQuad.setSpread(this.iconSdf.spread * this.iconScale * pr)
    }
    // text quad 尺寸 / spread（1:1 显示）。
    if (this.textQuad && this.textSdf) {
      this.textQuad.setPixelSize(this.textSdf.width, this.textSdf.height)
      this.textQuad.setSpread(this.textSdf.spread)
      this.textQuad.setOutlineWidth(this.textConfig.outlineWidth * pr)
    }
    // bg quad 尺寸（文字内容 + padding）。
    if (this.bgQuad && textBox) {
      const bw = (textBox.w + this.textConfig.padding[0] * 2) * pr
      const bh = (textBox.h + this.textConfig.padding[1] * 2) * pr
      this.bgQuad.setPixelSize(bw, bh)
      this.bgQuad.setCornerRadius(this.textConfig.backgroundCornerRadius * pr)
    }

    // 布局：组合 icon + text，按 anchor 对齐，加 pixelOffset。
    const layout = layoutComposite(iconBox, textBox, this.textRelative, this.textIconSpacing)
    const shift = anchorOffset(this.anchor, layout.halfW, layout.halfH)
    const [poX, poY] = this.pixelOffset
    this.pickRects = []

    if (this.iconQuad && iconBox && this.iconSdf) {
      const cx = layout.iconCenter[0] + shift[0] + poX
      const cy = layout.iconCenter[1] + shift[1] + poY
      this.iconQuad.setPixelOffset(cx * pr, cy * pr)
      this.iconQuad.setRotation(this.rotation)
      const canvas = this.iconSdf.texture.image
      if (canvas instanceof HTMLCanvasElement) {
        this.pickRects.push({
          cx, cy,
          w: this.iconSdf.width * this.iconScale,
          h: this.iconSdf.height * this.iconScale,
          kind: 'sdf',
          canvas,
          spread: this.iconSdf.spread * this.iconScale * pr,
          outlineWidth: 0,
          smoothing: 0.5
        })
      }
    }
    if (this.textQuad && textBox && this.textSdf) {
      const cx = layout.textCenter[0] + shift[0] + poX
      const cy = layout.textCenter[1] + shift[1] + poY
      this.textQuad.setPixelOffset(cx * pr, cy * pr)
      this.textQuad.setRotation(this.rotation)
      const canvas = this.textSdf.texture.image
      if (canvas instanceof HTMLCanvasElement) {
        this.pickRects.push({
          cx, cy,
          w: this.textSdf.width / pr,
          h: this.textSdf.height / pr,
          kind: 'sdf',
          canvas,
          spread: this.textSdf.spread,
          outlineWidth: this.textConfig.outlineWidth * pr,
          smoothing: 0.5
        })
      }
    }
    if (this.bgQuad && textBox) {
      // 背景以文字内容为中心。
      const cx = layout.textCenter[0] + shift[0] + poX
      const cy = layout.textCenter[1] + shift[1] + poY
      this.bgQuad.setPixelOffset(cx * pr, cy * pr)
      this.bgQuad.setRotation(this.rotation)
      const bw = textBox.w + this.textConfig.padding[0] * 2
      const bh = textBox.h + this.textConfig.padding[1] * 2
      this.pickRects.push({
        cx, cy,
        w: bw, h: bh,
        kind: 'bg',
        smoothing: 0.5,
        cornerRadius: this.textConfig.backgroundCornerRadius * pr,
        sizeDx: bw * pr,
        sizeDy: bh * pr
      })
    }
  }

  /**
   * 屏幕空间拾取：把鼠标 NDC 与每个 quad 的屏幕矩形（含旋转）求交，命中后按 uv 采样
   * SDF / 圆角矩形 alpha，剔除透明像素。`mouse` 为 CSS 像素（y 向下，相对画布）。
   * 返回最近命中（按屏幕距离）或 `null`。
   *
   * Screen-space picking: intersects the mouse NDC with each quad's screen rect
   * (rotation-aware), then samples the SDF / rounded-rect alpha at the hit uv to reject
   * transparent fragments. `mouse` is in CSS px (y down, relative to the canvas). Returns
   * the closest hit (by screen distance) or `null`.
   */
  pickScreenSpace(
    mouse: THREE.Vector2,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number
  ): { distance: number; screenDistance: number; point: THREE.Vector3 } | null {
    if (this.pickRects.length === 0) return null
    const projected = projectToNdc(this.position, camera)
    if (projected === null) return null
    const anchorNdcX = projected.x
    const anchorNdcY = projected.y
    // 锚点的屏幕 CSS（y 向下），用于算屏幕距离。
    const anchorScreenX = (anchorNdcX + 1) * 0.5 * width
    const anchorScreenY = (-anchorNdcY + 1) * 0.5 * height
    const mouseNdcX = (mouse.x / width) * 2 - 1
    const mouseNdcY = 1 - (mouse.y / height) * 2
    const c = Math.cos(this.rotation)
    const s = Math.sin(this.rotation)
    const halfWidth = width / 2
    const halfHeight = height / 2

    let best: { distance: number; screenDistance: number } | null = null
    for (const rect of this.pickRects) {
      const centerNdcX = anchorNdcX + rect.cx / halfWidth
      const centerNdcY = anchorNdcY + rect.cy / halfHeight
      const dx = mouseNdcX - centerNdcX
      const dy = mouseNdcY - centerNdcY
      // shader 把 quad 绕中心逆时针旋转 θ；命中判定把鼠标反向旋转回 quad 局部坐标。
      // The shader rotates the quad CCW by θ; inverse-rotate the mouse into the quad frame.
      const lx = c * dx + s * dy
      const ly = -s * dx + c * dy
      const cornerX = (lx / (rect.w / halfWidth)) / 2
      const cornerY = (ly / (rect.h / halfHeight)) / 2
      if (Math.abs(cornerX) > 0.5 || Math.abs(cornerY) > 0.5) continue
      const uvX = cornerX + 0.5
      const uvY = cornerY + 0.5
      let alpha: number
      if (rect.kind === 'bg') {
        alpha = sampleRoundedRectAlpha(uvX, uvY, rect.sizeDx!, rect.sizeDy!, rect.cornerRadius!, rect.smoothing)
      } else {
        alpha = sampleSdfAlpha(rect.canvas!, uvX, uvY, rect.spread!, rect.outlineWidth!, rect.smoothing)
      }
      if (alpha < 0.5) continue
      const rectScreenX = anchorScreenX + rect.cx
      const rectScreenY = anchorScreenY - rect.cy // CSS y 向下，翻转布局 y-up。
      const screenDistance = Math.hypot(mouse.x - rectScreenX, mouse.y - rectScreenY)
      if (best === null || screenDistance < best.screenDistance) {
        best = { distance: camera.position.distanceTo(this.position), screenDistance }
      }
    }
    return best === null
      ? null
      : { distance: best.distance, screenDistance: best.screenDistance, point: this.position.clone() }
  }
}

/** 把 IconOptions.image 解析成可光栅化的位图源；URL 走共享加载。Resolve icon image to a raster source. */
async function resolveIconSource(
  image: IconOptions['image']
): Promise<{ source: HTMLImageElement | HTMLCanvasElement; url?: string }> {
  if (typeof image === 'string') {
    const img = await loadImage(image)
    return { source: img, url: image }
  }
  if (image instanceof HTMLImageElement) {
    await awaitImage(image)
    return { source: image }
  }
  if (image instanceof HTMLCanvasElement) {
    return { source: image }
  }
  // THREE.Texture：取其 .image（通常是已加载的 HTMLImageElement / Canvas）。
  if (image && typeof image === 'object' && 'image' in image) {
    const inner = (image as THREE.Texture).image
    if (inner instanceof HTMLImageElement) {
      await awaitImage(inner)
      return { source: inner }
    }
    if (inner instanceof HTMLCanvasElement) {
      return { source: inner }
    }
  }
  throw new Error('Unsupported icon image source.')
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load icon: ${url}`))
    img.src = url
  })
}

function awaitImage(img: HTMLImageElement): Promise<HTMLImageElement> {
  if (img.complete && img.naturalWidth > 0) return Promise.resolve(img)
  return new Promise((resolve, reject) => {
    img.addEventListener('load', () => resolve(img), { once: true })
    img.addEventListener('error', () => reject(new Error('Failed to load icon image.')), { once: true })
  })
}

/**
 * 用 canvas 光栅化文字（仅 alpha 覆盖，白色字形透明底）。返回内容尺寸（CSS 像素）与
 * 按 pixelRatio 超采样的画布。描边 / halo 不烘焙——由 shader 距离阈值实现。
 *
 * Rasterize text to a canvas as alpha coverage only (white glyphs, transparent bg).
 * Returns the content size (CSS px) and a pixelRatio-supersampled canvas. Outline / halo
 * is not baked — it comes from shader distance thresholds.
 */
function buildTextCanvas(
  cfg: SymbolGraphic['textConfig'],
  pixelRatio: number
): { canvas: HTMLCanvasElement; contentW: number; contentH: number } {
  const font = `${cfg.fontWeight} ${cfg.fontSize}px ${cfg.font}`
  // 先用 1× 画布测量与排版，再按 pixelRatio 放大重绘以保证 SDF 源锐利。
  const measureCanvas = document.createElement('canvas')
  const mctx = measureCanvas.getContext('2d')!
  mctx.font = font
  const lineHeightPx = cfg.fontSize * cfg.lineHeight
  const lines = wrapText(mctx, cfg.text, cfg.maxWidth)
  let contentW = 0
  for (const line of lines) {
    contentW = Math.max(contentW, mctx.measureText(line).width)
  }
  contentW = Math.ceil(contentW)
  const contentH = Math.ceil(lines.length * lineHeightPx)

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(contentW * pixelRatio))
  canvas.height = Math.max(1, Math.round(contentH * pixelRatio))
  const ctx = canvas.getContext('2d')!
  ctx.scale(pixelRatio, pixelRatio)
  ctx.font = font
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'left'
  // 垂直微调：让字形在行高内视觉居中。
  const yOffset = (cfg.fontSize * (cfg.lineHeight - 1)) / 2
  for (let i = 0; i < lines.length; i += 1) {
    ctx.fillText(lines[i], 0, i * lineHeightPx + yOffset)
  }
  return { canvas, contentW, contentH }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth?: number): string[] {
  const explicitLines = text.split('\n')
  if (maxWidth === undefined) return explicitLines
  const result: string[] = []
  for (const line of explicitLines) {
    if (line === '') {
      result.push('')
      continue
    }
    let current = ''
    for (const segment of splitPreservingSpaces(line)) {
      const candidate = current + segment
      if (ctx.measureText(candidate).width > maxWidth && current !== '') {
        result.push(current.replace(/\s+$/, ''))
        current = segment.replace(/^\s+/, '')
      } else {
        current = candidate
      }
    }
    result.push(current)
  }
  return result
}

/** 按词与空白切分，保留空白以便换行后拼接还原。Split keeping spaces for rejoin. */
function splitPreservingSpaces(line: string): string[] {
  const result: string[] = []
  const regex = /\s+|\S+/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(line)) !== null) {
    result.push(match[0])
  }
  return result.length > 0 ? result : ['']
}

interface CompositeLayout {
  halfW: number
  halfH: number
  iconCenter: [number, number]
  textCenter: [number, number]
}

/** 算 icon + text 组合体的半尺寸与各自中心（相对组合体中心，y 向上为正）。Layout icon+text. */
function layoutComposite(
  icon: Size2 | null,
  text: Size2 | null,
  relative: SymbolTextRelative,
  spacing: number
): CompositeLayout {
  if (icon && text) {
    if (relative === 'right' || relative === 'left') {
      const totalW = icon.w + spacing + text.w
      const halfH = Math.max(icon.h, text.h) / 2
      const halfW = totalW / 2
      if (relative === 'right') {
        return { halfW, halfH, iconCenter: [-halfW + icon.w / 2, 0], textCenter: [halfW - text.w / 2, 0] }
      }
      return { halfW, halfH, iconCenter: [halfW - icon.w / 2, 0], textCenter: [-halfW + text.w / 2, 0] }
    }
    // 'top' / 'bottom'
    const totalH = icon.h + spacing + text.h
    const halfW = Math.max(icon.w, text.w) / 2
    const halfH = totalH / 2
    if (relative === 'bottom') {
      return { halfW, halfH, iconCenter: [0, halfH - icon.h / 2], textCenter: [0, -halfH + text.h / 2] }
    }
    return { halfW, halfH, iconCenter: [0, -halfH + icon.h / 2], textCenter: [0, halfH - text.h / 2] }
  }
  if (icon) {
    return { halfW: icon.w / 2, halfH: icon.h / 2, iconCenter: [0, 0], textCenter: [0, 0] }
  }
  if (text) {
    return { halfW: text.w / 2, halfH: text.h / 2, iconCenter: [0, 0], textCenter: [0, 0] }
  }
  return { halfW: 0, halfH: 0, iconCenter: [0, 0], textCenter: [0, 0] }
}

/** 组合体锚点对齐：返回加到各子中心（相对组合体中心）上的偏移，使锚点落在实体位置。 */
function anchorOffset(anchor: SymbolAnchor, halfW: number, halfH: number): [number, number] {
  switch (anchor) {
    case 'center': return [0, 0]
    case 'left': return [halfW, 0]
    case 'right': return [-halfW, 0]
    case 'top': return [0, -halfH]
    case 'bottom': return [0, halfH]
    case 'top-left': return [halfW, -halfH]
    case 'top-right': return [-halfW, -halfH]
    case 'bottom-left': return [halfW, halfH]
    case 'bottom-right': return [-halfW, halfH]
  }
}

const scratchProject = new THREE.Vector3()

/** 世界点投影到 NDC（y 向上）；在近平面后方 / 裁剪外返回 `null`。Project a world point to NDC (y up). */
function projectToNdc(
  point: THREE.Vector3,
  camera: THREE.PerspectiveCamera
): { x: number; y: number } | null {
  scratchProject.copy(point).project(camera)
  if (scratchProject.z < -1 || scratchProject.z > 1) return null
  return { x: scratchProject.x, y: scratchProject.y }
}
