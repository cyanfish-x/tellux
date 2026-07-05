import { describe, expect, it } from 'vitest'
import { resolveLodLevel } from '../../hism/lod/resolveLodLevel'

describe('resolveLodLevel', () => {
  const levels = [
    { maxDistanceMeters: 400 },
    { maxDistanceMeters: 1200 },
    { maxDistanceMeters: Number.POSITIVE_INFINITY }
  ]

  it('selects nearest LOD by distance', () => {
    expect(resolveLodLevel(100, levels)).toBe(0)
    expect(resolveLodLevel(400, levels)).toBe(0)
    expect(resolveLodLevel(800, levels)).toBe(1)
    expect(resolveLodLevel(5000, levels)).toBe(2)
  })

  it('returns zero for empty levels array', () => {
    expect(resolveLodLevel(100, [])).toBe(0)
  })
})
