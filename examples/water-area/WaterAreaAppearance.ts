export interface WaterAreaAppearanceOptions {
  show?: boolean
  color?: string
  colorMix?: number
  roughness?: number
  waveStrength?: number
  waveScale?: number
  waveSpeed?: number
  waveDirection?: number
}

export interface ResolvedWaterAreaAppearance {
  show: boolean
  color: string
  colorMix: number
  roughness: number
  waveStrength: number
  waveScale: number
  waveSpeed: number
  waveDirection: number
}

export interface WaterAreaAppearance extends ResolvedWaterAreaAppearance {
  assign(options: WaterAreaAppearanceOptions): void
  toJSON(): ResolvedWaterAreaAppearance
}

export const DEFAULT_WATER_AREA_APPEARANCE: Readonly<ResolvedWaterAreaAppearance> =
  Object.freeze({
    show: true,
    color: '#06172d',
    colorMix: 0.8,
    roughness: 0.11,
    waveStrength: 0.8,
    waveScale: 0.3,
    waveSpeed: 0.5,
    waveDirection: 160
  })

function normalizeNumber(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  return Number.isFinite(value)
    ? Math.min(Math.max(value as number, minimum), maximum)
    : fallback
}

function normalizeDirection(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_WATER_AREA_APPEARANCE.waveDirection
  }
  return (((value as number) % 360) + 360) % 360
}

function normalizeColor(value: string | undefined): string {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : DEFAULT_WATER_AREA_APPEARANCE.color
}

export function normalizeWaterAreaAppearance(
  options: WaterAreaAppearanceOptions = {}
): ResolvedWaterAreaAppearance {
  return {
    show: options.show ?? DEFAULT_WATER_AREA_APPEARANCE.show,
    color: normalizeColor(options.color),
    colorMix: normalizeNumber(
      options.colorMix,
      0,
      1,
      DEFAULT_WATER_AREA_APPEARANCE.colorMix
    ),
    roughness: normalizeNumber(
      options.roughness,
      0.05,
      0.8,
      DEFAULT_WATER_AREA_APPEARANCE.roughness
    ),
    waveStrength: normalizeNumber(
      options.waveStrength,
      0,
      1,
      DEFAULT_WATER_AREA_APPEARANCE.waveStrength
    ),
    waveScale: normalizeNumber(
      options.waveScale,
      0.25,
      4,
      DEFAULT_WATER_AREA_APPEARANCE.waveScale
    ),
    waveSpeed: normalizeNumber(
      options.waveSpeed,
      0,
      2,
      DEFAULT_WATER_AREA_APPEARANCE.waveSpeed
    ),
    waveDirection: normalizeDirection(options.waveDirection)
  }
}
