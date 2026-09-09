import * as THREE from 'three'
import type { ToneMappingMode } from '../types'

export const TONE_MAPPING_MODES = [
  'linear',
  'reinhard',
  'cineon',
  'aces-filmic',
  'agx',
  'neutral'
] as const satisfies readonly ToneMappingMode[]

export function isToneMappingMode(value: string | undefined): value is ToneMappingMode {
  return (
    value === 'linear' ||
    value === 'reinhard' ||
    value === 'cineon' ||
    value === 'aces-filmic' ||
    value === 'agx' ||
    value === 'neutral'
  )
}

export function resolveThreeToneMapping(
  enabled: boolean,
  mode: ToneMappingMode
): THREE.ToneMapping {
  if (!enabled) return THREE.NoToneMapping
  switch (mode) {
    case 'linear':
      return THREE.LinearToneMapping
    case 'reinhard':
      return THREE.ReinhardToneMapping
    case 'cineon':
      return THREE.CineonToneMapping
    case 'aces-filmic':
      return THREE.ACESFilmicToneMapping
    case 'neutral':
      return THREE.NeutralToneMapping
    case 'agx':
    default:
      return THREE.AgXToneMapping
  }
}
