export const GAUSSIAN_SPLAT_RUNTIME_BINDING_NAMES = [
  'SplatColorTransform', 'getSparkRendererForScene',
  'GaussianSplatPlugin', 'SparkRenderer', 'SplatMesh', 'CesiumIonAuthPlugin', 'ImplicitTilingPlugin', 'CESIUM_ION_EVALUATION_TOKEN'
] as const

export const HISM_RUNTIME_BINDING_NAMES = [
  'HISM_DEMO_CENTER',
  'HISM_DEMO_VIEW_POSE',
  'HISM_TREE_PRESETS',
  'buildHismTreeTemplate',
  'buildLegacyTreeTemplate',
  'buildLodTreeArchetypes',
  'buildSimpleTreeArchetypes',
  'createHismDemoViewerOptions',
  'generateFastPlacements',
  'generatePoissonPlacements'
] as const

export const WATER_AREA_RUNTIME_BINDING_NAMES = [
  'createWaterAreaDemo',
  'setupWaterAreaPanel',
  'DEFAULT_WATER_AREA_APPEARANCE',
  'normalizeWaterAreaAppearance',
  'DEFAULT_WATER_AREA_OPTICS',
  'normalizeWaterAreaOptics',
  'DEFAULT_WATER_AREA_WAVE_ORIGIN'
] as const

export const THREEJS_INTEROP_RUNTIME_BINDING_NAMES = [
  'isNightLightsOn',
  'computeSunAltitudeAtLocation',
  'setupLittlestTokyoNightRig',
] as const

export interface OptionalRuntimeBindings {
  gaussianSplat: boolean
  hism: boolean
  tree: boolean
  waterArea: boolean
  threejsInterop: boolean
}

export function detectOptionalRuntimeBindings(
  source: string
): OptionalRuntimeBindings {
  return {
    gaussianSplat: GAUSSIAN_SPLAT_RUNTIME_BINDING_NAMES.some(name => hasIdentifier(source, name)),
    hism: HISM_RUNTIME_BINDING_NAMES.some((name) => hasIdentifier(source, name)),
    tree: hasIdentifier(source, 'Tree'),
    waterArea: WATER_AREA_RUNTIME_BINDING_NAMES.some((name) =>
      hasIdentifier(source, name)
    ),
    threejsInterop: THREEJS_INTEROP_RUNTIME_BINDING_NAMES.some((name) =>
      hasIdentifier(source, name)
    )
  }
}

function hasIdentifier(source: string, identifier: string) {
  return new RegExp(`\\b${identifier}\\b`).test(source)
}
