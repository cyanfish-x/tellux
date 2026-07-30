import * as THREE from 'three'
import type { TextOptions } from '../types'
import OptimizedTinySDF from './OptimizedTinySDF'
import {
  loadMsdfAtlas,
  type MsdfAtlas,
  type MsdfGlyphMetrics
} from './MsdfAtlasLoader'

type FontWeight = NonNullable<TextOptions['fontWeight']>

// 完全对齐 Mapbox GL JS 的 SDF 参数
const ONE_EM = 24
const SDF_SCALE = 1  // Mapbox 不使用 scale
const TINY_FONT_SIZE = 24  // Mapbox 固定 24px
const TINY_BUFFER = 3
const TINY_RADIUS = 8
const ATLAS_PADDING = 2
const ATLAS_SIZE = 2048

export interface GlyphTextConfig {
  text: string
  font: string
  fontSize: number
  fontWeight: FontWeight
  lineHeight: number
  outlineWidth: number
  maxWidth?: number
}

export interface GlyphRunQuad {
  readonly texture: THREE.Texture
  readonly uvMin: THREE.Vector2
  readonly uvMax: THREE.Vector2
  readonly cx: number
  readonly cy: number
  readonly w: number
  readonly h: number
  readonly sdfRadius: number
  readonly smoothing: number
  /** 是否为MSDF字形（true）还是TinySDF字形（false） */
  readonly isMsdf: boolean
  /** MSDF distanceRange 换算到 atlas UV 空间（distanceRange/scaleW, /scaleH）；TinySDF 为 (0,0)。 */
  readonly msdfUnitRange: THREE.Vector2
}

export interface GlyphTextRun {
  readonly quads: GlyphRunQuad[]
  readonly contentW: number
  readonly contentH: number
}

export const GLYPH_ATLAS_METRICS = {
  oneEm: ONE_EM,
  sdfScale: SDF_SCALE,
  tinyFontSize: TINY_FONT_SIZE,
  tinyBuffer: TINY_BUFFER,
  tinyRadius: TINY_RADIUS,
  atlasPadding: ATLAS_PADDING
} as const

export function computeGlyphSdfUniforms(fontSize: number, pixelRatio: number): {
  fontScale: number
  sdfRadius: number
  smoothing: number
} {
  const fontScale = Math.max(1, fontSize) / ONE_EM
  const pr = Math.max(0.01, pixelRatio)
  // Mapbox gamma 公式：gamma = (0.105 / dpr) / (fontScale · gamma_scale)。
  // 对 fontScale 是倒数关系（字号越大，归一化过渡带越窄，边缘越锐）。
  // 屏幕空间 billboard 无透视 gamma_scale（Mapbox 里是 gl_Position.w），取 1 近似。
  // smoothstep 半宽用 gamma（TinySDF 距离场以 1/radius 为单位，SDF_PX=radius）。
  const smoothing = (0.105 / pr) / fontScale
  return {
    fontScale,
    sdfRadius: TINY_RADIUS * fontScale * pr,
    smoothing
  }
}

interface GlyphMetrics {
  width: number
  height: number
  left: number
  top: number
  advance: number
}

interface GlyphEntry {
  texture: THREE.Texture
  uvMin: THREE.Vector2
  uvMax: THREE.Vector2
  rectW: number
  rectH: number
  metrics: GlyphMetrics
  /** 每边 padding（源像素），rectW/rectH 已包含它。TinySDF=TINY_BUFFER+ATLAS_PADDING，MSDF=distanceRange/2 */
  buffer: number
  /** 是否来自MSDF atlas（true）还是动态TinySDF（false） */
  isMsdf: boolean
  /** MSDF distanceRange 换算到 atlas UV 空间；TinySDF 为 (0,0)。 */
  msdfUnitRange: THREE.Vector2
}

interface PositionedGlyph {
  glyph: GlyphEntry
  x: number
  lineTop: number
}

class GlyphAtlasPage {
  readonly canvas: HTMLCanvasElement
  readonly texture: THREE.CanvasTexture
  private readonly context: CanvasRenderingContext2D
  private cursorX = 0
  private cursorY = 0
  private rowH = 0

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = ATLAS_SIZE
    this.canvas.height = ATLAS_SIZE
    this.context = this.canvas.getContext('2d', {
      willReadFrequently: true,
      // 禁用平滑，避免二次模糊
      alpha: false,
      desynchronized: false
    })!
    // 强制禁用所有插值
    this.context.imageSmoothingEnabled = false

    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.generateMipmaps = false
    this.texture.minFilter = THREE.LinearFilter
    this.texture.magFilter = THREE.LinearFilter
    this.texture.colorSpace = THREE.NoColorSpace
    this.texture.needsUpdate = true
  }

  tryAdd(data: Uint8ClampedArray, width: number, height: number): GlyphEntryLocation | null {
    const rectW = width + ATLAS_PADDING * 2
    const rectH = height + ATLAS_PADDING * 2
    if (rectW > ATLAS_SIZE || rectH > ATLAS_SIZE) return null
    if (this.cursorX + rectW > ATLAS_SIZE) {
      this.cursorX = 0
      this.cursorY += this.rowH
      this.rowH = 0
    }
    if (this.cursorY + rectH > ATLAS_SIZE) return null

    const x = this.cursorX
    const y = this.cursorY
    const image = this.context.createImageData(width, height)
    for (let i = 0; i < width * height; i += 1) {
      const value = data[i]
      image.data[i * 4 + 0] = value
      image.data[i * 4 + 1] = 0
      image.data[i * 4 + 2] = 0
      image.data[i * 4 + 3] = 255
    }
    // 确保没有平滑插值
    this.context.imageSmoothingEnabled = false
    this.context.putImageData(image, x + ATLAS_PADDING, y + ATLAS_PADDING)
    this.texture.needsUpdate = true

    this.cursorX += rectW
    this.rowH = Math.max(this.rowH, rectH)
    return { page: this, x, y, width: rectW, height: rectH }
  }

  dispose() {
    this.texture.dispose()
  }
}

interface GlyphEntryLocation {
  page: GlyphAtlasPage
  x: number
  y: number
  width: number
  height: number
}

class FontGlyphAtlas {
  private readonly tinySdf: OptimizedTinySDF
  private readonly glyphs = new Map<string, GlyphEntry>()
  private readonly pages: GlyphAtlasPage[] = [new GlyphAtlasPage()]
  private msdfAtlas: MsdfAtlas | null = null

  constructor(
    private readonly font: string,
    private readonly fontWeight: FontWeight
  ) {
    this.tinySdf = new OptimizedTinySDF({
      fontFamily: font,
      fontWeight: String(fontWeight),
      fontSize: TINY_FONT_SIZE,
      buffer: TINY_BUFFER,
      radius: TINY_RADIUS
    })
    // 应用在 atlas 创建之前就已预加载的 MSDF（见 setMsdfAtlasForFont）
    const pending = pendingMsdfAtlases.get(this.atlasKey)
    if (pending) {
      this.msdfAtlas = pending
    }
  }

  private get atlasKey(): string {
    return `${this.fontWeight}|${this.font}`
  }

  /**
   * 设置预生成的MSDF atlas（可选）
   * 设置后，getGlyph 会优先从 MSDF atlas 查询。已缓存的字形会被清除，使后续
   * getGlyph 重新从新 atlas 取（已渲染的 quad 不会自动更新，需调用方重建文字）。
   */
  setMsdfAtlas(atlas: MsdfAtlas | null) {
    this.msdfAtlas = atlas
    this.glyphs.clear()
  }

  getGlyph(char: string): GlyphEntry {
    const cached = this.glyphs.get(char)
    if (cached) return cached

    // 第一优先：预生成的MSDF atlas
    if (this.msdfAtlas) {
      const msdfGlyph = this.msdfAtlas.glyphMap.get(char)
      if (msdfGlyph) {
        const entry = this.createMsdfGlyphEntry(msdfGlyph)
        this.glyphs.set(char, entry)
        return entry
      }
    }

    // 第二优先：动态TinySDF回退
    return this.createDynamicGlyphEntry(char)
  }

  private createMsdfGlyphEntry(msdfGlyph: MsdfGlyphMetrics): GlyphEntry {
    const atlas = this.msdfAtlas!
    const scaleW = atlas.data.common.scaleW
    const scaleH = atlas.data.common.scaleH

    // UV坐标（注意Y轴翻转）
    const uvMin = new THREE.Vector2(
      msdfGlyph.x / scaleW,
      1 - (msdfGlyph.y + msdfGlyph.height) / scaleH
    )
    const uvMax = new THREE.Vector2(
      (msdfGlyph.x + msdfGlyph.width) / scaleW,
      1 - msdfGlyph.y / scaleH
    )

    // 度量信息：atlas 用 fontSize（如 42）生成，需用 scale = ONE_EM/fontSize
    // 把所有度量从 atlas 像素空间转到 ONE_EM(24) 空间，与 TinySDF 度量对齐。
    // rectW/rectH/buffer 也必须转，否则 createGlyphTextRun 的 quad 尺寸会偏大
    // （多 fontSize/ONE_EM 倍），导致 quad 越过 advance 与下一字重叠。
    const fontSize = atlas.data.info.size
    const base = atlas.data.common.base  // baseline 距字体框顶部的距离
    const scale = ONE_EM / fontSize

    // bmfont 坐标系：y 向下为正，yoffset 是字形顶部相对字体框顶部。
    // TinySDF 的 glyphTop 是字形顶部相对 baseline 向上的距离，故 = base - yoffset。
    return {
      texture: atlas.texture,
      uvMin,
      uvMax,
      rectW: msdfGlyph.width * scale,
      rectH: msdfGlyph.height * scale,
      metrics: {
        width: msdfGlyph.width * scale,
        height: msdfGlyph.height * scale,
        left: msdfGlyph.xoffset * scale,
        top: (base - msdfGlyph.yoffset) * scale,
        advance: msdfGlyph.xadvance * scale
      },
      buffer: (atlas.distanceRange / 2) * scale / SDF_SCALE,
      isMsdf: true,
      // distanceRange 是 atlas 像素，换算到 UV 空间供 shader 的 screenPxRange 使用。
      msdfUnitRange: new THREE.Vector2(atlas.distanceRange / scaleW, atlas.distanceRange / scaleH)
    }
  }

  private createDynamicGlyphEntry(char: string): GlyphEntry {
    const glyph = this.tinySdf.draw(char)
    let location: GlyphEntryLocation | null = null
    for (const page of this.pages) {
      location = page.tryAdd(glyph.data, glyph.width, glyph.height)
      if (location) break
    }
    if (!location) {
      const page = new GlyphAtlasPage()
      this.pages.push(page)
      location = page.tryAdd(glyph.data, glyph.width, glyph.height)
    }
    if (!location) {
      throw new Error(`[tellux] Glyph is too large for the ${ATLAS_SIZE}px atlas: ${char}`)
    }

    const entry: GlyphEntry = {
      texture: location.page.texture,
      uvMin: new THREE.Vector2(location.x / ATLAS_SIZE, 1 - (location.y + location.height) / ATLAS_SIZE),
      uvMax: new THREE.Vector2((location.x + location.width) / ATLAS_SIZE, 1 - location.y / ATLAS_SIZE),
      rectW: location.width,
      rectH: location.height,
      metrics: {
        width: glyph.glyphWidth / SDF_SCALE,
        height: glyph.glyphHeight / SDF_SCALE,
        left: glyph.glyphLeft / SDF_SCALE,
        top: glyph.glyphTop / SDF_SCALE,
        advance: glyph.glyphAdvance / SDF_SCALE
      },
      buffer: (TINY_BUFFER + ATLAS_PADDING) / SDF_SCALE,
      isMsdf: false,
      msdfUnitRange: new THREE.Vector2(0, 0)
    }
    this.glyphs.set(char, entry)
    return entry
  }

  dispose() {
    this.pages.forEach((page) => page.dispose())
    this.pages.length = 0
    this.glyphs.clear()
  }
}

const fontAtlases = new Map<string, FontGlyphAtlas>()

/** 在 FontGlyphAtlas 创建之前预加载的 MSDF atlas（按 font+weight 暂存） */
const pendingMsdfAtlases = new Map<string, MsdfAtlas>()

/** atlas 变化监听器（SymbolGraphic 注册，atlas 加载/卸载时触发文字重建） */
type AtlasChangeListener = (font: string, fontWeight: FontWeight) => void
const atlasChangeListeners = new Set<AtlasChangeListener>()

/**
 * 监听某字体 atlas 的加载/卸载，返回取消订阅函数。
 * 用于在预加载 MSDF atlas 完成后，重建已渲染的文字标签。
 */
export function onFontAtlasChange(listener: AtlasChangeListener): () => void {
  atlasChangeListeners.add(listener)
  return () => {
    atlasChangeListeners.delete(listener)
  }
}

function notifyFontAtlasChange(font: string, fontWeight: FontWeight) {
  atlasChangeListeners.forEach((listener) => listener(font, fontWeight))
}

/**
 * 为指定字体设置预生成的MSDF atlas
 *
 * 可在任意时刻调用：若该字体的 FontGlyphAtlas 已创建则即时生效；
 * 若尚未创建（还没有渲染过该字体的文字），atlas 会被暂存，在首次创建时自动应用。
 * 已渲染的 SymbolGraphic 会通过 onFontAtlasChange 监听自动重建文字。
 *
 * @param font - 字体名称（需与 TextOptions.font 一致）
 * @param fontWeight - 字体粗细（需与 TextOptions.fontWeight 一致）
 * @param atlas - MSDF atlas（null 表示清除，回退到 TinySDF）
 */
export function setMsdfAtlasForFont(font: string, fontWeight: FontWeight, atlas: MsdfAtlas | null) {
  const key = `${fontWeight}|${font}`
  if (atlas) {
    pendingMsdfAtlases.set(key, atlas)
  } else {
    pendingMsdfAtlases.delete(key)
  }
  const fontAtlas = fontAtlases.get(key)
  if (fontAtlas) {
    fontAtlas.setMsdfAtlas(atlas)
  }
  notifyFontAtlasChange(font, fontWeight)
}

/**
 * 预加载 MSDF atlas 并绑定到指定字体
 *
 * 高级 API：加载 `${basePath}.json` 与 `${basePath}.png`，然后绑定到 font+fontWeight。
 * 绑定后，该字体的字符会优先从 MSDF atlas 取（高质量），未命中的字符自动回退到 TinySDF。
 *
 * @param font - 字体名称（需与 TextOptions.font 一致）
 * @param fontWeight - 字体粗细（需与 TextOptions.fontWeight 一致）
 * @param basePath - atlas 文件基础路径（不含扩展名），如 '/fonts/arial-regular'
 * @returns 加载好的 MSDF atlas
 */
export async function preloadFontMsdfAtlas(
  font: string,
  fontWeight: FontWeight,
  basePath: string
): Promise<MsdfAtlas> {
  const atlas = await loadMsdfAtlas(basePath)
  setMsdfAtlasForFont(font, fontWeight, atlas)
  return atlas
}

export function createGlyphTextRun(config: GlyphTextConfig, pixelRatio: number): GlyphTextRun {
  const { fontScale, sdfRadius, smoothing } = computeGlyphSdfUniforms(config.fontSize, pixelRatio)
  const atlas = getFontAtlas(config.font, config.fontWeight)
  const lines = shapeLines(config, atlas, fontScale)
  const lineHeight = config.fontSize * config.lineHeight
  const positioned: PositionedGlyph[] = []

  let contentW = 0
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    let x = 0
    for (const glyph of line.glyphs) {
      positioned.push({ glyph, x, lineTop: lineIndex * lineHeight })
      x += glyph.metrics.advance * fontScale
    }
    contentW = Math.max(contentW, line.width)
  }
  const contentH = Math.max(lineHeight, lines.length * lineHeight)
  const centerX = contentW / 2
  const centerY = contentH / 2
  const pr = Math.max(0.01, pixelRatio)

  const quads = positioned.map(({ glyph, x, lineTop }) => {
    const rectBuffer = glyph.buffer
    const left = x + (glyph.metrics.left - rectBuffer) * fontScale
    const top = lineTop + config.fontSize - (glyph.metrics.top + rectBuffer) * fontScale
    const w = glyph.rectW / SDF_SCALE * fontScale
    const h = glyph.rectH / SDF_SCALE * fontScale
    return {
      texture: glyph.texture,
      uvMin: glyph.uvMin,
      uvMax: glyph.uvMax,
      cx: (left + w / 2 - centerX) * pr,
      cy: (centerY - (top + h / 2)) * pr,
      w: w * pr,
      h: h * pr,
      sdfRadius,
      smoothing,
      isMsdf: glyph.isMsdf,
      msdfUnitRange: glyph.msdfUnitRange
    }
  })

  return { quads, contentW, contentH }
}

export function disposeGlyphAtlases() {
  fontAtlases.forEach((atlas) => atlas.dispose())
  fontAtlases.clear()
  pendingMsdfAtlases.clear()
}

function getFontAtlas(font: string, fontWeight: FontWeight): FontGlyphAtlas {
  const key = `${fontWeight}|${font}`
  let atlas = fontAtlases.get(key)
  if (!atlas) {
    atlas = new FontGlyphAtlas(font, fontWeight)
    fontAtlases.set(key, atlas)
  }
  return atlas
}

function shapeLines(config: GlyphTextConfig, atlas: FontGlyphAtlas, fontScale: number): Array<{
  glyphs: GlyphEntry[]
  width: number
}> {
  const explicitLines = config.text.split('\n')
  const result: Array<{ glyphs: GlyphEntry[]; width: number }> = []
  for (const line of explicitLines) {
    if (line === '') {
      result.push({ glyphs: [], width: 0 })
      continue
    }
    if (config.maxWidth === undefined) {
      const glyphs = Array.from(line).map((char) => atlas.getGlyph(char))
      result.push({ glyphs, width: measureGlyphs(glyphs, fontScale) })
      continue
    }
    let current: GlyphEntry[] = []
    let currentWidth = 0
    for (const char of Array.from(line)) {
      const glyph = atlas.getGlyph(char)
      const advance = glyph.metrics.advance * fontScale
      if (current.length > 0 && currentWidth + advance > config.maxWidth) {
        result.push({ glyphs: current, width: currentWidth })
        current = []
        currentWidth = 0
      }
      if (current.length > 0 || !/\s/.test(char)) {
        current.push(glyph)
        currentWidth += advance
      }
    }
    result.push({ glyphs: current, width: currentWidth })
  }
  return result.length > 0 ? result : [{ glyphs: [], width: 0 }]
}

function measureGlyphs(glyphs: GlyphEntry[], fontScale: number): number {
  let width = 0
  for (const glyph of glyphs) {
    width += glyph.metrics.advance * fontScale
  }
  return width
}
