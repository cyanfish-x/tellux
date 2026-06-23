import type { Viewer } from "../../Viewer"
import {
  createGroup,
  createRangeControl,
  createSelectControl,
  createSwitchControl,
} from "./controls"
import {
  CLOCK_MULTIPLIER_SLIDER_MAX,
  clockMultiplierToSliderValue,
  sliderValueToClockMultiplier
} from "./math"
import {
  formatRadians,
  formatUTCMonthDay,
  getDaysInUTCYear,
  getUTCDayOfYear,
} from "./time"
import type { DebugSettingsPanelOptions } from "./types"

export function buildDebugSettingsControls(
  content: HTMLElement,
  viewer: Viewer,
  settings: DebugSettingsPanelOptions
) {  const skyToggle = createSwitchControl(
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
  const dayOfYearControl = createRangeControl({
    id: "day-of-year",
    label: "年内日",
    min: 1,
    max: getDaysInUTCYear(initialYearUTC),
    step: 1,
    value: initialDayOfYear,
    format: (value) => formatUTCMonthDay(initialYearUTC, value),
  })

  content.appendChild(
    createGroup("日期和时间", [
      clockAnimateToggle.element,
      clockMultiplierControl.element,
      dayOfYearControl.element,
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

  return {
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
    ditheringToggle,
    fpsToggle,
    clockAnimateToggle,
    clockMultiplierControl,
    dayOfYearControl,
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
    status
  }
}

