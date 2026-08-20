import { describe, expect, it } from 'vitest'

import { ShallowWaterModel } from './ShallowWaterModel'

describe('ShallowWaterModel', () => {
  it('preserves a lake at rest over a non-flat bed', () => {
    const width = 12
    const height = 8
    const bed = new Float32Array(width * height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        bed[y * width + x] = 0.2 * Math.sin(x * 0.4) + 0.1 * Math.cos(y * 0.7)
      }
    }
    const model = new ShallowWaterModel({ width, height, cellSize: 2, bed, seaLevel: 3 })

    for (let step = 0; step < 100; step += 1) {
      model.step(Math.min(model.computeStableTimeStep(0.45), 1 / 60))
    }

    let maxEtaError = 0
    for (let index = 0; index < bed.length; index += 1) {
      maxEtaError = Math.max(maxEtaError, Math.abs(model.depth[index] + bed[index] - 3))
      expect(model.depth[index]).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(model.depth[index])).toBe(true)
    }
    expect(maxEtaError).toBeLessThanOrEqual(1e-4)
  })

  it('keeps closed-domain volume drift below 0.1 percent', () => {
    const width = 20
    const height = 12
    const bed = new Float32Array(width * height)
    const model = new ShallowWaterModel({ width, height, cellSize: 2, bed, seaLevel: 2 })
    model.depth[Math.floor(height / 2) * width + Math.floor(width / 2)] += 0.25
    const initial = model.volume

    for (let step = 0; step < 120; step += 1) {
      model.step(Math.min(model.computeStableTimeStep(0.45), 1 / 120))
    }

    expect(Math.abs(model.volume - initial) / initial).toBeLessThanOrEqual(0.001)
  })

  it('preserves free surface across bed revisions and accounts correction volume', () => {
    const bed = new Float32Array([0, 0, 0, 0])
    const model = new ShallowWaterModel({ width: 2, height: 2, cellSize: 2, bed, seaLevel: 2 })
    const nextBed = new Float32Array([0.5, -0.5, 3, 0])
    const previousVolume = model.volume

    const correction = model.applyBedRevision(nextBed, 2)

    expect([...model.depth]).toEqual([1.5, 2.5, 0, 2])
    expect(model.depth[0] + nextBed[0]).toBe(2)
    expect(model.depth[1] + nextBed[1]).toBe(2)
    expect(correction).toBeCloseTo(model.volume - previousVolume, 6)
    expect(model.terrainCorrectionVolume).toBeCloseTo(correction, 6)
  })
})
