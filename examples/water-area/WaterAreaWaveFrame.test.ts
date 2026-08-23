import { describe, expect, it } from 'vitest'

import { createWaterAreaWaveFrame } from './WaterAreaWaveFrame'

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
})
