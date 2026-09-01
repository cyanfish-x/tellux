export interface WaterAreaEnvironmentOptions {
  enabled?: boolean
  intensity?: number
}

export interface WaterAreaOpticsOptions {
  environment?: WaterAreaEnvironmentOptions
}

export interface ResolvedWaterAreaOptics {
  environment: Required<WaterAreaEnvironmentOptions>
}

export interface WaterAreaEnvironment
  extends Required<WaterAreaEnvironmentOptions> {}

export interface WaterAreaOptics {
  readonly environment: WaterAreaEnvironment
  assign(options: WaterAreaOpticsOptions): void
  toJSON(): ResolvedWaterAreaOptics
}

const DEFAULT_WATER_AREA_ENVIRONMENT = Object.freeze({
  enabled: true,
  intensity: 1
})

export const DEFAULT_WATER_AREA_OPTICS: Readonly<ResolvedWaterAreaOptics> =
  Object.freeze({
    environment: DEFAULT_WATER_AREA_ENVIRONMENT
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

export function normalizeWaterAreaOptics(
  options: WaterAreaOpticsOptions = {}
): ResolvedWaterAreaOptics {
  return {
    environment: {
      enabled:
        options.environment?.enabled ??
        DEFAULT_WATER_AREA_OPTICS.environment.enabled,
      intensity: normalizeNumber(
        options.environment?.intensity,
        0,
        2,
        DEFAULT_WATER_AREA_OPTICS.environment.intensity
      )
    }
  }
}
