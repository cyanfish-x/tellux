import { describe, expect, it } from 'vitest'

import {
  DEFAULT_WATER_AREA_OPTICS,
  normalizeWaterAreaOptics
} from './WaterAreaOptics'

describe('normalizeWaterAreaOptics', () => {
  it('enables the shared sky environment and planar reflection by default', () => {
    expect(normalizeWaterAreaOptics()).toEqual(DEFAULT_WATER_AREA_OPTICS)
    expect(DEFAULT_WATER_AREA_OPTICS).toEqual({
      environment: {
        enabled: true,
        intensity: 1
      },
      reflection: {
        enabled: true,
        intensity: 0.65,
        resolutionScale: 0.5,
        debugView: false
      }
    })
  })

  it('clamps runtime intensity and construction-time reflection resolution', () => {
    expect(
      normalizeWaterAreaOptics({
        environment: { enabled: false, intensity: 8 },
        reflection: {
          enabled: false,
          intensity: -1,
          resolutionScale: Number.NaN,
          debugView: true
        }
      })
    ).toEqual({
      environment: {
        enabled: false,
        intensity: 2
      },
      reflection: {
        enabled: false,
        intensity: 0,
        resolutionScale:
          DEFAULT_WATER_AREA_OPTICS.reflection.resolutionScale,
        debugView: true
      }
    })
  })

  it('preserves defaults for partially specified domains', () => {
    expect(
      normalizeWaterAreaOptics({
        reflection: { intensity: 0.25 }
      })
    ).toEqual({
      environment: DEFAULT_WATER_AREA_OPTICS.environment,
      reflection: {
        ...DEFAULT_WATER_AREA_OPTICS.reflection,
        intensity: 0.25
      }
    })
  })
})
