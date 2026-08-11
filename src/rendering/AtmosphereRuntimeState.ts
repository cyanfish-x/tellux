import type * as THREE from 'three'
import type { AtmosphereLightingMode, CloudQualityPreset, CloudShadowQuality } from '../types'

export interface AtmosphereNightRuntimeState {
  enabled: boolean
  moonLight: boolean
  ambientLight: boolean
  color: THREE.ColorRepresentation
  moonLightIntensity: number
  ambientIntensity: number
  useMoonPhase: boolean
  transitionRange: [number, number]
}

export interface AtmosphereRuntimeState {
  inscatterIntensity: number
  inscatterHorizonBlend: boolean
  inscatterHorizonRange: [number, number]
  correctAltitude: boolean
  correctGeometricError: boolean
  transmittance: boolean
  inscatter: boolean
  lightingMode: AtmosphereLightingMode
  sunLight: boolean
  skyLight: boolean
  sunLightIntensity: number
  skyLightIntensity: number
  night: AtmosphereNightRuntimeState
  sun: boolean
  moon: boolean
  ground: boolean
  albedoScale: number
  sunAngularRadius: number
  moonAngularRadius: number
  lunarRadianceScale: number
  shadowRadius: number
  shadowSampleCount: number
  starsVisible: boolean
  starsIntensity: number
  starsPointSize: number
  solarIrradianceScale: number
  rayleighScatteringScale: number
  mieScatteringScale: number
  mieExtinctionScale: number
  miePhaseFunctionG: number
  absorptionExtinctionScale: number
  groundAlbedo: number
}

export interface CloudRuntimeState {
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
