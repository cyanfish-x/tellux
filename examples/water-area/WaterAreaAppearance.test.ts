import { describe, expect, it } from 'vitest'

import {
  DEFAULT_WATER_AREA_APPEARANCE,
  normalizeWaterAreaAppearance
} from './WaterAreaAppearance'

describe('normalizeWaterAreaAppearance', () => {
  it('uses the calibrated water-area defaults for omitted appearance fields', () => {
    expect(normalizeWaterAreaAppearance()).toEqual(
      DEFAULT_WATER_AREA_APPEARANCE
    )
    expect(DEFAULT_WATER_AREA_APPEARANCE).toMatchObject({
      color: '#06172d',
      colorMix: 0.8,
      roughness: 0.11,
      waveStrength: 0.8,
      waveScale: 0.3,
      waveSpeed: 0.5,
      waveDirection: 160
    })
  })

  it('clamps numeric controls and wraps the geographic wave direction', () => {
    expect(
      normalizeWaterAreaAppearance({
        colorMix: 2,
        roughness: -1,
        waveStrength: Number.POSITIVE_INFINITY,
        waveScale: 0,
        waveSpeed: 3,
        waveDirection: -30
      })
    ).toMatchObject({
      colorMix: 1,
      roughness: 0.05,
      waveStrength: DEFAULT_WATER_AREA_APPEARANCE.waveStrength,
      waveScale: 0.25,
      waveSpeed: 2,
      waveDirection: 330
    })
  })

  it('rejects malformed colors without losing the remaining overrides', () => {
    expect(
      normalizeWaterAreaAppearance({
        color: 'navy',
        roughness: 0.4
      })
    ).toMatchObject({
      color: DEFAULT_WATER_AREA_APPEARANCE.color,
      roughness: 0.4
    })
  })
})
