import type * as THREE from 'three'
import type { AtmosphereLightingMode, CloudQualityPreset, SurfaceMaterialMode } from '../types'

export interface ResolvedSceneOptions {
  atmosphere: {
    show: boolean
    lighting: {
      mode: AtmosphereLightingMode
      sunLight: boolean
      skyLight: boolean
      sunLightIntensity: number
      skyLightIntensity: number
      albedoScale: number
    }
    night: {
      enabled: boolean
      moonLight: boolean
      ambientLight: boolean
      color: THREE.ColorRepresentation
      moonLightIntensity: number
      ambientIntensity: number
      useMoonPhase: boolean
      transitionRange: [number, number]
    }
    scattering: {
      transmittance: boolean
      inscatter: boolean
      intensity: number
      horizonBlend: boolean
      horizonRange: [number, number]
      correctAltitude: boolean
      correctGeometricError: boolean
      solarIrradianceScale: number
      rayleighScatteringScale: number
      mieScatteringScale: number
      mieExtinctionScale: number
      miePhaseFunctionG: number
      absorptionExtinctionScale: number
      groundAlbedo: number
    }
    sky: {
      stars: boolean
      starsIntensity: number
      starsPointSize: number
      sun: boolean
      moon: boolean
      ground: boolean
      sunAngularRadius: number
      moonAngularRadius: number
      lunarRadianceScale: number
    }
    shadow: {
      radius: number
      sampleCount: number
    }
    fallbackAmbientLight: {
      show: boolean
      intensity: number
    }
  }
  clouds: {
    show: boolean
    quality: CloudQualityPreset | undefined
    lightShafts: boolean
    coverage: number
    speed: number
    layer: {
      altitude: number
      height: number
    }
  }
  surface: {
    materialMode: SurfaceMaterialMode
  }
  postProcess: {
    lensFlare: boolean
    smaa: boolean
    dithering: boolean
    toneMappingExposure: number
  }
}
