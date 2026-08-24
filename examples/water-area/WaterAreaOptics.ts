export interface WaterAreaEnvironmentOptions {
  enabled?: boolean
  intensity?: number
}

export interface WaterAreaReflectionOptions {
  enabled?: boolean
  intensity?: number
  resolutionScale?: number
  debugView?: boolean
}

export interface WaterAreaOpticsOptions {
  environment?: WaterAreaEnvironmentOptions
  reflection?: WaterAreaReflectionOptions
}

export interface ResolvedWaterAreaOptics {
  environment: Required<WaterAreaEnvironmentOptions>
  reflection: Required<WaterAreaReflectionOptions>
}

export interface WaterAreaEnvironment
  extends Required<WaterAreaEnvironmentOptions> {}

export interface WaterAreaReflection
  extends Required<WaterAreaReflectionOptions> {}

export interface WaterAreaOptics {
  readonly environment: WaterAreaEnvironment
  readonly reflection: WaterAreaReflection
  assign(options: WaterAreaOpticsOptions): void
  toJSON(): ResolvedWaterAreaOptics
}

const DEFAULT_WATER_AREA_ENVIRONMENT = Object.freeze({
  enabled: true,
  intensity: 1
})

const DEFAULT_WATER_AREA_REFLECTION = Object.freeze({
  enabled: true,
  intensity: 0.65,
  resolutionScale: 0.5,
  debugView: false
})

export const DEFAULT_WATER_AREA_OPTICS: Readonly<ResolvedWaterAreaOptics> =
  Object.freeze({
    environment: DEFAULT_WATER_AREA_ENVIRONMENT,
    reflection: DEFAULT_WATER_AREA_REFLECTION
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
    },
    reflection: {
      enabled:
        options.reflection?.enabled ??
        DEFAULT_WATER_AREA_OPTICS.reflection.enabled,
      intensity: normalizeNumber(
        options.reflection?.intensity,
        0,
        1,
        DEFAULT_WATER_AREA_OPTICS.reflection.intensity
      ),
      resolutionScale: normalizeNumber(
        options.reflection?.resolutionScale,
        0.25,
        1,
        DEFAULT_WATER_AREA_OPTICS.reflection.resolutionScale
      ),
      debugView:
        options.reflection?.debugView ??
        DEFAULT_WATER_AREA_OPTICS.reflection.debugView
    }
  }
}
