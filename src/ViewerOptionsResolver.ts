import { DEFAULT_CAMERA } from './constants'
import type { SurfaceMaterialOptions } from './materials/materialMode'
import type { ModelMaterialMode } from './models/GltfModelLayer'
import type { ResolvedSceneOptions } from './Scene'
import { sceneValueNormalizers } from './scene/SceneValueNormalization'
import type {
  AtmosphereLightingMode,
  SurfaceMaterialMode,
  ViewerAtmosphereStarsOptions,
  ViewerLensFlareOptions,
  ViewerOptions,
  ViewerPostProcessStageOptions,
  ViewerSurfaceMaterialOptions
} from './types'

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
  const normalize = sceneValueNormalizers
  const stars = resolveStarsOptions(options?.atmosphere?.sky?.stars)

  return {
    atmosphere: {
      show: options?.atmosphere?.show ?? true,
      lighting: {
        mode: atmosphereLightingMode,
        sunLight: options?.atmosphere?.lighting?.sunLight ?? true,
        skyLight: options?.atmosphere?.lighting?.skyLight ?? true,
        sunLightIntensity: normalize.sunLightIntensity(
          options?.atmosphere?.lighting?.sunLightIntensity ?? 1
        ),
        skyLightIntensity: normalize.skyLightIntensity(
          options?.atmosphere?.lighting?.skyLightIntensity ?? 1
        ),
        albedoScale: normalize.albedoScale(options?.atmosphere?.lighting?.albedoScale ?? 1)
      },
      night: {
        enabled: options?.atmosphere?.night?.enabled ?? false,
        moonLight: options?.atmosphere?.night?.moonLight ?? true,
        ambientLight: options?.atmosphere?.night?.ambientLight ?? true,
        color: options?.atmosphere?.night?.color ?? 0x9bbcff,
        moonLightIntensity: normalize.moonLightIntensity(
          options?.atmosphere?.night?.moonLightIntensity ?? 0.18
        ),
        ambientIntensity: normalize.nightAmbientIntensity(
          options?.atmosphere?.night?.ambientIntensity ?? 0.08
        ),
        useMoonPhase: options?.atmosphere?.night?.useMoonPhase ?? true,
        transitionRange: normalize.nightTransitionRange(
          options?.atmosphere?.night?.transitionRange ?? [-0.08, 0.05]
        )
      },
      scattering: {
        transmittance: options?.atmosphere?.scattering?.transmittance ?? true,
        inscatter: options?.atmosphere?.scattering?.inscatter ?? true,
        intensity: normalize.inscatterIntensity(
          options?.atmosphere?.scattering?.intensity ?? 0.6
        ),
        horizonBlend: options?.atmosphere?.scattering?.horizonBlend ?? true,
        horizonRange: normalize.inscatterHorizonRange(
          options?.atmosphere?.scattering?.horizonRange ?? [0, 0.6]
        ),
        correctAltitude: options?.atmosphere?.scattering?.correctAltitude ?? true,
        correctGeometricError: options?.atmosphere?.scattering?.correctGeometricError ?? true,
        solarIrradianceScale: normalize.solarIrradianceScale(
          options?.atmosphere?.scattering?.solarIrradianceScale ?? 1
        ),
        rayleighScatteringScale: normalize.rayleighScatteringScale(
          options?.atmosphere?.scattering?.rayleighScatteringScale ?? 1
        ),
        mieScatteringScale: normalize.mieScatteringScale(
          options?.atmosphere?.scattering?.mieScatteringScale ?? 1
        ),
        mieExtinctionScale: normalize.mieExtinctionScale(
          options?.atmosphere?.scattering?.mieExtinctionScale ?? 1
        ),
        miePhaseFunctionG: normalize.miePhaseFunctionG(
          options?.atmosphere?.scattering?.miePhaseFunctionG ?? 0.8
        ),
        absorptionExtinctionScale: normalize.absorptionExtinctionScale(
          options?.atmosphere?.scattering?.absorptionExtinctionScale ?? 1
        ),
        groundAlbedo: normalize.groundAlbedo(
          options?.atmosphere?.scattering?.groundAlbedo ?? 0.1
        )
      },
      sky: {
        stars,
        sun: options?.atmosphere?.sky?.sun ?? true,
        moon: options?.atmosphere?.sky?.moon ?? true,
        ground: options?.atmosphere?.sky?.ground ?? true,
        sunAngularRadius: normalize.sunAngularRadius(
          options?.atmosphere?.sky?.sunAngularRadius ?? 0.004675
        ),
        moonAngularRadius: normalize.moonAngularRadius(
          options?.atmosphere?.sky?.moonAngularRadius ?? 0.0045
        ),
        lunarRadianceScale: normalize.lunarRadianceScale(
          options?.atmosphere?.sky?.lunarRadianceScale ?? 1
        )
      },
      shadow: {
        radius: normalize.shadowRadius(options?.atmosphere?.shadow?.radius ?? 3),
        sampleCount: normalize.shadowSampleCount(
          options?.atmosphere?.shadow?.sampleCount ?? 8
        )
      },
      fallbackAmbientLight: {
        show: options?.atmosphere?.fallbackAmbientLight?.show ?? true,
        intensity: normalize.fallbackAmbientLightIntensity(
          options?.atmosphere?.fallbackAmbientLight?.intensity ?? 0.5
        )
      }
    },
    clouds: {
      show: options?.clouds?.show ?? true,
      quality: options?.clouds?.quality,
      lightShafts: options?.clouds?.lightShafts ?? true,
      coverage: normalize.cloudCoverage(options?.clouds?.coverage ?? 0.3),
      speed: normalize.cloudSpeed(options?.clouds?.speed ?? 0.001),
      layer: {
        altitude: normalize.cloudLayerAltitude(options?.clouds?.layer?.altitude ?? 1500),
        height: normalize.cloudLayerHeight(options?.clouds?.layer?.height ?? 650)
      },
      look: {
        detail: options?.clouds?.look?.detail ?? true,
        turbulence: options?.clouds?.look?.turbulence ?? true,
        haze: options?.clouds?.look?.haze ?? true
      },
      shadow: {
        quality: normalize.cloudShadowQuality(options?.clouds?.shadow?.quality)
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
      lensFlare: resolveLensFlareOptions(options?.postProcess?.lensFlare),
      smaa: resolvePostProcessStageOptions(options?.postProcess?.smaa, true),
      taa: resolvePostProcessStageOptions(options?.postProcess?.taa, false),
      dithering: resolvePostProcessStageOptions(options?.postProcess?.dithering, false),
      toneMappingExposure: options?.postProcess?.toneMappingExposure ?? 5
    },
    highlight: {
      outline: {
        enabled: options?.highlight?.outline?.enabled ?? true,
        color: options?.highlight?.outline?.color ?? '#7cff5b',
        hiddenColor:
          options?.highlight?.outline?.hiddenColor ??
          options?.highlight?.outline?.color ??
          '#7cff5b',
        edgeStrength: options?.highlight?.outline?.edgeStrength ?? 1.5,
        xray: options?.highlight?.outline?.xray ?? true
      },
      overlay: {
        enabled: options?.highlight?.overlay?.enabled ?? true,
        color: options?.highlight?.overlay?.color ?? '#7cff5b',
        opacity: options?.highlight?.overlay?.opacity ?? 0.55,
        hoverColor: options?.highlight?.overlay?.hoverColor ?? '#38bdf8',
        hoverOpacity: options?.highlight?.overlay?.hoverOpacity ?? 0.42
      }
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

function resolveStarsOptions(
  options: boolean | ViewerAtmosphereStarsOptions | undefined
): ResolvedSceneOptions['atmosphere']['sky']['stars'] {
  const normalize = sceneValueNormalizers
  if (typeof options === 'boolean') {
    return {
      show: options,
      intensity: normalize.starsIntensity(1),
      pointSize: normalize.starsPointSize(1)
    }
  }

  return {
    show: options?.show ?? true,
    intensity: normalize.starsIntensity(options?.intensity ?? 1),
    pointSize: normalize.starsPointSize(options?.pointSize ?? 1)
  }
}

function resolvePostProcessStageOptions(
  options: boolean | ViewerPostProcessStageOptions | undefined,
  defaultEnabled: boolean
): { enabled: boolean } {
  if (typeof options === 'boolean') return { enabled: options }
  return { enabled: options?.enabled ?? defaultEnabled }
}

function resolveLensFlareOptions(
  options: boolean | ViewerLensFlareOptions | undefined
): ResolvedSceneOptions['postProcess']['lensFlare'] {
  const normalize = sceneValueNormalizers
  if (typeof options === 'boolean' || options === undefined) {
    return {
      enabled: options ?? true,
      intensity: normalize.lensFlareIntensity(0.005),
      threshold: {
        level: normalize.lensFlareThresholdLevel(10),
        range: normalize.lensFlareThresholdRange(1)
      },
      quality: 'medium'
    }
  }

  const quality = normalize.lensFlareQuality(options.quality)
  return {
    enabled: options.enabled ?? true,
    intensity: normalize.lensFlareIntensity(options.intensity ?? 0.005),
    threshold: {
      level: normalize.lensFlareThresholdLevel(options.threshold?.level ?? 10),
      range: normalize.lensFlareThresholdRange(options.threshold?.range ?? 1)
    },
    quality
  }
}

function clamp01(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : fallback
}
