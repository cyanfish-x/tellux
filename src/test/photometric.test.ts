import { describe, expect, it } from 'vitest'

import {
  PHOTOMETRIC_NOON_SUN_ILLUMINANCE,
  photometricSunScale,
  scaleSunLightIntensity
} from '../rendering/photometric'

describe('photometric sun scale', () => {
  it('keeps Takram intensity unchanged when photometric lighting is off', () => {
    expect(
      scaleSunLightIntensity(1.2, { enabled: false, sunIlluminance: 222000 })
    ).toBe(1.2)
    expect(photometricSunScale({ enabled: false, sunIlluminance: 111000 })).toBe(1)
  })

  it('maps the Cesium noon anchor to Takram scale 1', () => {
    expect(
      photometricSunScale({
        enabled: true,
        sunIlluminance: PHOTOMETRIC_NOON_SUN_ILLUMINANCE
      })
    ).toBe(1)
    expect(
      scaleSunLightIntensity(1, {
        enabled: true,
        sunIlluminance: PHOTOMETRIC_NOON_SUN_ILLUMINANCE
      })
    ).toBe(1)
  })

  it('scales Takram sun with the lux anchor and never uses 111000 as intensity', () => {
    expect(
      scaleSunLightIntensity(1, { enabled: true, sunIlluminance: 55500 })
    ).toBe(0.5)
    expect(
      scaleSunLightIntensity(2, { enabled: true, sunIlluminance: 222000 })
    ).toBe(4)
  })
})
