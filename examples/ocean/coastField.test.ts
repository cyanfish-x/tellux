import { describe, expect, it } from 'vitest'

import { deriveCoastField } from './coastField'

describe('deriveCoastField', () => {
  it('uses Schmitt hysteresis around sea level', () => {
    const previousLand = new Uint8Array([1, 0])
    const result = deriveCoastField({
      heights: new Float32Array([-0.1, 0.1]),
      validity: new Uint8Array([1, 1]),
      width: 2,
      height: 1,
      cellSize: 2,
      seaLevel: 0,
      maxDepth: 8,
      bathymetrySlope: 0.035,
      hysteresis: 0.15,
      previousLand
    })

    expect([...result.landMask]).toEqual([1, 0])
  })

  it('produces positive land distance, negative water distance, and continuous bathymetry', () => {
    const result = deriveCoastField({
      heights: new Float32Array([1, 1, -1, -1, -1]),
      validity: new Uint8Array([1, 1, 1, 1, 1]),
      width: 5,
      height: 1,
      cellSize: 2,
      seaLevel: 0,
      maxDepth: 8,
      bathymetrySlope: 0.035,
      hysteresis: 0.15
    })

    expect(result.shoreSdf[0]).toBeGreaterThan(0)
    expect(result.shoreSdf[4]).toBeLessThan(result.shoreSdf[2])
    expect(result.bedHeight[2]).toBeLessThan(0)
    expect(result.bedHeight[4]).toBeLessThan(result.bedHeight[2])
    expect(result.bedHeight[0]).toBe(1)
  })

  it('leaves invalid cells hidden instead of guessing a shoreline', () => {
    const result = deriveCoastField({
      heights: new Float32Array([1, 0]),
      validity: new Uint8Array([1, 0]),
      width: 2,
      height: 1,
      cellSize: 2,
      seaLevel: 0,
      maxDepth: 8,
      bathymetrySlope: 0.035,
      hysteresis: 0.15
    })

    expect(result.validity[1]).toBe(0)
    expect(Number.isNaN(result.bedHeight[1])).toBe(true)
  })
})
