import type { LensFlareQuality } from '../types'

export const LENS_FLARE_QUALITY_SCALES: Record<LensFlareQuality, number> = {
  low: 0.25,
  medium: 0.5,
  high: 1
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
