import type {
  AtmosphereRuntimeState,
  CloudRuntimeState
} from '../rendering/AtmosphereRuntimeState'

const RANGE_EPSILON = 1e-6

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

function nonNegative(value: number, fallback: number) {
  return Math.max(0, finite(value, fallback))
}

function clamped(value: number, fallback: number, min: number, max: number) {
  return Math.min(Math.max(finite(value, fallback), min), max)
}

function orderedRange(
  value: [number, number],
  fallback: [number, number],
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY
): [number, number] {
  const first = clamped(value[0], fallback[0], min, max)
  const second = clamped(value[1], fallback[1], min, max)
  const start = Math.min(first, second)
  const end = Math.max(first, second)
  if (start !== end) return [start, end]
  if (end < max) return [start, Math.min(max, end + RANGE_EPSILON)]
  return [Math.max(min, start - RANGE_EPSILON), end]
}

/**
 * Scene 数值字段的单一归一化规范。初始化解析、运行时 setter 和渲染 adapter
 * 都复用这里，保证公开 getter 与底层 effect 收到同一个值。
 *
 * Single normalization policy shared by scene option resolution, runtime
 * setters, and renderer adapters.
 */
export const sceneValueNormalizers = {
  sunLightIntensity: (value: number) => nonNegative(value, 1),
  skyLightIntensity: (value: number) => nonNegative(value, 1),
  albedoScale: (value: number) => nonNegative(value, 1),
  moonLightIntensity: (value: number) => nonNegative(value, 0.18),
  nightAmbientIntensity: (value: number) => nonNegative(value, 0.08),
  nightTransitionRange: (value: [number, number]) =>
    orderedRange(value, [-0.08, 0.05]),
  inscatterIntensity: (value: number) => clamped(value, 0.6, 0, 1),
  inscatterHorizonRange: (value: [number, number]) =>
    orderedRange(value, [0, 0.6], 0, 1),
  solarIrradianceScale: (value: number) => nonNegative(value, 1),
  rayleighScatteringScale: (value: number) => nonNegative(value, 1),
  mieScatteringScale: (value: number) => nonNegative(value, 1),
  mieExtinctionScale: (value: number) => nonNegative(value, 1),
  miePhaseFunctionG: (value: number) => clamped(value, 0.8, -0.99, 0.99),
  absorptionExtinctionScale: (value: number) => nonNegative(value, 1),
  groundAlbedo: (value: number) => clamped(value, 0.1, 0, 1),
  starsIntensity: (value: number) => nonNegative(value, 1),
  starsPointSize: (value: number) => nonNegative(value, 1),
  sunAngularRadius: (value: number) => clamped(value, 0.004675, 0, 0.1),
  moonAngularRadius: (value: number) => clamped(value, 0.0045, 0, 0.1),
  lunarRadianceScale: (value: number) => nonNegative(value, 1),
  shadowRadius: (value: number) => nonNegative(value, 3),
  shadowSampleCount: (value: number) => Math.round(clamped(value, 8, 1, 16)),
  fallbackAmbientLightIntensity: (value: number) => nonNegative(value, 0.5),
  cloudCoverage: (value: number) => clamped(value, 0.3, 0, 1),
  cloudSpeed: (value: number) => nonNegative(value, 0.001),
  cloudLayerAltitude: (value: number) => finite(value, 1500),
  cloudLayerHeight: (value: number) => nonNegative(value, 650)
} as const

export function normalizeAtmosphereRuntimeState(
  state: AtmosphereRuntimeState
): AtmosphereRuntimeState {
  const normalize = sceneValueNormalizers
  return {
    ...state,
    inscatterIntensity: normalize.inscatterIntensity(state.inscatterIntensity),
    inscatterHorizonRange: normalize.inscatterHorizonRange(state.inscatterHorizonRange),
    sunLightIntensity: normalize.sunLightIntensity(state.sunLightIntensity),
    skyLightIntensity: normalize.skyLightIntensity(state.skyLightIntensity),
    night: {
      ...state.night,
      moonLightIntensity: normalize.moonLightIntensity(state.night.moonLightIntensity),
      ambientIntensity: normalize.nightAmbientIntensity(state.night.ambientIntensity),
      transitionRange: normalize.nightTransitionRange(state.night.transitionRange)
    },
    albedoScale: normalize.albedoScale(state.albedoScale),
    sunAngularRadius: normalize.sunAngularRadius(state.sunAngularRadius),
    moonAngularRadius: normalize.moonAngularRadius(state.moonAngularRadius),
    lunarRadianceScale: normalize.lunarRadianceScale(state.lunarRadianceScale),
    shadowRadius: normalize.shadowRadius(state.shadowRadius),
    shadowSampleCount: normalize.shadowSampleCount(state.shadowSampleCount),
    starsIntensity: normalize.starsIntensity(state.starsIntensity),
    starsPointSize: normalize.starsPointSize(state.starsPointSize),
    solarIrradianceScale: normalize.solarIrradianceScale(state.solarIrradianceScale),
    rayleighScatteringScale: normalize.rayleighScatteringScale(state.rayleighScatteringScale),
    mieScatteringScale: normalize.mieScatteringScale(state.mieScatteringScale),
    mieExtinctionScale: normalize.mieExtinctionScale(state.mieExtinctionScale),
    miePhaseFunctionG: normalize.miePhaseFunctionG(state.miePhaseFunctionG),
    absorptionExtinctionScale: normalize.absorptionExtinctionScale(state.absorptionExtinctionScale),
    groundAlbedo: normalize.groundAlbedo(state.groundAlbedo)
  }
}

export function normalizeCloudRuntimeState(state: CloudRuntimeState): CloudRuntimeState {
  const normalize = sceneValueNormalizers
  return {
    ...state,
    coverage: normalize.cloudCoverage(state.coverage),
    speed: normalize.cloudSpeed(state.speed),
    layerAltitude: normalize.cloudLayerAltitude(state.layerAltitude),
    layerHeight: normalize.cloudLayerHeight(state.layerHeight)
  }
}
