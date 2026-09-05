import { SpringControl } from '../../SpringControl'
import type { AtmosphereLightingMode } from '../../types'
import type { Viewer } from '../../Viewer'
import { buildDebugSettingsControls } from './controls-panel'
import { mountDebugFpsHud } from './fps'
import { saveStoredDebugSettings } from './storage'
import { installDebugSettingsPanelStyles } from './styles'
import type { DebugSettingsPanelOptions } from './types'

export interface DebugSettingsPanelHandle {
  update(deltaTime: number, time?: number): void
  dispose(): void
}

export function mountDebugSettingsPanel(
  viewer: Viewer,
  settings: DebugSettingsPanelOptions
) {
  installDebugSettingsPanelStyles()
  const shell = viewer.container.parentElement ?? viewer.container
  const existingPanel = shell.querySelector('.tellux-debug-settings')
  existingPanel?.remove()

  const panel = document.createElement('section')
  panel.className = 'tellux-debug-settings'
  panel.setAttribute('aria-label', '调试场景设置')

  const toggle = document.createElement('button')
  toggle.className = 'tellux-debug-settings__toggle'
  toggle.type = 'button'
  toggle.textContent = '设置'
  toggle.title = '打开调试设置'
  toggle.setAttribute('aria-expanded', 'false')

  const body = document.createElement('div')
  body.className = 'tellux-debug-settings__panel'
  body.hidden = true

  const title = document.createElement('h2')
  title.textContent = '场景设置'
  body.appendChild(title)

  const content = document.createElement('div')
  content.className = 'tellux-debug-settings__content'
  body.appendChild(content)

  const {
    skyToggle,
    starsToggle,
    transmittanceToggle,
    nativeInscatterToggle,
    lightingModeControl,
    inscatterHorizonToggle,
    sunLightToggle,
    skyLightToggle,
    sunLightIntensityControl,
    skyLightIntensityControl,
    fallbackAmbientLightToggle,
    fallbackAmbientLightIntensityControl,
    sunDiscToggle,
    moonToggle,
    correctAltitudeToggle,
    correctGeometricToggle,
    cloudToggle,
    lensFlareToggle,
    smaaToggle,
    taaToggle,
    ditheringToggle,
    fpsToggle,
    coverageControl,
    cloudSpeedControl,
    cloudAltitudeControl,
    cloudHeightControl,
    inscatterIntensityControl,
    horizonStartControl,
    horizonEndControl,
    albedoScaleControl,
    sunAngularRadiusControl,
    moonAngularRadiusControl,
    lunarRadianceScaleControl,
    shadowRadiusControl,
    shadowSampleCountControl,
    starsIntensityControl,
    starsPointSizeControl,
    solarIrradianceControl,
    rayleighControl,
    mieScatteringControl,
    mieExtinctionControl,
    miePhaseControl,
    absorptionControl,
    groundAlbedoControl,
    exposureControl,
    resolutionControl,
    status,
  } = buildDebugSettingsControls(content, viewer, settings)

  panel.append(toggle, body)
  shell.appendChild(panel)
  const fpsHud = mountDebugFpsHud(shell, fpsToggle.input.checked)
  const smooth = {
    starsIntensity: createSpringControl(starsIntensityControl.input),
    starsPointSize: createSpringControl(starsPointSizeControl.input),
    atmosphereInscatterIntensity: createSpringControl(
      inscatterIntensityControl.input
    ),
    horizonStart: createSpringControl(horizonStartControl.input),
    horizonEnd: createSpringControl(horizonEndControl.input),
    sunLightIntensity: createSpringControl(sunLightIntensityControl.input),
    skyLightIntensity: createSpringControl(skyLightIntensityControl.input),
    fallbackAmbientLightIntensity: createSpringControl(
      fallbackAmbientLightIntensityControl.input
    ),
    solarIrradianceScale: createSpringControl(solarIrradianceControl.input),
    rayleighScatteringScale: createSpringControl(rayleighControl.input),
    mieScatteringScale: createSpringControl(mieScatteringControl.input),
    mieExtinctionScale: createSpringControl(mieExtinctionControl.input),
    miePhaseFunctionG: createSpringControl(miePhaseControl.input),
    absorptionExtinctionScale: createSpringControl(absorptionControl.input),
    groundAlbedo: createSpringControl(groundAlbedoControl.input),
    albedoScale: createSpringControl(albedoScaleControl.input),
    sunAngularRadius: createSpringControl(sunAngularRadiusControl.input),
    moonAngularRadius: createSpringControl(moonAngularRadiusControl.input),
    lunarRadianceScale: createSpringControl(lunarRadianceScaleControl.input),
    shadowRadius: createSpringControl(shadowRadiusControl.input),
    cloudCoverage: createSpringControl(coverageControl.input),
    cloudSpeed: createSpringControl(cloudSpeedControl.input),
    cloudLayerAltitude: createSpringControl(cloudAltitudeControl.input),
    cloudLayerHeight: createSpringControl(cloudHeightControl.input),
    toneMappingExposure: createSpringControl(exposureControl.input),
  }

  function applySmoothedControls(deltaTime: number) {
    viewer.scene.atmosphere.sky.stars.intensity = smooth.starsIntensity.tick(deltaTime)
    viewer.scene.atmosphere.sky.stars.pointSize = smooth.starsPointSize.tick(deltaTime)
    viewer.scene.atmosphere.scattering.intensity =
      smooth.atmosphereInscatterIntensity.tick(deltaTime)
    viewer.scene.atmosphere.scattering.horizonRange = [
      smooth.horizonStart.tick(deltaTime),
      smooth.horizonEnd.tick(deltaTime),
    ]
    viewer.scene.atmosphere.lighting.sunLightIntensity =
      smooth.sunLightIntensity.tick(deltaTime)
    viewer.scene.atmosphere.lighting.skyLightIntensity =
      smooth.skyLightIntensity.tick(deltaTime)
    viewer.scene.atmosphere.fallbackAmbientLight.intensity =
      smooth.fallbackAmbientLightIntensity.tick(deltaTime)
    viewer.scene.atmosphere.scattering.solarIrradianceScale =
      smooth.solarIrradianceScale.tick(deltaTime)
    viewer.scene.atmosphere.scattering.rayleighScatteringScale =
      smooth.rayleighScatteringScale.tick(deltaTime)
    viewer.scene.atmosphere.scattering.mieScatteringScale =
      smooth.mieScatteringScale.tick(deltaTime)
    viewer.scene.atmosphere.scattering.mieExtinctionScale =
      smooth.mieExtinctionScale.tick(deltaTime)
    viewer.scene.atmosphere.scattering.miePhaseFunctionG =
      smooth.miePhaseFunctionG.tick(deltaTime)
    viewer.scene.atmosphere.scattering.absorptionExtinctionScale =
      smooth.absorptionExtinctionScale.tick(deltaTime)
    viewer.scene.atmosphere.scattering.groundAlbedo = smooth.groundAlbedo.tick(deltaTime)
    viewer.scene.atmosphere.lighting.albedoScale = smooth.albedoScale.tick(deltaTime)
    viewer.scene.atmosphere.sky.sunAngularRadius =
      smooth.sunAngularRadius.tick(deltaTime)
    viewer.scene.atmosphere.sky.moonAngularRadius =
      smooth.moonAngularRadius.tick(deltaTime)
    viewer.scene.atmosphere.sky.lunarRadianceScale =
      smooth.lunarRadianceScale.tick(deltaTime)
    viewer.scene.atmosphere.shadow.radius = smooth.shadowRadius.tick(deltaTime)
    viewer.scene.clouds.coverage = smooth.cloudCoverage.tick(deltaTime)
    viewer.scene.clouds.speed = smooth.cloudSpeed.tick(deltaTime)
    viewer.scene.clouds.layer.altitude = smooth.cloudLayerAltitude.tick(deltaTime)
    viewer.scene.clouds.layer.height = smooth.cloudLayerHeight.tick(deltaTime)
    viewer.postProcess.toneMappingExposure = smooth.toneMappingExposure.tick(deltaTime)
  }

  function updateStatus() {
    status.textContent =
      `云量 ${viewer.scene.clouds.coverage.toFixed(2)} / ` +
      `散射 ${viewer.scene.atmosphere.scattering.intensity.toFixed(2)} / ` +
      `曝光 ${viewer.postProcess.toneMappingExposure.toFixed(1)}`
  }

  function applyControls() {
    viewer.scene.atmosphere.show = skyToggle.input.checked
    viewer.scene.atmosphere.sky.stars.show = starsToggle.input.checked
    smooth.starsIntensity.target = Number(starsIntensityControl.input.value)
    smooth.starsPointSize.target = Number(starsPointSizeControl.input.value)
    viewer.scene.atmosphere.scattering.transmittance = transmittanceToggle.input.checked
    viewer.scene.atmosphere.scattering.inscatter = nativeInscatterToggle.input.checked
    smooth.atmosphereInscatterIntensity.target = Number(
      inscatterIntensityControl.input.value
    )
    viewer.scene.atmosphere.scattering.horizonBlend =
      inscatterHorizonToggle.input.checked
    smooth.horizonStart.target = Number(horizonStartControl.input.value)
    smooth.horizonEnd.target = Number(horizonEndControl.input.value)
    viewer.scene.atmosphere.lighting.mode =
      lightingModeControl.input.value as AtmosphereLightingMode
    viewer.scene.atmosphere.lighting.sunLight = sunLightToggle.input.checked
    viewer.scene.atmosphere.lighting.skyLight = skyLightToggle.input.checked
    smooth.sunLightIntensity.target = Number(
      sunLightIntensityControl.input.value
    )
    smooth.skyLightIntensity.target = Number(
      skyLightIntensityControl.input.value
    )
    viewer.scene.atmosphere.fallbackAmbientLight.enabled =
      fallbackAmbientLightToggle.input.checked
    smooth.fallbackAmbientLightIntensity.target = Number(
      fallbackAmbientLightIntensityControl.input.value
    )
    viewer.scene.atmosphere.sky.sun = sunDiscToggle.input.checked
    viewer.scene.atmosphere.sky.moon = moonToggle.input.checked
    viewer.scene.atmosphere.scattering.correctAltitude = correctAltitudeToggle.input.checked
    viewer.scene.atmosphere.scattering.correctGeometricError =
      correctGeometricToggle.input.checked
    smooth.solarIrradianceScale.target = Number(
      solarIrradianceControl.input.value
    )
    smooth.rayleighScatteringScale.target = Number(
      rayleighControl.input.value
    )
    smooth.mieScatteringScale.target = Number(
      mieScatteringControl.input.value
    )
    smooth.mieExtinctionScale.target = Number(
      mieExtinctionControl.input.value
    )
    smooth.miePhaseFunctionG.target = Number(
      miePhaseControl.input.value
    )
    smooth.absorptionExtinctionScale.target = Number(
      absorptionControl.input.value
    )
    smooth.groundAlbedo.target = Number(
      groundAlbedoControl.input.value
    )
    smooth.albedoScale.target = Number(albedoScaleControl.input.value)
    smooth.sunAngularRadius.target = Number(
      sunAngularRadiusControl.input.value
    )
    smooth.moonAngularRadius.target = Number(
      moonAngularRadiusControl.input.value
    )
    smooth.lunarRadianceScale.target = Number(
      lunarRadianceScaleControl.input.value
    )
    smooth.shadowRadius.target = Number(
      shadowRadiusControl.input.value
    )
    viewer.scene.atmosphere.shadow.sampleCount = Number(
      shadowSampleCountControl.input.value
    )
    viewer.scene.clouds.show = cloudToggle.input.checked
    smooth.cloudCoverage.target = Number(coverageControl.input.value)
    smooth.cloudSpeed.target = Number(cloudSpeedControl.input.value)
    smooth.cloudLayerAltitude.target = Number(cloudAltitudeControl.input.value)
    smooth.cloudLayerHeight.target = Number(cloudHeightControl.input.value)
    smooth.toneMappingExposure.target = Number(exposureControl.input.value)
    viewer.renderer.resolutionScale = Number(resolutionControl.input.value)
    viewer.postProcess.lensFlare.enabled =
      lensFlareToggle.input.checked
    viewer.postProcess.smaa.enabled = smaaToggle.input.checked
    viewer.postProcess.taa.enabled = taaToggle.input.checked
    viewer.postProcess.dithering.enabled =
      ditheringToggle.input.checked
    fpsHud.setVisible(fpsToggle.input.checked)
    saveStoredDebugSettings({
      atmosphere: {
        show: skyToggle.input.checked,
        lighting: {
          mode: lightingModeControl.input.value as AtmosphereLightingMode,
          sunLight: sunLightToggle.input.checked,
          skyLight: skyLightToggle.input.checked,
          sunLightIntensity: Number(sunLightIntensityControl.input.value),
          skyLightIntensity: Number(skyLightIntensityControl.input.value),
          albedoScale: Number(albedoScaleControl.input.value)
        },
        scattering: {
          intensity: Number(inscatterIntensityControl.input.value),
          horizonBlend: inscatterHorizonToggle.input.checked,
          horizonRange: [
            Number(horizonStartControl.input.value),
            Number(horizonEndControl.input.value)
          ],
          correctAltitude: correctAltitudeToggle.input.checked,
          correctGeometricError: correctGeometricToggle.input.checked,
          transmittance: transmittanceToggle.input.checked,
          inscatter: nativeInscatterToggle.input.checked,
          solarIrradianceScale: Number(solarIrradianceControl.input.value),
          rayleighScatteringScale: Number(rayleighControl.input.value),
          mieScatteringScale: Number(mieScatteringControl.input.value),
          mieExtinctionScale: Number(mieExtinctionControl.input.value),
          miePhaseFunctionG: Number(miePhaseControl.input.value),
          absorptionExtinctionScale: Number(absorptionControl.input.value),
          groundAlbedo: Number(groundAlbedoControl.input.value)
        },
        sky: {
          stars: {
            show: starsToggle.input.checked,
            intensity: Number(starsIntensityControl.input.value),
            pointSize: Number(starsPointSizeControl.input.value)
          },
          sun: sunDiscToggle.input.checked,
          moon: moonToggle.input.checked,
          sunAngularRadius: Number(sunAngularRadiusControl.input.value),
          moonAngularRadius: Number(moonAngularRadiusControl.input.value),
          lunarRadianceScale: Number(lunarRadianceScaleControl.input.value)
        },
        shadow: {
          radius: Number(shadowRadiusControl.input.value),
          sampleCount: Number(shadowSampleCountControl.input.value)
        },
        fallbackAmbientLight: {
          enabled: fallbackAmbientLightToggle.input.checked,
          intensity: Number(fallbackAmbientLightIntensityControl.input.value)
        }
      },
      clouds: {
        show: cloudToggle.input.checked,
        coverage: Number(coverageControl.input.value),
        speed: Number(cloudSpeedControl.input.value),
        layer: {
          altitude: Number(cloudAltitudeControl.input.value),
          height: Number(cloudHeightControl.input.value)
        }
      },
      postProcess: {
        toneMappingExposure: Number(exposureControl.input.value),
        lensFlare: lensFlareToggle.input.checked,
        smaa: smaaToggle.input.checked,
        taa: taaToggle.input.checked,
        dithering: ditheringToggle.input.checked
      },
      renderer: {
        resolutionScale: Number(resolutionControl.input.value)
      },
      showFps: fpsToggle.input.checked
    })

    updateStatus()
  }

  toggle.addEventListener('click', () => {
    const isOpen = body.hidden
    body.hidden = !isOpen
    toggle.setAttribute('aria-expanded', String(isOpen))
  })

  content
    .querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')
    .forEach((input) => {
      const eventType = input.type === 'range' ? 'input' : 'change'
      input.addEventListener(eventType, applyControls)
    })

  applyControls()

  return {
    update(deltaTime: number, time = performance.now()) {
      applySmoothedControls(deltaTime)
      fpsHud.update(time)
      updateStatus()
    },
    dispose() {
      panel.remove()
      fpsHud.dispose()
    },
  }
}

function createSpringControl(input: HTMLInputElement) {
  return new SpringControl(Number(input.value))
}
