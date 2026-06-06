import type { AtmosphereLightingMode } from "../../src"

export interface ExampleSettingsPanelOptions {
  skyAtmosphere?: boolean
  clockAnimate?: boolean
  clockMultiplier?: number
  hourUTC?: number
  dayOfYear?: number
  clouds?: boolean
  cloudCoverage?: number
  cloudLayerAltitude?: number
  cloudLayerHeight?: number
  atmosphereInscatterIntensity?: number
  atmosphereInscatterHorizonBlend?: boolean
  atmosphereInscatterHorizonRange?: [number, number]
  atmosphereCorrectAltitude?: boolean
  atmosphereCorrectGeometricError?: boolean
  atmosphereTransmittance?: boolean
  atmosphereInscatter?: boolean
  atmosphereLightingMode?: AtmosphereLightingMode
  atmosphereSunLight?: boolean
  atmosphereSkyLight?: boolean
  atmosphereSunLightIntensity?: number
  atmosphereSkyLightIntensity?: number
  fallbackAmbientLight?: boolean
  fallbackAmbientLightIntensity?: number
  atmosphereSun?: boolean
  atmosphereMoon?: boolean
  atmosphereGround?: boolean
  atmosphereAlbedoScale?: number
  atmosphereSunAngularRadius?: number
  atmosphereMoonAngularRadius?: number
  atmosphereLunarRadianceScale?: number
  atmosphereShadowRadius?: number
  atmosphereShadowSampleCount?: number
  atmosphereSolarIrradianceScale?: number
  atmosphereRayleighScatteringScale?: number
  atmosphereMieScatteringScale?: number
  atmosphereMieExtinctionScale?: number
  atmosphereMiePhaseFunctionG?: number
  atmosphereAbsorptionExtinctionScale?: number
  atmosphereGroundAlbedo?: number
  toneMappingExposure?: number
  resolutionScale?: number
  lensFlare?: boolean
  smaa?: boolean
  dithering?: boolean
  showFps?: boolean
}
