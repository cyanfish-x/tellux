export interface BloomAppearanceState {
  enabled: boolean
  intensity: number
  luminanceThreshold: number
  luminanceSmoothing: number
  radius: number
}

interface BloomEffectAppearanceTarget {
  intensity: number
  luminanceMaterial: {
    threshold: number
    smoothing: number
  }
  mipmapBlurPass: {
    radius: number
  }
}

interface WebGPUBloomAppearanceTarget {
  strength: { value: number }
  threshold: { value: number }
  smoothWidth: { value: number }
  radius: { value: number }
}

export function applyBloomAppearanceState(
  effect: BloomEffectAppearanceTarget,
  state: BloomAppearanceState
) {
  effect.intensity = state.intensity
  effect.luminanceMaterial.threshold = state.luminanceThreshold
  effect.luminanceMaterial.smoothing = state.luminanceSmoothing
  effect.mipmapBlurPass.radius = state.radius
}

export function applyWebGPUBloomAppearanceState(
  node: WebGPUBloomAppearanceTarget,
  state: BloomAppearanceState
) {
  node.strength.value = state.intensity
  node.threshold.value = state.luminanceThreshold
  node.smoothWidth.value = state.luminanceSmoothing
  node.radius.value = state.radius
}
