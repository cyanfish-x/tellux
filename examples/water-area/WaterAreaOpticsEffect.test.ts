import { describe, expect, it, vi } from 'vitest'

import { WaterAreaOpticsEffect } from './WaterAreaOpticsEffect'

describe('WaterAreaOpticsEffect', () => {
  it('keeps environment runtime state in a shared uniform', () => {
    const effect = new WaterAreaOpticsEffect({
      environment: { enabled: false, intensity: 0.4 }
    })

    expect(effect.environmentWeightNode.value).toBe(0)

    effect.assign({
      environment: { enabled: true, intensity: 0.75 }
    })

    expect(effect.environmentWeightNode.value).toBeCloseTo(0.75)
    expect(effect.toJSON()).toEqual({
      environment: { enabled: true, intensity: 0.75 }
    })

    effect.dispose()
  })

  it('owns and releases the shared sky environment resource', () => {
    const effect = new WaterAreaOpticsEffect({})
    const disposeEnvironment = vi.spyOn(effect.environmentNode, 'dispose')

    effect.dispose()
    effect.dispose()

    expect(disposeEnvironment).toHaveBeenCalledOnce()
  })
})
