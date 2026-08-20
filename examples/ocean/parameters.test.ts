import { describe, expect, it } from 'vitest'

import { OCEAN_PARAMETER_DEFINITIONS, createDefaultOceanParameters } from './parameters'

describe('Riyue Bay ocean parameters', () => {
  it('preserves gpuocean parameter defaults, ranges, and steps', () => {
    expect(OCEAN_PARAMETER_DEFINITIONS.map(({ key, defaultValue, min, max, step }) => ({
      key, defaultValue, min, max, step
    }))).toEqual([
      { key: 'wavelength', defaultValue: 10, min: 5, max: 60, step: 1 },
      { key: 'amplitude', defaultValue: 0.2, min: 0, max: 2, step: 0.02 },
      { key: 'choppiness', defaultValue: 1.5, min: 0, max: 3, step: 0.05 },
      { key: 'layers', defaultValue: 5, min: 1, max: 5, step: 1 },
      { key: 'spread', defaultValue: 40, min: 0, max: 90, step: 1 },
      { key: 'waveDir', defaultValue: 0, min: -60, max: 60, step: 1 },
      { key: 'dispersion', defaultValue: 1, min: 0, max: 2, step: 0.05 },
      { key: 'ripple', defaultValue: 0.2, min: 0, max: 0.6, step: 0.01 },
      { key: 'rippleScale', defaultValue: 0.5, min: 0.05, max: 2.5, step: 0.01 },
      { key: 'rippleAniso', defaultValue: 0.8, min: 0, max: 1, step: 0.05 },
      { key: 'rippleBias', defaultValue: 0.8, min: 0, max: 1, step: 0.05 },
      { key: 'sss', defaultValue: 1.5, min: 0, max: 1.5, step: 0.05 },
      { key: 'depth', defaultValue: 8, min: 0.5, max: 40, step: 0.5 },
      { key: 'caustics', defaultValue: 1, min: 0, max: 2, step: 0.05 },
      { key: 'sun', defaultValue: 10, min: 2, max: 60, step: 1 },
      { key: 'lean', defaultValue: 0.5, min: 0, max: 3, step: 0.05 },
      { key: 'foam', defaultValue: 0.6, min: 0, max: 1, step: 0.02 },
      { key: 'foamLife', defaultValue: 4, min: 0.5, max: 12, step: 0.5 },
      { key: 'foamScale', defaultValue: 1, min: 0.5, max: 3, step: 0.05 }
    ])
  })

  it('uses the accepted advanced defaults', () => {
    expect(createDefaultOceanParameters()).toMatchObject({
      quality: 'high',
      seaLevel: 0,
      bathymetrySlope: 0.035,
      handoverDepth: 6,
      lodBlendSeconds: 1.5,
      pause: false,
      wireframe: false,
      noiseView: false,
      debugField: 'none'
    })
  })
})
