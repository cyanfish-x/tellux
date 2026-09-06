import { describe, expect, it } from 'vitest'
import { analyticCases, homogeneous, overlap, compose, march } from './mediumIntegral'

describe('A1 participating media reference', () => {
  for (const fixture of analyticCases) it(`${fixture.name}: homogeneous marching matches the analytic interval`, () => {
    const medium = overlap(fixture.a, fixture.b)
    const expected = homogeneous(medium, fixture.length)
    for (const steps of [1, 8, 64, 256]) {
      const actual = march(() => medium, fixture.length, steps)
      for (let i = 0; i < 3; ++i) {
        expect(actual.transmittance[i]).toBeCloseTo(expected.transmittance[i], 11)
        expect(actual.scattering[i]).toBeCloseTo(expected.scattering[i], 11)
      }
    }
  })
  it('distinguishes overlapping media from adjacent integration', () => {
    const a = { extinction: [1, 1, 1] as [number, number, number], source: [0, 0, 0] as [number, number, number] }
    const b = { extinction: [0, 0, 0] as [number, number, number], source: [1, 1, 1] as [number, number, number] }
    expect(homogeneous(overlap(a, b), 1).scattering[0]).toBeCloseTo(1 - Math.exp(-1), 12)
    expect(compose(homogeneous(a, 1), homogeneous(b, 1)).scattering[0]).toBeCloseTo(Math.exp(-1), 12)
  })
  it('converges for a nonuniform source against an independent analytic integral', () => {
    // sigma=1, j(s)=s; integral from 0 to L is 1-(L+1)*exp(-L).
    const exact = 1 - 3 * Math.exp(-2)
    const errors = [8, 32, 128].map(steps => Math.abs(march(s => ({ extinction: [1, 1, 1], source: [s, s, s] }), 2, steps).scattering[0] - exact))
    expect(errors[1]).toBeLessThan(errors[0] / 10)
    expect(errors[2]).toBeLessThan(errors[1] / 10)
    expect(errors[2]).toBeLessThan(0.00002)
  })
  it('rejects invalid coefficients', () => {
    expect(() => homogeneous({ extinction: [-1, 0, 0], source: [0, 0, 0] }, 1)).toThrow()
    expect(() => march(() => analyticCases[0].a, 1, 0)).toThrow()
  })
})
