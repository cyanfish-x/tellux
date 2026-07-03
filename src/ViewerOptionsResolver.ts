import { DEFAULT_CAMERA } from './constants'
import type { SurfaceMaterialOptions } from './materials/materialMode'
import type { ModelMaterialMode } from './models/GltfModelLayer'
import type { ResolvedSceneOptions } from './Scene'
import type { AtmosphereLightingMode, SurfaceMaterialMode, ViewerOptions, ViewerSurfaceMaterialOptions } from './types'

export type ResolvedSurfaceMaterialMode = Exclude<SurfaceMaterialMode, 'auto'>
export type SceneTilesetMaterialMode = 'basic' | 'standard'

export function resolveViewerCameraOptions(options: ViewerOptions['camera']) {
  return {
    ...DEFAULT_CAMERA,
    ...options
  }
}

export function resolveViewerResolutionScale(options: ViewerOptions) {
  return options.resolutionScale ?? Math.min(window.devicePixelRatio, 2)
}

export function resolveViewerSceneOptions(options: ViewerOptions['scene']): ResolvedSceneOptions {
  const atmosphereLightingMode = options?.atmosphere?.lighting?.mode ?? 'post-process'

  return {
    atmosphere: {
      show: options?.atmosphere?.show ?? true,
      lighting: {
        mode: atmosphereLightingMode,
        sunLight: options?.atmosphere?.lighting?.sunLight ?? true,
        skyLight: options?.atmosphere?.lighting?.skyLight ?? true,
        sunLightIntensity: options?.atmosphere?.lighting?.sunLightIntensity ?? 1,
        skyLightIntensity: options?.atmosphere?.lighting?.skyLightIntensity ?? 1,
        albedoScale: options?.atmosphere?.lighting?.albedoScale ?? 1
      },
      night: {
        enabled: options?.atmosphere?.night?.enabled ?? false,
        moonLight: options?.atmosphere?.night?.moonLight ?? true,
        ambientLight: options?.atmosphere?.night?.ambientLight ?? true,
        color: options?.atmosphere?.night?.color ?? 0x9bbcff,
        moonLightIntensity: options?.atmosphere?.night?.moonLightIntensity ?? 0.18,
        ambientIntensity: options?.atmosphere?.night?.ambientIntensity ?? 0.08,
        useMoonPhase: options?.atmosphere?.night?.useMoonPhase ?? true,
        transitionRange: options?.atmosphere?.night?.transitionRange ?? [-0.08, 0.05]
      },
      scattering: {
        transmittance: options?.atmosphere?.scattering?.transmittance ?? true,
        inscatter: options?.atmosphere?.scattering?.inscatter ?? true,
        intensity: options?.atmosphere?.scattering?.intensity ?? 0.6,
        horizonBlend: options?.atmosphere?.scattering?.horizonBlend ?? true,
        horizonRange: options?.atmosphere?.scattering?.horizonRange ?? [0, 0.6],
        correctAltitude: options?.atmosphere?.scattering?.correctAltitude ?? true,
        correctGeometricError: options?.atmosphere?.scattering?.correctGeometricError ?? true,
        solarIrradianceScale: options?.atmosphere?.scattering?.solarIrradianceScale ?? 1,
        rayleighScatteringScale: options?.atmosphere?.scattering?.rayleighScatteringScale ?? 1,
        mieScatteringScale: options?.atmosphere?.scattering?.mieScatteringScale ?? 1,
        mieExtinctionScale: options?.atmosphere?.scattering?.mieExtinctionScale ?? 1,
        miePhaseFunctionG: options?.atmosphere?.scattering?.miePhaseFunctionG ?? 0.8,
        absorptionExtinctionScale: options?.atmosphere?.scattering?.absorptionExtinctionScale ?? 1,
        groundAlbedo: options?.atmosphere?.scattering?.groundAlbedo ?? 0.1
      },
      sky: {
        stars: options?.atmosphere?.sky?.stars ?? true,
        starsIntensity: options?.atmosphere?.sky?.starsIntensity ?? 1,
        starsPointSize: options?.atmosphere?.sky?.starsPointSize ?? 1,
        sun: options?.atmosphere?.sky?.sun ?? true,
        moon: options?.atmosphere?.sky?.moon ?? true,
        ground: options?.atmosphere?.sky?.ground ?? true,
        sunAngularRadius: options?.atmosphere?.sky?.sunAngularRadius ?? 0.004675,
        moonAngularRadius: options?.atmosphere?.sky?.moonAngularRadius ?? 0.0045,
        lunarRadianceScale: options?.atmosphere?.sky?.lunarRadianceScale ?? 1
      },
      shadow: {
        radius: options?.atmosphere?.shadow?.radius ?? 3,
        sampleCount: options?.atmosphere?.shadow?.sampleCount ?? 8
      },
      fallbackAmbientLight: {
        show: options?.atmosphere?.fallbackAmbientLight?.show ?? true,
        intensity: options?.atmosphere?.fallbackAmbientLight?.intensity ?? 0.5
      }
    },
    clouds: {
      show: options?.clouds?.show ?? true,
      quality: options?.clouds?.quality,
      lightShafts: options?.clouds?.lightShafts ?? true,
      coverage: options?.clouds?.coverage ?? 0.3,
      speed: options?.clouds?.speed ?? 0.001,
      layer: {
        altitude: options?.clouds?.layer?.altitude ?? 1500,
        height: options?.clouds?.layer?.height ?? 650
      }
    },
    entities: {
      transparency: {
        mode: options?.entities?.transparency?.mode ?? 'auto'
      }
    },
    surface: {
      materialMode: options?.surface?.materialMode ?? 'auto',
      material: resolveSurfaceMaterialOptions(options?.surface?.material)
    },
    postProcess: {
      lensFlare: options?.postProcess?.lensFlare ?? true,
      smaa: options?.postProcess?.smaa ?? true,
      dithering: options?.postProcess?.dithering ?? false,
      toneMappingExposure: options?.postProcess?.toneMappingExposure ?? 5
    }
  }
}

export function resolveSurfaceMaterialMode(
  surfaceMaterialMode: SurfaceMaterialMode,
  atmosphereLightingMode: AtmosphereLightingMode
): ResolvedSurfaceMaterialMode {
  if (surfaceMaterialMode !== 'auto') return surfaceMaterialMode
  return atmosphereLightingMode === 'light-source' ? 'standard' : 'basic'
}

export function resolveSurfaceMaterialOptions(
  options: ViewerSurfaceMaterialOptions | undefined
): SurfaceMaterialOptions {
  return {
    roughness: clamp01(options?.roughness, 1),
    metalness: clamp01(options?.metalness, 0),
    useRoughnessMap: options?.useRoughnessMap ?? false
  }
}

export function resolveSceneContentMaterialMode(
  atmosphereLightingMode: AtmosphereLightingMode
): SceneTilesetMaterialMode {
  return atmosphereLightingMode === 'post-process' ? 'basic' : 'standard'
}

export function resolveModelMaterialMode(atmosphereLightingMode: AtmosphereLightingMode): ModelMaterialMode {
  return atmosphereLightingMode === 'post-process' ? 'basic' : 'standard'
}

function clamp01(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : fallback
}
