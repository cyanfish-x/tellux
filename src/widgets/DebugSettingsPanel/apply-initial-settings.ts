import type { Viewer } from "../../Viewer"
import type { DebugSettingsPanelOptions } from "./types"
import {
  createUTCDateFromControls,
  getUTCDayOfYear,
  getUTCHour,
} from "./time"

export function applyInitialDebugSettings(
  viewer: Viewer,
  settings: DebugSettingsPanelOptions
) {
  if (settings.skyAtmosphere !== undefined) {
    viewer.scene.atmosphere.show = settings.skyAtmosphere
  }

  if (settings.stars !== undefined) {
    viewer.scene.atmosphere.sky.stars.show = settings.stars
  }

  if (settings.starsIntensity !== undefined) {
    viewer.scene.atmosphere.sky.starsIntensity = settings.starsIntensity
  }

  if (settings.starsPointSize !== undefined) {
    viewer.scene.atmosphere.sky.starsPointSize = settings.starsPointSize
  }

  if (settings.clockAnimate !== undefined) {
    viewer.clock.animate = settings.clockAnimate
  }

  if (settings.clockMultiplier !== undefined) {
    viewer.clock.multiplier = settings.clockMultiplier
  }

  if (settings.dayOfYear !== undefined || settings.hourUTC !== undefined) {
    viewer.clock.currentTime = createUTCDateFromControls(
      viewer.clock.currentTime.getUTCFullYear(),
      settings.dayOfYear ?? getUTCDayOfYear(viewer.clock.currentTime),
      settings.hourUTC ?? getUTCHour(viewer.clock.currentTime)
    )
  }

  if (settings.clouds !== undefined) {
    viewer.scene.clouds.show = settings.clouds
  }

  if (settings.cloudCoverage !== undefined) {
    viewer.scene.clouds.coverage = settings.cloudCoverage
  }

  if (settings.cloudSpeed !== undefined) {
    viewer.scene.clouds.speed = settings.cloudSpeed
  }

  if (settings.cloudLayerAltitude !== undefined) {
    viewer.scene.clouds.layerAltitude = settings.cloudLayerAltitude
  }

  if (settings.cloudLayerHeight !== undefined) {
    viewer.scene.clouds.layerHeight = settings.cloudLayerHeight
  }

  if (settings.atmosphereInscatterIntensity !== undefined) {
    viewer.scene.atmosphere.scattering.intensity =
      settings.atmosphereInscatterIntensity
  }

  if (settings.atmosphereInscatterHorizonBlend !== undefined) {
    viewer.scene.atmosphere.scattering.horizonBlend =
      settings.atmosphereInscatterHorizonBlend
  }

  if (settings.atmosphereInscatterHorizonRange !== undefined) {
    viewer.scene.atmosphere.scattering.horizonRange =
      settings.atmosphereInscatterHorizonRange
  }

  if (settings.atmosphereCorrectAltitude !== undefined) {
    viewer.scene.atmosphere.scattering.correctAltitude = settings.atmosphereCorrectAltitude
  }

  if (settings.atmosphereCorrectGeometricError !== undefined) {
    viewer.scene.atmosphere.scattering.correctGeometricError =
      settings.atmosphereCorrectGeometricError
  }

  if (settings.atmosphereTransmittance !== undefined) {
    viewer.scene.atmosphere.scattering.transmittance = settings.atmosphereTransmittance
  }

  if (settings.atmosphereInscatter !== undefined) {
    viewer.scene.atmosphere.scattering.inscatter = settings.atmosphereInscatter
  }

  if (settings.atmosphereLightingMode !== undefined) {
    viewer.scene.atmosphere.lighting.mode = settings.atmosphereLightingMode
  }

  if (settings.atmosphereSunLight !== undefined) {
    viewer.scene.atmosphere.lighting.sunLight = settings.atmosphereSunLight
  }

  if (settings.atmosphereSkyLight !== undefined) {
    viewer.scene.atmosphere.lighting.skyLight = settings.atmosphereSkyLight
  }

  if (settings.atmosphereSunLightIntensity !== undefined) {
    viewer.scene.atmosphere.lighting.sunLightIntensity =
      settings.atmosphereSunLightIntensity
  }

  if (settings.atmosphereSkyLightIntensity !== undefined) {
    viewer.scene.atmosphere.lighting.skyLightIntensity =
      settings.atmosphereSkyLightIntensity
  }

  if (settings.fallbackAmbientLight !== undefined) {
    viewer.scene.atmosphere.fallbackAmbientLight.show = settings.fallbackAmbientLight
  }

  if (settings.fallbackAmbientLightIntensity !== undefined) {
    viewer.scene.atmosphere.fallbackAmbientLight.intensity =
      settings.fallbackAmbientLightIntensity
  }

  if (settings.atmosphereSun !== undefined) {
    viewer.scene.atmosphere.sky.sun = settings.atmosphereSun
  }

  if (settings.atmosphereMoon !== undefined) {
    viewer.scene.atmosphere.sky.moon = settings.atmosphereMoon
  }

  if (settings.atmosphereGround !== undefined) {
    viewer.scene.atmosphere.sky.ground = settings.atmosphereGround
  }

  if (settings.atmosphereAlbedoScale !== undefined) {
    viewer.scene.atmosphere.lighting.albedoScale = settings.atmosphereAlbedoScale
  }

  if (settings.atmosphereSunAngularRadius !== undefined) {
    viewer.scene.atmosphere.sky.sunAngularRadius =
      settings.atmosphereSunAngularRadius
  }

  if (settings.atmosphereMoonAngularRadius !== undefined) {
    viewer.scene.atmosphere.sky.moonAngularRadius =
      settings.atmosphereMoonAngularRadius
  }

  if (settings.atmosphereLunarRadianceScale !== undefined) {
    viewer.scene.atmosphere.sky.lunarRadianceScale =
      settings.atmosphereLunarRadianceScale
  }

  if (settings.atmosphereShadowRadius !== undefined) {
    viewer.scene.atmosphere.shadow.radius = settings.atmosphereShadowRadius
  }

  if (settings.atmosphereShadowSampleCount !== undefined) {
    viewer.scene.atmosphere.shadow.sampleCount =
      settings.atmosphereShadowSampleCount
  }

  if (settings.atmosphereSolarIrradianceScale !== undefined) {
    viewer.scene.atmosphere.scattering.solarIrradianceScale =
      settings.atmosphereSolarIrradianceScale
  }

  if (settings.atmosphereRayleighScatteringScale !== undefined) {
    viewer.scene.atmosphere.scattering.rayleighScatteringScale =
      settings.atmosphereRayleighScatteringScale
  }

  if (settings.atmosphereMieScatteringScale !== undefined) {
    viewer.scene.atmosphere.scattering.mieScatteringScale =
      settings.atmosphereMieScatteringScale
  }

  if (settings.atmosphereMieExtinctionScale !== undefined) {
    viewer.scene.atmosphere.scattering.mieExtinctionScale =
      settings.atmosphereMieExtinctionScale
  }

  if (settings.atmosphereMiePhaseFunctionG !== undefined) {
    viewer.scene.atmosphere.scattering.miePhaseFunctionG =
      settings.atmosphereMiePhaseFunctionG
  }

  if (settings.atmosphereAbsorptionExtinctionScale !== undefined) {
    viewer.scene.atmosphere.scattering.absorptionExtinctionScale =
      settings.atmosphereAbsorptionExtinctionScale
  }

  if (settings.atmosphereGroundAlbedo !== undefined) {
    viewer.scene.atmosphere.scattering.groundAlbedo = settings.atmosphereGroundAlbedo
  }

  if (settings.toneMappingExposure !== undefined) {
    viewer.toneMappingExposure = settings.toneMappingExposure
  }

  if (settings.resolutionScale !== undefined) {
    viewer.resolutionScale = settings.resolutionScale
  }

  if (settings.lensFlare !== undefined) {
    viewer.scene.postProcess.lensFlare.enabled = settings.lensFlare
  }

  if (settings.smaa !== undefined) {
    viewer.scene.postProcess.smaa.enabled = settings.smaa
  }

  if (settings.dithering !== undefined) {
    viewer.scene.postProcess.dithering.enabled = settings.dithering
  }
}
