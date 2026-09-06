import { describe, expect, it } from 'vitest'

import {
  CLOUD_ALTITUDE_FADE_END,
  CLOUD_ALTITUDE_FADE_START,
  CLOUD_PASS_ENABLE_HYSTERESIS,
  cloudAltitudeFade,
  shouldRenderCloudPass
} from '../rendering/cloudAltitudeFade'

describe('cloudAltitudeFade', () => {
  it('keeps full coverage below the fade start', () => {
    expect(cloudAltitudeFade(0)).toBe(1)
    expect(cloudAltitudeFade(CLOUD_ALTITUDE_FADE_START)).toBe(1)
  })

  it('reaches zero at the fade end', () => {
    expect(cloudAltitudeFade(CLOUD_ALTITUDE_FADE_END)).toBe(0)
    expect(cloudAltitudeFade(1_500_000)).toBe(0)
  })

  it('smoothsteps through the midpoint', () => {
    const mid = (CLOUD_ALTITUDE_FADE_START + CLOUD_ALTITUDE_FADE_END) / 2
    expect(cloudAltitudeFade(mid)).toBeCloseTo(0.5, 5)
    expect(cloudAltitudeFade(mid - 1_000)).toBeGreaterThan(0.5)
    expect(cloudAltitudeFade(mid + 1_000)).toBeLessThan(0.5)
  })

  it('treats missing height as space', () => {
    expect(cloudAltitudeFade(null)).toBe(0)
    expect(cloudAltitudeFade(Number.NaN)).toBe(0)
  })
})

describe('shouldRenderCloudPass', () => {
  const enableBelow = CLOUD_ALTITUDE_FADE_END - CLOUD_PASS_ENABLE_HYSTERESIS

  it('keeps the pass until fade-end while already rendering', () => {
    expect(shouldRenderCloudPass(enableBelow + 100, true)).toBe(true)
    expect(shouldRenderCloudPass(CLOUD_ALTITUDE_FADE_END - 1, true)).toBe(true)
    expect(shouldRenderCloudPass(CLOUD_ALTITUDE_FADE_END, true)).toBe(false)
  })

  it('reattaches only after hysteresis when currently off', () => {
    expect(shouldRenderCloudPass(enableBelow + 100, false)).toBe(false)
    expect(shouldRenderCloudPass(enableBelow, false)).toBe(false)
    expect(shouldRenderCloudPass(enableBelow - 1, false)).toBe(true)
  })

  it('stays off without a finite height', () => {
    expect(shouldRenderCloudPass(null, true)).toBe(false)
    expect(shouldRenderCloudPass(Number.NaN, false)).toBe(false)
  })
})
