import * as THREE from 'three'
import TinySDF from '@mapbox/tiny-sdf'
import type { TextOptions } from '../types'

type FontWeight = NonNullable<TextOptions['fontWeight']>

const ONE_EM = 24
const SDF_SCALE = 2
const TINY_FONT_SIZE = ONE_EM * SDF_SCALE
const TINY_BUFFER = 3 * SDF_SCALE
const TINY_RADIUS = 8 * SDF_SCALE
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
  return {
    fontScale,
    sdfRadius: TINY_RADIUS / SDF_SCALE * fontScale * pr,
    smoothing: 0.105 / Math.max(0.01, fontScale * pr)
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
    this.context = this.canvas.getContext('2d', { willReadFrequently: true })!
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
  private readonly tinySdf: TinySDF
  private readonly glyphs = new Map<string, GlyphEntry>()
  private readonly pages: GlyphAtlasPage[] = [new GlyphAtlasPage()]

  constructor(
    private readonly font: string,
    private readonly fontWeight: FontWeight
  ) {
    this.tinySdf = new TinySDF({
      fontFamily: font,
      fontWeight: String(fontWeight),
      fontSize: TINY_FONT_SIZE,
      buffer: TINY_BUFFER,
      radius: TINY_RADIUS
    })
  }

  getGlyph(char: string): GlyphEntry {
    const cached = this.glyphs.get(char)
    if (cached) return cached

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
      }
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
    const rectBuffer = (TINY_BUFFER + ATLAS_PADDING) / SDF_SCALE
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
      smoothing
    }
  })

  return { quads, contentW, contentH }
}

export function disposeGlyphAtlases() {
  fontAtlases.forEach((atlas) => atlas.dispose())
  fontAtlases.clear()
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
