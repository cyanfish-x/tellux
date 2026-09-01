import type * as THREE from 'three'
import type {
  AtmosphereLightingMode,
  CloudQualityPreset,
  CloudShadowQuality,
  ColorInput,
  EntityTransparencyMode,
  LensFlareQuality,
  SurfaceMaterialMode
} from '../types'
import type { SurfaceMaterialOptions } from '../materials/materialMode'

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
      stars: {
        show: boolean
        intensity: number
        pointSize: number
      }
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
    look: {
      detail: boolean
      turbulence: boolean
      haze: boolean
    }
    shadow: {
      quality: CloudShadowQuality
    }
  }
  entities: {
    transparency: {
      mode: EntityTransparencyMode
    }
  }
  surface: {
    materialMode: SurfaceMaterialMode
    material: SurfaceMaterialOptions
  }
  postProcess: {
    bloom: {
      enabled: boolean
      intensity: number
      luminanceThreshold: number
      luminanceSmoothing: number
      radius: number
    }
    lensFlare: {
      enabled: boolean
      intensity: number
      threshold: {
        level: number
        range: number
      }
      quality: LensFlareQuality
    }
    smaa: {
      enabled: boolean
    }
    taa: {
      enabled: boolean
    }
    dithering: {
      enabled: boolean
    }
    toneMappingExposure: number
  }
  highlight: {
    outline: {
      enabled: boolean
      color: ColorInput
      hiddenColor: ColorInput
      edgeStrength: number
      xray: boolean
    }
    overlay: {
      enabled: boolean
      color: ColorInput
      opacity: number
      hoverColor: ColorInput
      hoverOpacity: number
    }
  }
}
