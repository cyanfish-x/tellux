import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { resolveThreeToneMapping } from '../scene/toneMapping'

describe('resolveThreeToneMapping', () => {
  it('maps disabled state to NoToneMapping', () => {
    expect(resolveThreeToneMapping(false, 'agx')).toBe(THREE.NoToneMapping)
    expect(resolveThreeToneMapping(false, 'neutral')).toBe(THREE.NoToneMapping)
  })

  it('maps Tellux modes to Three.js operators', () => {
    expect(resolveThreeToneMapping(true, 'linear')).toBe(THREE.LinearToneMapping)
    expect(resolveThreeToneMapping(true, 'reinhard')).toBe(THREE.ReinhardToneMapping)
    expect(resolveThreeToneMapping(true, 'cineon')).toBe(THREE.CineonToneMapping)
    expect(resolveThreeToneMapping(true, 'aces-filmic')).toBe(THREE.ACESFilmicToneMapping)
    expect(resolveThreeToneMapping(true, 'agx')).toBe(THREE.AgXToneMapping)
    expect(resolveThreeToneMapping(true, 'neutral')).toBe(THREE.NeutralToneMapping)
  })
})
