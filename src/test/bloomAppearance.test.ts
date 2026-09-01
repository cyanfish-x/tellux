import { describe, expect, it } from 'vitest'

import {
  applyBloomAppearanceState,
  applyWebGPUBloomAppearanceState
} from '../rendering/bloomAppearance'

const settings = {
  enabled: true,
  intensity: 1.4,
  luminanceThreshold: 0.8,
  luminanceSmoothing: 0.12,
  radius: 0.7
}

describe('bloom appearance', () => {
  it('maps scene settings to the WebGL BloomEffect', () => {
    const effect = {
      intensity: 1,
      luminanceMaterial: { threshold: 1, smoothing: 0.03 },
      mipmapBlurPass: { radius: 0.85 }
    }

    applyBloomAppearanceState(effect, settings)

    expect(effect.intensity).toBe(1.4)
    expect(effect.luminanceMaterial.threshold).toBe(0.8)
    expect(effect.luminanceMaterial.smoothing).toBe(0.12)
    expect(effect.mipmapBlurPass.radius).toBe(0.7)
  })

  it('maps scene settings to WebGPU BloomNode uniforms', () => {
    const node = {
      strength: { value: 1 },
      threshold: { value: 1 },
      smoothWidth: { value: 0.03 },
      radius: { value: 0.85 }
    }

    applyWebGPUBloomAppearanceState(node, settings)

    expect(node.strength.value).toBe(1.4)
    expect(node.threshold.value).toBe(0.8)
    expect(node.smoothWidth.value).toBe(0.12)
    expect(node.radius.value).toBe(0.7)
  })
})
