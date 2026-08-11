import type { CloudShadowQuality } from '../types'
import type { CloudRuntimeState } from './AtmosphereRuntimeState'

export const CLOUD_SHADOW_QUALITY_PRESETS: Record<
  CloudShadowQuality,
  { cascadeCount: number; mapSize: number }
> = {
  low: { cascadeCount: 1, mapSize: 256 },
  medium: { cascadeCount: 2, mapSize: 512 },
  high: { cascadeCount: 4, mapSize: 1024 }
}

export function resolveCloudShadowQuality(
  value: string | undefined,
  fallback: CloudShadowQuality = 'medium'
): CloudShadowQuality {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  return fallback
}

/**
 * 将 Tellux 云外观 / 云影质量状态应用到 Takram `CloudsEffect`。
 *
 * 应在 `qualityPreset` 之后调用，以便用户显式外观覆盖 preset 默认值。
 *
 * Applies Tellux cloud look / shadow quality state to Takram `CloudsEffect`.
 * Call after `qualityPreset` so explicit look overrides preset defaults.
 */
export function applyCloudAppearanceState(
  cloudsEffect: {
    shapeDetail: boolean
    turbulence: boolean
    haze: boolean
    shadow: {
      cascadeCount: number
      mapSize: { set: (width: number, height: number) => void }
    }
  },
  state: Pick<CloudRuntimeState, 'look' | 'shadow'>
) {
  cloudsEffect.shapeDetail = state.look.detail
  cloudsEffect.turbulence = state.look.turbulence
  cloudsEffect.haze = state.look.haze

  const quality = resolveCloudShadowQuality(state.shadow.quality)
  const preset = CLOUD_SHADOW_QUALITY_PRESETS[quality]
  cloudsEffect.shadow.cascadeCount = preset.cascadeCount
  cloudsEffect.shadow.mapSize.set(preset.mapSize, preset.mapSize)
}
