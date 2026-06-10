import { SpringControl } from "../../SpringControl"
import type { AtmosphereLightingMode } from "../../types"
import type { Viewer } from "../../Viewer"
import {
  createGroup,
  createRangeControl,
  createSelectControl,
  createSwitchControl,
} from "./controls"
import { mountDebugFpsHud } from "./fps"
import { saveStoredDebugSettings } from "./storage"
import { installDebugSettingsPanelStyles } from "./styles"
import {
  createUTCDateFromControls,
  formatHour,
  formatRadians,
  formatUTCMonthDay,
  getDaysInUTCYear,
  getUTCDayOfYear,
  getUTCHour,
} from "./time"
import type { DebugSettingsPanelOptions } from "./types"

const MAX_CLOCK_MULTIPLIER = 86400
const CLOCK_MULTIPLIER_SLIDER_MAX = Math.log2(MAX_CLOCK_MULTIPLIER + 1)

interface DebugSettingsPanelHandle {
  update(deltaTime: number, time?: number): void
  dispose(): void
}

/**
 * Viewer 调试设置面板控件。
 *
 * Debug settings panel widget for a Viewer.
 */
export class DebugSettingsPanel {
  private readonly handle: DebugSettingsPanelHandle

  constructor(viewer: Viewer, settings: DebugSettingsPanelOptions = {}) {
    this.handle = mountDebugSettingsPanel(viewer, settings)
  }

  update(deltaTime: number, time = performance.now()) {
    this.handle.update(deltaTime, time)
  }

  dispose() {
    this.handle.dispose()
  }
}

function mountDebugSettingsPanel(
  viewer: Viewer,
  settings: DebugSettingsPanelOptions
) {
  installDebugSettingsPanelStyles()
  const shell = viewer.container.parentElement ?? viewer.container
  const existingPanel = shell.querySelector(".tellux-debug-settings")
  existingPanel?.remove()

  const panel = document.createElement("section")
  panel.className = "tellux-debug-settings"
  panel.setAttribute("aria-label", "调试场景设置")

  const toggle = document.createElement("button")
  toggle.className = "tellux-debug-settings__toggle"
  toggle.type = "button"
  toggle.textContent = "设置"
  toggle.title = "打开调试设置"
  toggle.setAttribute("aria-expanded", "false")

  const body = document.createElement("div")
  body.className = "tellux-debug-settings__panel"
  body.hidden = true

  const title = document.createElement("h2")
  title.textContent = "场景设置"
  body.appendChild(title)

  const content = document.createElement("div")
  content.className = "tellux-debug-settings__content"
  body.appendChild(content)

  const skyToggle = createSwitchControl(
    "sky-atmosphere",
    "大气",
    settings.skyAtmosphere ?? viewer.scene.atmosphere.show
  )
  const starsToggle = createSwitchControl(
    "stars",
    "星空",
    settings.stars ?? viewer.scene.atmosphere.sky.stars.show
  )
  const transmittanceToggle = createSwitchControl(
    "atmosphere-transmittance",
    "透射衰减",
    settings.atmosphereTransmittance ?? viewer.scene.atmosphere.scattering.transmittance
  )
  const nativeInscatterToggle = createSwitchControl(
    "atmosphere-inscatter",
    "原生散射",
    settings.atmosphereInscatter ?? viewer.scene.atmosphere.scattering.inscatter
  )
  const lightingModeControl = createSelectControl({
    id: "atmosphere-lighting-mode",
    label: "光照模式",
    value:
      settings.atmosphereLightingMode ?? viewer.scene.atmosphere.lighting.mode,
    options: ["post-process", "light-source"] as const,
  })
  const inscatterHorizonToggle = createSwitchControl(
    "atmosphere-inscatter-horizon",
    "地平线散射",
    viewer.scene.atmosphere.scattering.horizonBlend
  )
  const sunLightToggle = createSwitchControl(
    "atmosphere-sun-light",
    "太阳光照",
    settings.atmosphereSunLight ?? viewer.scene.atmosphere.lighting.sunLight
  )
  const skyLightToggle = createSwitchControl(
    "atmosphere-sky-light",
    "天空光照",
    settings.atmosphereSkyLight ?? viewer.scene.atmosphere.lighting.skyLight
  )
  const sunLightIntensityControl = createRangeControl({
    id: "atmosphere-sun-light-intensity",
    label: "太阳光强",
    min: 0,
    max: 8,
    step: 0.05,
    value:
      settings.atmosphereSunLightIntensity ??
      viewer.scene.atmosphere.lighting.sunLightIntensity,
    format: (value) => value.toFixed(2),
  })
  const skyLightIntensityControl = createRangeControl({
    id: "atmosphere-sky-light-intensity",
    label: "天空光强",
    min: 0,
    max: 8,
    step: 0.05,
    value:
      settings.atmosphereSkyLightIntensity ??
      viewer.scene.atmosphere.lighting.skyLightIntensity,
    format: (value) => value.toFixed(2),
  })
  const fallbackAmbientLightToggle = createSwitchControl(
    "fallback-ambient-light",
    "环境光",
    settings.fallbackAmbientLight ?? viewer.scene.atmosphere.fallbackAmbientLight.show
  )
  const fallbackAmbientLightIntensityControl = createRangeControl({
    id: "fallback-ambient-light-intensity",
    label: "环境光强度",
    min: 0,
    max: 4,
    step: 0.01,
    value:
      settings.fallbackAmbientLightIntensity ??
      viewer.scene.atmosphere.fallbackAmbientLight.intensity,
    format: (value) => value.toFixed(2),
  })
  const sunDiscToggle = createSwitchControl(
    "atmosphere-sun-disc",
    "太阳盘",
    settings.atmosphereSun ?? viewer.scene.atmosphere.sky.sun
  )
  const moonToggle = createSwitchControl(
    "atmosphere-moon",
    "月亮",
    settings.atmosphereMoon ?? viewer.scene.atmosphere.sky.moon
  )
  const correctAltitudeToggle = createSwitchControl(
    "atmosphere-correct-altitude",
    "高度修正",
    settings.atmosphereCorrectAltitude ?? viewer.scene.atmosphere.scattering.correctAltitude
  )
  const correctGeometricToggle = createSwitchControl(
    "atmosphere-correct-geometric",
    "瓦片法线修正",
    settings.atmosphereCorrectGeometricError ??
      viewer.scene.atmosphere.scattering.correctGeometricError
  )
  const cloudToggle = createSwitchControl(
    "clouds",
    "体积云",
    settings.clouds ?? viewer.scene.clouds.show
  )
  const lensFlareToggle = createSwitchControl(
    "lens-flare",
    "镜头光晕",
    settings.lensFlare ?? viewer.scene.postProcess.lensFlare.enabled
  )
  const smaaToggle = createSwitchControl(
    "smaa",
    "SMAA",
    settings.smaa ?? viewer.scene.postProcess.smaa.enabled
  )
  const ditheringToggle = createSwitchControl(
    "dithering",
    "抖动",
    settings.dithering ?? viewer.scene.postProcess.dithering.enabled
  )
  const fpsToggle = createSwitchControl(
    "fps",
    "显示帧率",
    settings.showFps ?? true
  )
  const clockAnimateToggle = createSwitchControl(
    "clock-animate",
    "时间流动",
    settings.clockAnimate ?? viewer.clock.animate
  )
  const clockMultiplierControl = createRangeControl({
    id: "clock-multiplier",
    label: "时间倍率",
    min: 0,
    max: CLOCK_MULTIPLIER_SLIDER_MAX,
    step: 0.01,
    value: clockMultiplierToSliderValue(
      settings.clockMultiplier ?? viewer.clock.multiplier
    ),
    format: (value) => `${sliderValueToClockMultiplier(value).toFixed(0)}x`,
  })

  const initialClockTime = viewer.clock.currentTime
  const initialYearUTC = initialClockTime.getUTCFullYear()
  const initialDayOfYear =
    settings.dayOfYear ?? getUTCDayOfYear(initialClockTime)
  const initialHourUTC = settings.hourUTC ?? getUTCHour(initialClockTime)
  const dayOfYearControl = createRangeControl({
    id: "day-of-year",
    label: "年内日",
    min: 1,
    max: getDaysInUTCYear(initialYearUTC),
    step: 1,
    value: initialDayOfYear,
    format: (value) => formatUTCMonthDay(initialYearUTC, value),
  })
  const utcControl = createRangeControl({
    id: "utc-time",
    label: "UTC 时间",
    min: 0,
    max: 24,
    step: 0.05,
    value: initialHourUTC,
    format: formatHour,
  })

  content.appendChild(
    createGroup("日期和时间", [
      clockAnimateToggle.element,
      clockMultiplierControl.element,
      dayOfYearControl.element,
      utcControl.element,
    ])
  )

  const coverageControl = createRangeControl({
    id: "cloud-coverage",
    label: "云覆盖率",
    min: 0,
    max: 1,
    step: 0.01,
    value: settings.cloudCoverage ?? viewer.scene.clouds.coverage,
    format: (value) => value.toFixed(2),
  })
  const cloudSpeedControl = createRangeControl({
    id: "cloud-speed",
    label: "云速",
    min: 0,
    max: 0.05,
    step: 0.0001,
    value: settings.cloudSpeed ?? viewer.scene.clouds.speed,
    format: (value) => value.toFixed(4),
  })
  const cloudAltitudeControl = createRangeControl({
    id: "cloud-altitude",
    label: "低云云底",
    min: 200,
    max: 4000,
    step: 50,
    value: settings.cloudLayerAltitude ?? viewer.scene.clouds.layerAltitude,
    format: (value) => `${Math.round(value)}m`,
  })
  const cloudHeightControl = createRangeControl({
    id: "cloud-height",
    label: "低云厚度",
    min: 100,
    max: 3000,
    step: 50,
    value: settings.cloudLayerHeight ?? viewer.scene.clouds.layerHeight,
    format: (value) => `${Math.round(value)}m`,
  })
  const inscatterIntensityControl = createRangeControl({
    id: "atmosphere-inscatter-intensity",
    label: "空气散射",
    min: 0,
    max: 1,
    step: 0.01,
    value:
      settings.atmosphereInscatterIntensity ??
      viewer.scene.atmosphere.scattering.intensity,
    format: (value) => value.toFixed(2),
  })
  const horizonRange =
    settings.atmosphereInscatterHorizonRange ??
    viewer.scene.atmosphere.scattering.horizonRange
  const horizonStartControl = createRangeControl({
    id: "atmosphere-horizon-start",
    label: "边缘保留",
    min: 0,
    max: 1,
    step: 0.01,
    value: horizonRange[0],
    format: (value) => value.toFixed(2),
  })
  const horizonEndControl = createRangeControl({
    id: "atmosphere-horizon-end",
    label: "中心衰减",
    min: 0,
    max: 1,
    step: 0.01,
    value: horizonRange[1],
    format: (value) => value.toFixed(2),
  })
  const albedoScaleControl = createRangeControl({
    id: "atmosphere-albedo-scale",
    label: "反照率缩放",
    min: 0,
    max: 4,
    step: 0.01,
    value: settings.atmosphereAlbedoScale ?? viewer.scene.atmosphere.lighting.albedoScale,
    format: (value) => value.toFixed(2),
  })
  const sunAngularRadiusControl = createRangeControl({
    id: "atmosphere-sun-angular-radius",
    label: "太阳角半径",
    min: 0,
    max: 0.1,
    step: 0.0005,
    value:
      settings.atmosphereSunAngularRadius ??
      viewer.scene.atmosphere.sky.sunAngularRadius,
    format: formatRadians,
  })
  const moonAngularRadiusControl = createRangeControl({
    id: "atmosphere-moon-angular-radius",
    label: "月亮角半径",
    min: 0,
    max: 0.1,
    step: 0.0005,
    value:
      settings.atmosphereMoonAngularRadius ??
      viewer.scene.atmosphere.sky.moonAngularRadius,
    format: formatRadians,
  })
  const lunarRadianceScaleControl = createRangeControl({
    id: "atmosphere-lunar-radiance",
    label: "月光亮度",
    min: 0,
    max: 8,
    step: 0.05,
    value:
      settings.atmosphereLunarRadianceScale ??
      viewer.scene.atmosphere.sky.lunarRadianceScale,
    format: (value) => value.toFixed(2),
  })
  const shadowRadiusControl = createRangeControl({
    id: "atmosphere-shadow-radius",
    label: "云影柔化",
    min: 0,
    max: 16,
    step: 0.25,
    value:
      settings.atmosphereShadowRadius ?? viewer.scene.atmosphere.shadow.radius,
    format: (value) => value.toFixed(2),
  })
  const shadowSampleCountControl = createRangeControl({
    id: "atmosphere-shadow-samples",
    label: "云影采样",
    min: 1,
    max: 16,
    step: 1,
    value:
      settings.atmosphereShadowSampleCount ??
      viewer.scene.atmosphere.shadow.sampleCount,
    format: (value) => String(Math.round(value)),
  })
  const starsIntensityControl = createRangeControl({
    id: "stars-intensity",
    label: "星空亮度",
    min: 0,
    max: 8,
    step: 0.05,
    value: settings.starsIntensity ?? viewer.scene.atmosphere.sky.starsIntensity,
    format: (value) => value.toFixed(2),
  })
  const starsPointSizeControl = createRangeControl({
    id: "stars-point-size",
    label: "星点大小",
    min: 0.1,
    max: 4,
    step: 0.05,
    value: settings.starsPointSize ?? viewer.scene.atmosphere.sky.starsPointSize,
    format: (value) => value.toFixed(2),
  })
  const solarIrradianceControl = createRangeControl({
    id: "atmosphere-solar-irradiance",
    label: "太阳辐照",
    min: 0,
    max: 4,
    step: 0.01,
    value:
      settings.atmosphereSolarIrradianceScale ??
      viewer.scene.atmosphere.scattering.solarIrradianceScale,
    format: (value) => value.toFixed(2),
  })
  const rayleighControl = createRangeControl({
    id: "atmosphere-rayleigh",
    label: "瑞利散射",
    min: 0,
    max: 4,
    step: 0.01,
    value:
      settings.atmosphereRayleighScatteringScale ??
      viewer.scene.atmosphere.scattering.rayleighScatteringScale,
    format: (value) => value.toFixed(2),
  })
  const mieScatteringControl = createRangeControl({
    id: "atmosphere-mie-scattering",
    label: "米氏散射",
    min: 0,
    max: 4,
    step: 0.01,
    value:
      settings.atmosphereMieScatteringScale ??
      viewer.scene.atmosphere.scattering.mieScatteringScale,
    format: (value) => value.toFixed(2),
  })
  const mieExtinctionControl = createRangeControl({
    id: "atmosphere-mie-extinction",
    label: "米氏消光",
    min: 0,
    max: 4,
    step: 0.01,
    value:
      settings.atmosphereMieExtinctionScale ??
      viewer.scene.atmosphere.scattering.mieExtinctionScale,
    format: (value) => value.toFixed(2),
  })
  const miePhaseControl = createRangeControl({
    id: "atmosphere-mie-phase",
    label: "米氏前向性",
    min: -0.99,
    max: 0.99,
    step: 0.01,
    value:
      settings.atmosphereMiePhaseFunctionG ??
      viewer.scene.atmosphere.scattering.miePhaseFunctionG,
    format: (value) => value.toFixed(2),
  })
  const absorptionControl = createRangeControl({
    id: "atmosphere-absorption",
    label: "臭氧吸收",
    min: 0,
    max: 4,
    step: 0.01,
    value:
      settings.atmosphereAbsorptionExtinctionScale ??
      viewer.scene.atmosphere.scattering.absorptionExtinctionScale,
    format: (value) => value.toFixed(2),
  })
  const groundAlbedoControl = createRangeControl({
    id: "atmosphere-ground-albedo",
    label: "地表反照率",
    min: 0,
    max: 1,
    step: 0.01,
    value:
      settings.atmosphereGroundAlbedo ?? viewer.scene.atmosphere.scattering.groundAlbedo,
    format: (value) => value.toFixed(2),
  })

  content.appendChild(
    createGroup(
      "天空显示",
      [
        skyToggle.element,
        starsToggle.element,
        starsIntensityControl.element,
        starsPointSizeControl.element,
        sunDiscToggle.element,
        moonToggle.element,
      ],
      false
    )
  )

  content.appendChild(
    createGroup(
      "光照",
      [
        lightingModeControl.element,
        sunLightToggle.element,
        skyLightToggle.element,
        sunLightIntensityControl.element,
        skyLightIntensityControl.element,
        fallbackAmbientLightToggle.element,
        fallbackAmbientLightIntensityControl.element,
        albedoScaleControl.element,
      ],
      false
    )
  )

  content.appendChild(
    createGroup(
      "空气透视",
      [
        transmittanceToggle.element,
        nativeInscatterToggle.element,
        inscatterIntensityControl.element,
        inscatterHorizonToggle.element,
        horizonStartControl.element,
        horizonEndControl.element,
        correctAltitudeToggle.element,
        correctGeometricToggle.element,
      ],
      false
    )
  )

  content.appendChild(
    createGroup(
      "大气模型",
      [
        solarIrradianceControl.element,
        rayleighControl.element,
        mieScatteringControl.element,
        mieExtinctionControl.element,
        miePhaseControl.element,
        absorptionControl.element,
        groundAlbedoControl.element,
      ],
      false
    )
  )

  content.appendChild(
    createGroup(
      "天体参数",
      [
        sunAngularRadiusControl.element,
        moonAngularRadiusControl.element,
      ],
      false
    )
  )

  content.appendChild(
    createGroup(
      "体积云",
      [
        cloudToggle.element,
        coverageControl.element,
        cloudSpeedControl.element,
        cloudAltitudeControl.element,
        cloudHeightControl.element,
        shadowRadiusControl.element,
        shadowSampleCountControl.element,
      ],
      false
    )
  )

  const exposureControl = createRangeControl({
    id: "exposure",
    label: "曝光",
    min: 2,
    max: 14,
    step: 0.1,
    value: settings.toneMappingExposure ?? viewer.toneMappingExposure,
    format: (value) => value.toFixed(1),
  })
  const resolutionControl = createRangeControl({
    id: "resolution",
    label: "像素倍率",
    min: 0.5,
    max: 2,
    step: 0.05,
    value: settings.resolutionScale ?? viewer.resolutionScale,
    format: (value) => `${value.toFixed(2)}x`,
  })

  content.appendChild(
    createGroup(
      "渲染与后处理",
      [
        exposureControl.element,
        resolutionControl.element,
        fpsToggle.element,
        lensFlareToggle.element,
        smaaToggle.element,
        ditheringToggle.element,
      ],
      false
    )
  )

  content.appendChild(
    createGroup(
      "实验参数",
      [
        lunarRadianceScaleControl.element,
      ],
      false
    )
  )

  const status = document.createElement("p")
  status.className = "tellux-debug-settings__status"
  status.setAttribute("aria-live", "polite")
  content.appendChild(status)

  panel.append(toggle, body)
  shell.appendChild(panel)
  const fpsHud = mountDebugFpsHud(shell, fpsToggle.input.checked)
  let shouldApplyTimeControls = true
  let previousDayOfYearValue = Number(dayOfYearControl.input.value)
  let previousHourUTCValue = Number(utcControl.input.value)
  let previousClockAnimateValue = clockAnimateToggle.input.checked
  let isSyncingAnimatedTime = false
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
    dayOfYear: createSpringControl(dayOfYearControl.input),
    hourUTC: createSpringControl(utcControl.input),
  }

  function applySmoothedControls(deltaTime: number) {
    viewer.scene.atmosphere.sky.starsIntensity = smooth.starsIntensity.tick(deltaTime)
    viewer.scene.atmosphere.sky.starsPointSize = smooth.starsPointSize.tick(deltaTime)
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
    viewer.scene.clouds.layerAltitude = smooth.cloudLayerAltitude.tick(deltaTime)
    viewer.scene.clouds.layerHeight = smooth.cloudLayerHeight.tick(deltaTime)
    viewer.toneMappingExposure = smooth.toneMappingExposure.tick(deltaTime)

    if (!viewer.clock.animate) {
      viewer.clock.currentTime = createUTCDateFromSmoothedControls(
        viewer.clock.currentTime.getUTCFullYear(),
        smooth.dayOfYear.tick(deltaTime),
        smooth.hourUTC.tick(deltaTime)
      )
    }
  }

  function syncAnimatedTimeControls() {
    if (!viewer.clock.animate) return

    const currentTime = viewer.clock.currentTime
    const dayOfYearValue = getUTCDayOfYear(currentTime)
    const hourUTCValue = getUTCHour(currentTime)
    isSyncingAnimatedTime = true
    dayOfYearControl.setValue(dayOfYearValue)
    utcControl.setValue(hourUTCValue)
    isSyncingAnimatedTime = false
    previousDayOfYearValue = dayOfYearValue
    previousHourUTCValue = hourUTCValue
    status.textContent =
      `第 ${dayOfYearValue} 日 UTC ${formatHour(hourUTCValue)} / ` +
      `云量 ${viewer.scene.clouds.coverage.toFixed(2)} / ` +
      `散射 ${viewer.scene.atmosphere.scattering.intensity.toFixed(
        2
      )} / 曝光 ${viewer.toneMappingExposure.toFixed(1)}`
  }

  function applyControls() {
    if (isSyncingAnimatedTime) return

    const dayOfYearValue = Number(dayOfYearControl.input.value)
    const hourUTCValue = Number(utcControl.input.value)
    const clockMultiplierValue = sliderValueToClockMultiplier(
      Number(clockMultiplierControl.input.value)
    )
    const clockAnimateValue = clockAnimateToggle.input.checked
    const clockAnimateChanged = clockAnimateValue !== previousClockAnimateValue
    const timeControlsChanged =
      dayOfYearValue !== previousDayOfYearValue ||
      hourUTCValue !== previousHourUTCValue

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
    viewer.scene.atmosphere.fallbackAmbientLight.show = fallbackAmbientLightToggle.input.checked
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
    viewer.clock.animate = clockAnimateValue
    viewer.clock.multiplier = clockMultiplierValue
    if (shouldApplyTimeControls || timeControlsChanged) {
      smooth.dayOfYear.target = dayOfYearValue
      smooth.hourUTC.target = hourUTCValue
      previousDayOfYearValue = dayOfYearValue
      previousHourUTCValue = hourUTCValue
      shouldApplyTimeControls = false
    }
    if (clockAnimateChanged && !clockAnimateValue) {
      smooth.dayOfYear.reset(dayOfYearValue)
      smooth.hourUTC.reset(hourUTCValue)
    }
    previousClockAnimateValue = clockAnimateValue
    smooth.cloudCoverage.target = Number(coverageControl.input.value)
    smooth.cloudSpeed.target = Number(cloudSpeedControl.input.value)
    smooth.cloudLayerAltitude.target = Number(cloudAltitudeControl.input.value)
    smooth.cloudLayerHeight.target = Number(cloudHeightControl.input.value)
    smooth.toneMappingExposure.target = Number(exposureControl.input.value)
    viewer.resolutionScale = Number(resolutionControl.input.value)
    viewer.scene.postProcess.lensFlare.enabled =
      lensFlareToggle.input.checked
    viewer.scene.postProcess.smaa.enabled = smaaToggle.input.checked
    viewer.scene.postProcess.dithering.enabled =
      ditheringToggle.input.checked
    fpsHud.setVisible(fpsToggle.input.checked)
    saveStoredDebugSettings({
      skyAtmosphere: skyToggle.input.checked,
      stars: starsToggle.input.checked,
      starsIntensity: Number(starsIntensityControl.input.value),
      starsPointSize: Number(starsPointSizeControl.input.value),
      clockAnimate: clockAnimateToggle.input.checked,
      clockMultiplier: clockMultiplierValue,
      dayOfYear: dayOfYearValue,
      hourUTC: hourUTCValue,
      clouds: cloudToggle.input.checked,
      cloudCoverage: Number(coverageControl.input.value),
      cloudSpeed: Number(cloudSpeedControl.input.value),
      cloudLayerAltitude: Number(cloudAltitudeControl.input.value),
      cloudLayerHeight: Number(cloudHeightControl.input.value),
      atmosphereInscatterIntensity: Number(
        inscatterIntensityControl.input.value
      ),
      atmosphereInscatterHorizonBlend: inscatterHorizonToggle.input.checked,
      atmosphereInscatterHorizonRange: [
        Number(horizonStartControl.input.value),
        Number(horizonEndControl.input.value),
      ],
      atmosphereCorrectAltitude: correctAltitudeToggle.input.checked,
      atmosphereCorrectGeometricError: correctGeometricToggle.input.checked,
      atmosphereTransmittance: transmittanceToggle.input.checked,
      atmosphereInscatter: nativeInscatterToggle.input.checked,
      atmosphereLightingMode:
        lightingModeControl.input.value as AtmosphereLightingMode,
      atmosphereSunLight: sunLightToggle.input.checked,
      atmosphereSkyLight: skyLightToggle.input.checked,
      atmosphereSunLightIntensity: Number(sunLightIntensityControl.input.value),
      atmosphereSkyLightIntensity: Number(skyLightIntensityControl.input.value),
      fallbackAmbientLight: fallbackAmbientLightToggle.input.checked,
      fallbackAmbientLightIntensity: Number(
        fallbackAmbientLightIntensityControl.input.value
      ),
      atmosphereSun: sunDiscToggle.input.checked,
      atmosphereMoon: moonToggle.input.checked,
      atmosphereAlbedoScale: Number(albedoScaleControl.input.value),
      atmosphereSunAngularRadius: Number(sunAngularRadiusControl.input.value),
      atmosphereMoonAngularRadius: Number(moonAngularRadiusControl.input.value),
      atmosphereLunarRadianceScale: Number(
        lunarRadianceScaleControl.input.value
      ),
      atmosphereShadowRadius: Number(shadowRadiusControl.input.value),
      atmosphereShadowSampleCount: Number(shadowSampleCountControl.input.value),
      atmosphereSolarIrradianceScale: Number(solarIrradianceControl.input.value),
      atmosphereRayleighScatteringScale: Number(rayleighControl.input.value),
      atmosphereMieScatteringScale: Number(mieScatteringControl.input.value),
      atmosphereMieExtinctionScale: Number(mieExtinctionControl.input.value),
      atmosphereMiePhaseFunctionG: Number(miePhaseControl.input.value),
      atmosphereAbsorptionExtinctionScale: Number(absorptionControl.input.value),
      atmosphereGroundAlbedo: Number(groundAlbedoControl.input.value),
      toneMappingExposure: Number(exposureControl.input.value),
      resolutionScale: Number(resolutionControl.input.value),
      lensFlare: lensFlareToggle.input.checked,
      smaa: smaaToggle.input.checked,
      dithering: ditheringToggle.input.checked,
      showFps: fpsToggle.input.checked,
    })

    const currentTime = viewer.clock.currentTime
    status.textContent =
      `第 ${getUTCDayOfYear(currentTime)} 日 UTC ${formatHour(
        getUTCHour(currentTime)
      )} / 云量 ${viewer.scene.clouds.coverage.toFixed(2)} / ` +
      `散射 ${viewer.scene.atmosphere.scattering.intensity.toFixed(
        2
      )} / 曝光 ${viewer.toneMappingExposure.toFixed(1)}`
  }

  toggle.addEventListener("click", () => {
    const isOpen = body.hidden
    body.hidden = !isOpen
    toggle.setAttribute("aria-expanded", String(isOpen))
  })

  content
    .querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")
    .forEach((input) => {
      const eventType = input.type === "range" ? "input" : "change"
      input.addEventListener(eventType, applyControls)
    })

  applyControls()

  return {
    update(deltaTime: number, time = performance.now()) {
      applySmoothedControls(deltaTime)
      fpsHud.update(time)
      syncAnimatedTimeControls()
    },
    dispose() {
      panel.remove()
      fpsHud.dispose()
    },
  }
}

function clockMultiplierToSliderValue(value: number) {
  return Math.log2(Math.min(Math.max(toFinite(value, 1), 0), MAX_CLOCK_MULTIPLIER) + 1)
}

function createSpringControl(input: HTMLInputElement) {
  return new SpringControl(Number(input.value))
}

function createUTCDateFromSmoothedControls(
  year: number,
  dayOfYear: number,
  hourUTC: number
) {
  return createUTCDateFromControls(
    year,
    Math.round(dayOfYear),
    hourUTC
  )
}

function sliderValueToClockMultiplier(value: number) {
  return Math.min(
    Math.max(Math.pow(2, toFinite(value, 0)) - 1, 0),
    MAX_CLOCK_MULTIPLIER
  )
}

function toFinite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

