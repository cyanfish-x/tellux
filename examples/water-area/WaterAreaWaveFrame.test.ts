import { describe, expect, it } from 'vitest'

import {
  createWaterAreaWaveFrame,
  resolveWaterAreaWaveOrigin
} from './WaterAreaWaveFrame'

describe('createWaterAreaWaveFrame', () => {
  it('creates an orthonormal ECEF frame from degree coordinates', () => {
    const frame = createWaterAreaWaveFrame(-112.2525, 69.3782)

    expect(frame.originECEF.length()).toBeGreaterThan(6_300_000)
    expect(frame.eastECEF.length()).toBeCloseTo(1)
    expect(frame.northECEF.length()).toBeCloseTo(1)
    expect(frame.upECEF.length()).toBeCloseTo(1)
    expect(frame.eastECEF.dot(frame.northECEF)).toBeCloseTo(0)
    expect(frame.eastECEF.dot(frame.upECEF)).toBeCloseTo(0)
    expect(frame.northECEF.dot(frame.upECEF)).toBeCloseTo(0)
  })

  it('uses the current camera location when no explicit wave origin is provided', () => {
    expect(
      resolveWaterAreaWaveOrigin(undefined, {
        longitude: -132.91669016841638,
        latitude: 57.01944780700264
      })
    ).toEqual({
      longitude: -132.91669016841638,
      latitude: 57.01944780700264
    })

    expect(
      resolveWaterAreaWaveOrigin(
        { longitude: 108.92, latitude: 34.22 },
        { longitude: -132.91, latitude: 57.01 }
      )
    ).toEqual({ longitude: 108.92, latitude: 34.22 })
  })
})
