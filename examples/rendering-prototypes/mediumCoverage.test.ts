import { describe, expect, it } from 'vitest'
import { coverageFootprint, partialCoverageFraction } from './mediumCoverage'

describe('low-resolution medium validity', () => {
  it('covers every full-resolution pixel that can bilinearly query a cell, including odd sizes', () => {
    for (const fullSize of [31, 32, 127, 256, 511]) for (const scale of [2, 4]) {
      const lowSize = Math.ceil(fullSize / scale)
      for (let pixel = 0; pixel < fullSize; pixel++) {
        const coordinate = (pixel + 0.5) / fullSize * lowSize - 0.5
        for (const cell of [Math.floor(coordinate), Math.floor(coordinate) + 1]) {
          const clamped = Math.max(0, Math.min(lowSize - 1, cell))
          const [first, last] = coverageFootprint(clamped, fullSize, lowSize)
          expect(pixel).toBeGreaterThanOrEqual(first)
          expect(pixel).toBeLessThanOrEqual(last)
        }
      }
    }
  })
  it('does not treat ungenerated history beyond an occluder as vacuum', () => {
    expect(partialCoverageFraction(2000, 5000, 3200, 4000)).toBeNull()
    expect(partialCoverageFraction(2000, 5000, 3200, 2600)).toBe(0.5)
    expect(partialCoverageFraction(2000, 5000, 3200, 3200)).toBe(1)
  })
})
