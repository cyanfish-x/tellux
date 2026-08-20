export type OceanQuality = 'high' | 'balanced'
export type OceanDebugField = 'none' | 'height' | 'landMask' | 'sdf' | 'depth' | 'velocity' | 'foam' | 'revision' | 'timing'

export type OriginalOceanParameterKey =
  | 'wavelength' | 'amplitude' | 'choppiness' | 'layers' | 'spread'
  | 'waveDir' | 'dispersion' | 'ripple' | 'rippleScale' | 'rippleAniso'
  | 'rippleBias' | 'sss' | 'depth' | 'caustics' | 'sun' | 'lean'
  | 'foam' | 'foamLife' | 'foamScale'

export interface OceanParameterDefinition {
  key: OriginalOceanParameterKey
  group: 'waves' | 'ripples' | 'appearance' | 'foam'
  defaultValue: number
  min: number
  max: number
  step: number
}

export const OCEAN_PARAMETER_DEFINITIONS: readonly OceanParameterDefinition[] = [
  { key: 'wavelength', group: 'waves', defaultValue: 10, min: 5, max: 60, step: 1 },
  { key: 'amplitude', group: 'waves', defaultValue: 0.2, min: 0, max: 2, step: 0.02 },
  { key: 'choppiness', group: 'waves', defaultValue: 1.5, min: 0, max: 3, step: 0.05 },
  { key: 'layers', group: 'waves', defaultValue: 5, min: 1, max: 5, step: 1 },
  { key: 'spread', group: 'waves', defaultValue: 40, min: 0, max: 90, step: 1 },
  { key: 'waveDir', group: 'waves', defaultValue: 0, min: -60, max: 60, step: 1 },
  { key: 'dispersion', group: 'waves', defaultValue: 1, min: 0, max: 2, step: 0.05 },
  { key: 'ripple', group: 'ripples', defaultValue: 0.2, min: 0, max: 0.6, step: 0.01 },
  { key: 'rippleScale', group: 'ripples', defaultValue: 0.5, min: 0.05, max: 2.5, step: 0.01 },
  { key: 'rippleAniso', group: 'ripples', defaultValue: 0.8, min: 0, max: 1, step: 0.05 },
  { key: 'rippleBias', group: 'ripples', defaultValue: 0.8, min: 0, max: 1, step: 0.05 },
  { key: 'sss', group: 'appearance', defaultValue: 1.5, min: 0, max: 1.5, step: 0.05 },
  { key: 'depth', group: 'appearance', defaultValue: 8, min: 0.5, max: 40, step: 0.5 },
  { key: 'caustics', group: 'appearance', defaultValue: 1, min: 0, max: 2, step: 0.05 },
  { key: 'sun', group: 'appearance', defaultValue: 10, min: 2, max: 60, step: 1 },
  { key: 'lean', group: 'appearance', defaultValue: 0.5, min: 0, max: 3, step: 0.05 },
  { key: 'foam', group: 'foam', defaultValue: 0.6, min: 0, max: 1, step: 0.02 },
  { key: 'foamLife', group: 'foam', defaultValue: 4, min: 0.5, max: 12, step: 0.5 },
  { key: 'foamScale', group: 'foam', defaultValue: 1, min: 0.5, max: 3, step: 0.05 }
] as const

export type OceanParameters = Record<OriginalOceanParameterKey, number> & {
  quality: OceanQuality
  seaLevel: number
  bathymetrySlope: number
  handoverDepth: number
  lodBlendSeconds: number
  pause: boolean
  wireframe: boolean
  noiseView: boolean
  debugField: OceanDebugField
}

export function createDefaultOceanParameters(): OceanParameters {
  const original = Object.fromEntries(
    OCEAN_PARAMETER_DEFINITIONS.map((definition) => [definition.key, definition.defaultValue])
  ) as Record<OriginalOceanParameterKey, number>
  return {
    ...original,
    quality: 'high',
    seaLevel: 0,
    bathymetrySlope: 0.035,
    handoverDepth: 6,
    lodBlendSeconds: 1.5,
    pause: false,
    wireframe: false,
    noiseView: false,
    debugField: 'none'
  }
}
