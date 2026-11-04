import { describe, expect, it } from 'vitest'
import { analyticCases, homogeneous, overlap, type RGB } from './mediumIntegral'
import { integrateCloudAtmosphere } from './IntegratedCloudAtmosphere'

describe('cloud overlay from joint medium integration', () => {
  for (const fixture of analyticCases) it(`${fixture.name}: overlay over air converges to joint analytic transport`, () => {
    const { a: air, b: cloud, length } = fixture
    const expected = homogeneous(overlap(air, cloud), length)
    const airFull = homogeneous(air, length), cloudFull = homogeneous(cloud, length)
    const overlay: RGB = [0, 0, 0]
    // Use an optical-depth-aware test resolution for the dense analytic fixture.
    const steps = Math.max(2048, Math.ceil(length * Math.max(...cloud.extinction, ...air.extinction) * 20))
    const ds = length / steps, cloudStep = homogeneous(cloud, ds)
    for (let step = 0; step < steps; ++step) {
      const airPrefix = homogeneous(air, (step + 0.5) * ds)
      for (let c = 0; c < 3; ++c) overlay[c] += Math.exp(-cloud.extinction[c] * step * ds) *
        (airPrefix.transmittance[c] * cloudStep.scattering[c] + airPrefix.scattering[c] * (1 - cloudStep.transmittance[c]))
    }
    for (let c = 0; c < 3; ++c) {
      expect(Math.abs(overlay[c] + cloudFull.transmittance[c] * airFull.scattering[c] - expected.scattering[c])).toBeLessThan(0.001)
      expect(airFull.transmittance[c] * cloudFull.transmittance[c]).toBeCloseTo(expected.transmittance[c], 12)
    }
  })
  it('fails explicitly when the upstream shader seam changes', () => {
    expect(() => integrateCloudAtmosphere('void main() {}')).toThrow('Unsupported')
  })
})
