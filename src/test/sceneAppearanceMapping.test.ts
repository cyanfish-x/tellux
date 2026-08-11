import { describe, expect, it, vi } from 'vitest'

import {
  CLOUD_SHADOW_QUALITY_PRESETS,
  applyCloudAppearanceState,
  resolveCloudShadowQuality
} from '../rendering/cloudAppearance'
import {
  LENS_FLARE_QUALITY_SCALES,
  applyLensFlareAppearanceState,
  resolveLensFlareQuality
} from '../rendering/lensFlareAppearance'

describe('cloudAppearance', () => {
  it('maps shadow quality presets to cascade and map size', () => {
    expect(CLOUD_SHADOW_QUALITY_PRESETS.low).toEqual({ cascadeCount: 1, mapSize: 256 })
    expect(CLOUD_SHADOW_QUALITY_PRESETS.medium).toEqual({ cascadeCount: 2, mapSize: 512 })
    expect(CLOUD_SHADOW_QUALITY_PRESETS.high).toEqual({ cascadeCount: 4, mapSize: 1024 })
  })

  it('falls back to medium for invalid shadow quality', () => {
    expect(resolveCloudShadowQuality('ultra')).toBe('medium')
    expect(resolveCloudShadowQuality(undefined)).toBe('medium')
  })

  it('applies look flags and shadow quality after qualityPreset-style defaults', () => {
    const mapSize = { set: vi.fn() }
    const cloudsEffect = {
      shapeDetail: true,
      turbulence: true,
      haze: true,
      shadow: {
        cascadeCount: 3,
        mapSize
      }
    }

    applyCloudAppearanceState(cloudsEffect, {
      look: { detail: false, turbulence: false, haze: true },
      shadow: { quality: 'high' }
    })

    expect(cloudsEffect).toMatchObject({
      shapeDetail: false,
      turbulence: false,
      haze: true,
      shadow: { cascadeCount: 4 }
    })
    expect(mapSize.set).toHaveBeenCalledWith(1024, 1024)
  })
})

describe('lensFlareAppearance', () => {
  it('maps quality presets to resolution scale', () => {
    expect(LENS_FLARE_QUALITY_SCALES).toEqual({
      low: 0.25,
      medium: 0.5,
      high: 1
    })
  })

  it('falls back to medium for invalid lens flare quality', () => {
    expect(resolveLensFlareQuality('ultra')).toBe('medium')
    expect(resolveLensFlareQuality(undefined)).toBe('medium')
  })

  it('syncs intensity, threshold, and resolution scale onto the effect', () => {
    const lensFlareEffect = {
      intensity: 0,
      thresholdLevel: 0,
      thresholdRange: 0,
      resolution: { scale: 1 }
    }

    applyLensFlareAppearanceState(lensFlareEffect, {
      intensity: 0.01,
      threshold: { level: 8, range: 2 },
      quality: 'low'
    })

    expect(lensFlareEffect).toEqual({
      intensity: 0.01,
      thresholdLevel: 8,
      thresholdRange: 2,
      resolution: { scale: 0.25 }
    })
  })
})
