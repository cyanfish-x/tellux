import { describe, expect, it } from 'vitest'
import { compose, homogeneous, march, type Integral, type Medium } from './mediumIntegral'
import { samplingIntervals, shellIntersections } from './mediumSampling'

describe('A1 shell-boundary sampling', () => {
  it('captures a thin layer missed by the uniform midpoint grid', () => {
    const sample = (s: number): Medium => ({ extinction: [1, 1, 1], source: s >= 4 && s <= 4.1 ? [1, 1, 1] : [0, 0, 0] })
    const exact = Math.exp(-4) * (1 - Math.exp(-0.1))
    expect(march(sample, 12, 4).scattering[0]).toBe(0)
    let result: Integral = { transmittance: [1, 1, 1], scattering: [0, 0, 0] }
    for (const [start, end] of samplingIntervals(12, 4, [4, 4.1])) result = compose(result, homogeneous(sample((start + end) / 2), end - start))
    expect(result.scattering[0]).toBeCloseTo(exact, 12)
    expect(result.transmittance[0]).toBeCloseTo(Math.exp(-12), 12)
  })
  it('covers the full domain once, including duplicate and clipped boundaries', () => {
    const intervals = samplingIntervals(12, 4, [-1, 0, 4, 4, 12, 20])
    expect(intervals).toEqual([[0, 3], [3, 4], [4, 6], [6, 9], [9, 12]])
  })
  it('retains both intersections and resolves a nearby Earth-scale shell', () => {
    expect(shellIntersections([6371001, 0, 0], [-1, 0, 0], 6371000)).toEqual([1, 12742001])
    expect(shellIntersections([0, 0, 0], [1, 0, 0], 2)).toEqual([-2, 2])
    expect(shellIntersections([3, 0, 0], [0, 1, 0], 2)).toEqual([])
    expect(shellIntersections([2, 0, 0], [0, 1, 0], 2)[0]).toBeCloseTo(0)
  })
})
