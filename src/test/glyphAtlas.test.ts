import { describe, expect, it } from 'vitest'
import { computeGlyphSdfUniforms, GLYPH_ATLAS_METRICS } from '../entities/GlyphAtlas'

describe('GlyphAtlas', () => {
  it('uses Mapbox-compatible TinySDF source metrics', () => {
    expect(GLYPH_ATLAS_METRICS.oneEm).toBe(24)
    expect(GLYPH_ATLAS_METRICS.sdfScale).toBe(1)
    expect(GLYPH_ATLAS_METRICS.tinyFontSize).toBe(24)
    expect(GLYPH_ATLAS_METRICS.tinyBuffer).toBe(3)
    expect(GLYPH_ATLAS_METRICS.tinyRadius).toBe(8)
  })

  it('scales glyph SDF radius and gamma by font size and drawing-buffer pixel ratio', () => {
    const uniforms = computeGlyphSdfUniforms(16, 2)

    expect(uniforms.fontScale).toBeCloseTo(16 / 24, 6)
    expect(uniforms.sdfRadius).toBeCloseTo(8 * (16 / 24) * 2, 6)
    // Mapbox gamma 公式：(0.105 / dpr) / fontScale（对 fontScale 是倒数关系）。
    expect(uniforms.smoothing).toBeCloseTo((0.105 / 2) / (16 / 24), 6)
  })
})
