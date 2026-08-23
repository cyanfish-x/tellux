import type { LensFlareQuality } from '../types'

export const LENS_FLARE_QUALITY_SCALES: Record<LensFlareQuality, number> = {
  low: 0.25,
  medium: 0.5,
  high: 1
}

const WEBGPU_LENS_FLARE_DEFAULTS = {
  intensity: 0.005,
  bloomIntensity: 0.05,
  featureIntensity: 1e-5
}

export function resolveLensFlareQuality(
  value: string | undefined,
  fallback: LensFlareQuality = 'medium'
): LensFlareQuality {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  return fallback
}

/**
 * 将 Tellux 镜头光晕设置同步到 Takram `LensFlareEffect`。
 *
 * Syncs Tellux lens flare settings onto Takram `LensFlareEffect`.
 */
export function applyLensFlareAppearanceState(
  lensFlareEffect: {
    intensity: number
    thresholdLevel: number
    thresholdRange: number
    resolution: { scale: number }
  },
  settings: {
    intensity: number
    threshold: { level: number; range: number }
    quality: LensFlareQuality
  }
) {
  const quality = resolveLensFlareQuality(settings.quality)
  lensFlareEffect.intensity = settings.intensity
  lensFlareEffect.thresholdLevel = settings.threshold.level
  lensFlareEffect.thresholdRange = settings.threshold.range
  lensFlareEffect.resolution.scale = LENS_FLARE_QUALITY_SCALES[quality]
}

/**
 * 将 Tellux 镜头光晕设置同步到 Takram `LensFlareNode`。
 *
 * WebGPU node 将 bloom 与各类 feature 的强度拆分为独立 uniform；Tellux 仍用
 * 一个 `intensity` 对外表达整体强度，并以其默认值作为上游默认参数的倍率基准。
 *
 * Syncs Tellux lens flare settings onto Takram `LensFlareNode`.
 *
 * The WebGPU node exposes separate uniforms for bloom and feature intensity.
 * Tellux keeps one public `intensity`, scaling the upstream defaults relative
 * to the Tellux default value.
 */
export function applyWebGPULensFlareAppearanceState(
  lensFlareNode: {
    bloomIntensity: { value: number }
    thresholdNode: {
      thresholdLevel: { value: number }
      thresholdRange: { value: number }
      resolutionScale: number
    }
    featuresNode: { pixelRatio?: number }
    ghostNode: { intensity: { value: number } }
    haloNode: { intensity: { value: number } }
    glareNode: { intensity: { value: number } }
  },
  settings: {
    intensity: number
    threshold: { level: number; range: number }
    quality: LensFlareQuality
  }
) {
  const quality = resolveLensFlareQuality(settings.quality)
  const intensityScale = settings.intensity / WEBGPU_LENS_FLARE_DEFAULTS.intensity
  lensFlareNode.bloomIntensity.value = WEBGPU_LENS_FLARE_DEFAULTS.bloomIntensity * intensityScale
  lensFlareNode.ghostNode.intensity.value = WEBGPU_LENS_FLARE_DEFAULTS.featureIntensity * intensityScale
  lensFlareNode.haloNode.intensity.value = WEBGPU_LENS_FLARE_DEFAULTS.featureIntensity * intensityScale
  lensFlareNode.glareNode.intensity.value = WEBGPU_LENS_FLARE_DEFAULTS.featureIntensity * intensityScale
  lensFlareNode.thresholdNode.thresholdLevel.value = settings.threshold.level
  lensFlareNode.thresholdNode.thresholdRange.value = settings.threshold.range
  lensFlareNode.thresholdNode.resolutionScale = LENS_FLARE_QUALITY_SCALES[quality]
  lensFlareNode.featuresNode.pixelRatio = LENS_FLARE_QUALITY_SCALES[quality]
}
