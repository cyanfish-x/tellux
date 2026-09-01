import { describe, expect, it } from 'vitest'

import {
  DEFAULT_WATER_AREA_OPTICS,
  normalizeWaterAreaOptics
} from './WaterAreaOptics'

describe('normalizeWaterAreaOptics', () => {
  it('enables the shared sky environment by default', () => {
    expect(normalizeWaterAreaOptics()).toEqual(DEFAULT_WATER_AREA_OPTICS)
    expect(DEFAULT_WATER_AREA_OPTICS).toEqual({
      environment: {
        enabled: true,
        intensity: 1
      }
    })
  })

  it('clamps environment intensity', () => {
    expect(
      normalizeWaterAreaOptics({
        environment: { enabled: false, intensity: 8 }
      })
    ).toEqual({
      environment: {
        enabled: false,
        intensity: 2
      }
    })
  })

  it('preserves defaults for partially specified environment options', () => {
    expect(
      normalizeWaterAreaOptics({
        environment: { intensity: 0.25 }
      })
    ).toEqual({
      environment: {
        ...DEFAULT_WATER_AREA_OPTICS.environment,
        intensity: 0.25
      }
    })
  })
})
