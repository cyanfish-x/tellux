import type { Viewer } from "../../src"
import type { ExampleSettingsPanelOptions } from "./types"
import {
  createUTCDateFromControls,
  getUTCDayOfYear,
  getUTCHour,
} from "./time"

export function applyInitialSettings(
  viewer: Viewer,
  settings: ExampleSettingsPanelOptions
) {
  if (settings.skyAtmosphere !== undefined) {
    viewer.scene.skyAtmosphere.show = settings.skyAtmosphere
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
    viewer.scene.cloudCoverage = settings.cloudCoverage
  }

  if (settings.cloudLayerAltitude !== undefined) {
    viewer.scene.cloudLayerAltitude = settings.cloudLayerAltitude
  }

  if (settings.cloudLayerHeight !== undefined) {
    viewer.scene.cloudLayerHeight = settings.cloudLayerHeight
  }

  if (settings.atmosphereInscatterIntensity !== undefined) {
    viewer.scene.atmosphereInscatterIntensity =
      settings.atmosphereInscatterIntensity
  }

  if (settings.atmosphereInscatterHorizonBlend !== undefined) {
    viewer.scene.atmosphereInscatterHorizonBlend =
      settings.atmosphereInscatterHorizonBlend
  }

  if (settings.atmosphereInscatterHorizonRange !== undefined) {
    viewer.scene.atmosphereInscatterHorizonRange =
      settings.atmosphereInscatterHorizonRange
  }

  if (settings.atmosphereCorrectAltitude !== undefined) {
    viewer.scene.atmosphereCorrectAltitude = settings.atmosphereCorrectAltitude
  }

  if (settings.atmosphereCorrectGeometricError !== undefined) {
    viewer.scene.atmosphereCorrectGeometricError =
      settings.atmosphereCorrectGeometricError
  }

  if (settings.atmosphereTransmittance !== undefined) {
    viewer.scene.atmosphereTransmittance = settings.atmosphereTransmittance
  }

  if (settings.atmosphereInscatter !== undefined) {
    viewer.scene.atmosphereInscatter = settings.atmosphereInscatter
  }

  if (settings.atmosphereLightingMode !== undefined) {
    viewer.scene.atmosphereLightingMode = settings.atmosphereLightingMode
  }

  if (settings.atmosphereSunLight !== undefined) {
    viewer.scene.atmosphereSunLight = settings.atmosphereSunLight
  }

  if (settings.atmosphereSkyLight !== undefined) {
    viewer.scene.atmosphereSkyLight = settings.atmosphereSkyLight
  }

  if (settings.atmosphereSunLightIntensity !== undefined) {
    viewer.scene.atmosphereSunLightIntensity =
      settings.atmosphereSunLightIntensity
  }

  if (settings.atmosphereSkyLightIntensity !== undefined) {
    viewer.scene.atmosphereSkyLightIntensity =
      settings.atmosphereSkyLightIntensity
  }

  if (settings.fallbackAmbientLight !== undefined) {
    viewer.scene.fallbackAmbientLight = settings.fallbackAmbientLight
  }

  if (settings.fallbackAmbientLightIntensity !== undefined) {
    viewer.scene.fallbackAmbientLightIntensity =
      settings.fallbackAmbientLightIntensity
  }

  if (settings.atmosphereSun !== undefined) {
    viewer.scene.atmosphereSun = settings.atmosphereSun
  }

  if (settings.atmosphereMoon !== undefined) {
    viewer.scene.atmosphereMoon = settings.atmosphereMoon
  }

  if (settings.atmosphereGround !== undefined) {
    viewer.scene.atmosphereGround = settings.atmosphereGround
  }

  if (settings.atmosphereAlbedoScale !== undefined) {
    viewer.scene.atmosphereAlbedoScale = settings.atmosphereAlbedoScale
  }

  if (settings.atmosphereSunAngularRadius !== undefined) {
    viewer.scene.atmosphereSunAngularRadius =
      settings.atmosphereSunAngularRadius
  }

  if (settings.atmosphereMoonAngularRadius !== undefined) {
    viewer.scene.atmosphereMoonAngularRadius =
      settings.atmosphereMoonAngularRadius
  }

  if (settings.atmosphereLunarRadianceScale !== undefined) {
    viewer.scene.atmosphereLunarRadianceScale =
      settings.atmosphereLunarRadianceScale
  }

  if (settings.atmosphereShadowRadius !== undefined) {
    viewer.scene.atmosphereShadowRadius = settings.atmosphereShadowRadius
  }

  if (settings.atmosphereShadowSampleCount !== undefined) {
    viewer.scene.atmosphereShadowSampleCount =
      settings.atmosphereShadowSampleCount
  }

  if (settings.atmosphereSolarIrradianceScale !== undefined) {
    viewer.scene.atmosphereSolarIrradianceScale =
      settings.atmosphereSolarIrradianceScale
  }

  if (settings.atmosphereRayleighScatteringScale !== undefined) {
    viewer.scene.atmosphereRayleighScatteringScale =
      settings.atmosphereRayleighScatteringScale
  }

  if (settings.atmosphereMieScatteringScale !== undefined) {
    viewer.scene.atmosphereMieScatteringScale =
      settings.atmosphereMieScatteringScale
  }

  if (settings.atmosphereMieExtinctionScale !== undefined) {
    viewer.scene.atmosphereMieExtinctionScale =
      settings.atmosphereMieExtinctionScale
  }

  if (settings.atmosphereMiePhaseFunctionG !== undefined) {
    viewer.scene.atmosphereMiePhaseFunctionG =
      settings.atmosphereMiePhaseFunctionG
  }

  if (settings.atmosphereAbsorptionExtinctionScale !== undefined) {
    viewer.scene.atmosphereAbsorptionExtinctionScale =
      settings.atmosphereAbsorptionExtinctionScale
  }

  if (settings.atmosphereGroundAlbedo !== undefined) {
    viewer.scene.atmosphereGroundAlbedo = settings.atmosphereGroundAlbedo
  }

  if (settings.toneMappingExposure !== undefined) {
    viewer.toneMappingExposure = settings.toneMappingExposure
  }

  if (settings.resolutionScale !== undefined) {
    viewer.resolutionScale = settings.resolutionScale
  }

  if (settings.lensFlare !== undefined) {
    viewer.scene.postProcessStages.lensFlare.enabled = settings.lensFlare
  }

  if (settings.smaa !== undefined) {
    viewer.scene.postProcessStages.smaa.enabled = settings.smaa
  }

  if (settings.dithering !== undefined) {
    viewer.scene.postProcessStages.dithering.enabled = settings.dithering
  }
}
