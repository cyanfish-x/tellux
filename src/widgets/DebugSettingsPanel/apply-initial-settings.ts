import type { Viewer } from '../../Viewer'
import type {
  ViewerAtmosphereOptions,
  ViewerAtmosphereStarsOptions,
  ViewerPostProcessOptions,
  ViewerPostProcessStageOptions
} from '../../types'
import type { DebugSettingsPanelOptions } from './types'

export function applyInitialDebugSettings(
  viewer: Viewer,
  settings: DebugSettingsPanelOptions
) {
  const atmosphere = settings.atmosphere
  if (atmosphere) applyAtmosphere(viewer, atmosphere)

  const clouds = settings.clouds
  if (clouds) {
    if (clouds.show !== undefined) viewer.scene.clouds.show = clouds.show
    if (clouds.coverage !== undefined) viewer.scene.clouds.coverage = clouds.coverage
    if (clouds.speed !== undefined) viewer.scene.clouds.speed = clouds.speed
    if (clouds.layer?.altitude !== undefined) {
      viewer.scene.clouds.layer.altitude = clouds.layer.altitude
    }
    if (clouds.layer?.height !== undefined) {
      viewer.scene.clouds.layer.height = clouds.layer.height
    }
  }

  const postProcess = settings.postProcess
  if (postProcess) {
    if (postProcess.toneMappingExposure !== undefined) {
      viewer.postProcess.toneMappingExposure = postProcess.toneMappingExposure
    }
    const lensFlare = stageEnabled(postProcess.lensFlare)
    if (lensFlare !== undefined) viewer.postProcess.lensFlare.enabled = lensFlare
    const smaa = stageEnabled(postProcess.smaa)
    if (smaa !== undefined) viewer.postProcess.smaa.enabled = smaa
    const taa = stageEnabled(postProcess.taa)
    if (taa !== undefined) viewer.postProcess.taa.enabled = taa
    const dithering = stageEnabled(postProcess.dithering)
    if (dithering !== undefined) viewer.postProcess.dithering.enabled = dithering
  }

  if (settings.renderer?.resolutionScale !== undefined) {
    viewer.renderer.resolutionScale = settings.renderer.resolutionScale
  }
}

export function stageEnabled(
  value: boolean | ViewerPostProcessStageOptions | ViewerPostProcessOptions['lensFlare'] | undefined
): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value
  return value.enabled
}

export function starsOptions(
  stars: boolean | ViewerAtmosphereStarsOptions | undefined
): ViewerAtmosphereStarsOptions | undefined {
  if (stars === undefined) return undefined
  return typeof stars === 'boolean' ? { show: stars } : stars
}

function applyAtmosphere(viewer: Viewer, atmosphere: ViewerAtmosphereOptions) {
  if (atmosphere.show !== undefined) viewer.scene.atmosphere.show = atmosphere.show

  const lighting = atmosphere.lighting
  if (lighting) {
    if (lighting.mode !== undefined) viewer.scene.atmosphere.lighting.mode = lighting.mode
    if (lighting.sunLight !== undefined) viewer.scene.atmosphere.lighting.sunLight = lighting.sunLight
    if (lighting.skyLight !== undefined) viewer.scene.atmosphere.lighting.skyLight = lighting.skyLight
    if (lighting.sunLightIntensity !== undefined) {
      viewer.scene.atmosphere.lighting.sunLightIntensity = lighting.sunLightIntensity
    }
    if (lighting.skyLightIntensity !== undefined) {
      viewer.scene.atmosphere.lighting.skyLightIntensity = lighting.skyLightIntensity
    }
    if (lighting.albedoScale !== undefined) {
      viewer.scene.atmosphere.lighting.albedoScale = lighting.albedoScale
    }
  }

  const scattering = atmosphere.scattering
  if (scattering) {
    if (scattering.intensity !== undefined) {
      viewer.scene.atmosphere.scattering.intensity = scattering.intensity
    }
    if (scattering.horizonBlend !== undefined) {
      viewer.scene.atmosphere.scattering.horizonBlend = scattering.horizonBlend
    }
    if (scattering.horizonRange !== undefined) {
      viewer.scene.atmosphere.scattering.horizonRange = scattering.horizonRange
    }
    if (scattering.correctAltitude !== undefined) {
      viewer.scene.atmosphere.scattering.correctAltitude = scattering.correctAltitude
    }
    if (scattering.correctGeometricError !== undefined) {
      viewer.scene.atmosphere.scattering.correctGeometricError = scattering.correctGeometricError
    }
    if (scattering.transmittance !== undefined) {
      viewer.scene.atmosphere.scattering.transmittance = scattering.transmittance
    }
    if (scattering.inscatter !== undefined) {
      viewer.scene.atmosphere.scattering.inscatter = scattering.inscatter
    }
    if (scattering.solarIrradianceScale !== undefined) {
      viewer.scene.atmosphere.scattering.solarIrradianceScale = scattering.solarIrradianceScale
    }
    if (scattering.rayleighScatteringScale !== undefined) {
      viewer.scene.atmosphere.scattering.rayleighScatteringScale = scattering.rayleighScatteringScale
    }
    if (scattering.mieScatteringScale !== undefined) {
      viewer.scene.atmosphere.scattering.mieScatteringScale = scattering.mieScatteringScale
    }
    if (scattering.mieExtinctionScale !== undefined) {
      viewer.scene.atmosphere.scattering.mieExtinctionScale = scattering.mieExtinctionScale
    }
    if (scattering.miePhaseFunctionG !== undefined) {
      viewer.scene.atmosphere.scattering.miePhaseFunctionG = scattering.miePhaseFunctionG
    }
    if (scattering.absorptionExtinctionScale !== undefined) {
      viewer.scene.atmosphere.scattering.absorptionExtinctionScale = scattering.absorptionExtinctionScale
    }
    if (scattering.groundAlbedo !== undefined) {
      viewer.scene.atmosphere.scattering.groundAlbedo = scattering.groundAlbedo
    }
  }

  const sky = atmosphere.sky
  if (sky) {
    const stars = starsOptions(sky.stars)
    if (stars?.show !== undefined) viewer.scene.atmosphere.sky.stars.show = stars.show
    if (stars?.intensity !== undefined) viewer.scene.atmosphere.sky.stars.intensity = stars.intensity
    if (stars?.pointSize !== undefined) viewer.scene.atmosphere.sky.stars.pointSize = stars.pointSize
    if (sky.sun !== undefined) viewer.scene.atmosphere.sky.sun = sky.sun
    if (sky.moon !== undefined) viewer.scene.atmosphere.sky.moon = sky.moon
    if (sky.ground !== undefined) viewer.scene.atmosphere.sky.ground = sky.ground
    if (sky.sunAngularRadius !== undefined) {
      viewer.scene.atmosphere.sky.sunAngularRadius = sky.sunAngularRadius
    }
    if (sky.moonAngularRadius !== undefined) {
      viewer.scene.atmosphere.sky.moonAngularRadius = sky.moonAngularRadius
    }
    if (sky.lunarRadianceScale !== undefined) {
      viewer.scene.atmosphere.sky.lunarRadianceScale = sky.lunarRadianceScale
    }
  }

  if (atmosphere.shadow?.radius !== undefined) {
    viewer.scene.atmosphere.shadow.radius = atmosphere.shadow.radius
  }
  if (atmosphere.shadow?.sampleCount !== undefined) {
    viewer.scene.atmosphere.shadow.sampleCount = atmosphere.shadow.sampleCount
  }

  const fallback = atmosphere.fallbackAmbientLight
  if (fallback?.enabled !== undefined) {
    viewer.scene.atmosphere.fallbackAmbientLight.enabled = fallback.enabled
  }
  if (fallback?.intensity !== undefined) {
    viewer.scene.atmosphere.fallbackAmbientLight.intensity = fallback.intensity
  }
}
