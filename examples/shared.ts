import * as THREE from "three"
import tellux, { type Viewer, type ViewerOptions } from "../src"
const DEFAULT_TERRAIN_URL = import.meta.env.VITE_CESIUM_TERRAIN_URL ?? ""

tellux.baseUrl = "/tellux/"

export interface ExampleSettingsPanelOptions {
  hourUTC?: number
  dayOfYear?: number
  cloudLayerAltitude?: number
  cloudLayerHeight?: number
  atmosphereInscatterIntensity?: number
  atmosphereInscatterHorizonBlend?: boolean
  atmosphereInscatterHorizonRange?: [number, number]
  atmosphereCorrectAltitude?: boolean
  atmosphereCorrectGeometricError?: boolean
  atmosphereTransmittance?: boolean
  atmosphereInscatter?: boolean
  atmosphereSunLight?: boolean
  atmosphereSkyLight?: boolean
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
  sunIntensity?: number
  skyIntensity?: number
  showFps?: boolean
}

interface RangeControlOptions {
  id: string
  label: string
  min: number
  max: number
  step: number
  value: number
  format: (value: number) => string
}

export const arcgisWorldImageryUrl =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

export function createTelluxViewer(
  container: HTMLElement,
  options: ViewerOptions = {},
  settingsPanel: ExampleSettingsPanelOptions = {}
) {
  const layers = options.layers ?? [
    {
      source: tellux.TemplateUrlResource.fromUrl(arcgisWorldImageryUrl, {
        levels: 19,
      }),
    },
  ]
  const viewer = new tellux.Viewer(container, {
    dracoDecoderPath: "/node_modules/three/examples/jsm/libs/draco/gltf/",
    terrain: DEFAULT_TERRAIN_URL
      ? {
          url: DEFAULT_TERRAIN_URL,
        }
      : undefined,
    ...options,
    layers,
  })
  applyInitialSettings(viewer, settingsPanel)
  mountExampleSettingsPanel(viewer, settingsPanel)
  ;(window as any).viewer = viewer
  return viewer
}

export function showTokenNotice(element: HTMLElement | null) {
  if (!element) return

  element.textContent =
    "当前示例使用 TemplateUrlResource 加载 ArcGIS World Imagery。"
}

function applyInitialSettings(
  viewer: Viewer,
  settings: ExampleSettingsPanelOptions
) {
  const lights = getSceneLights(viewer)

  if (settings.dayOfYear !== undefined || settings.hourUTC !== undefined) {
    viewer.clock.currentTime = createUTCDateFromControls(
      viewer.clock.currentTime.getUTCFullYear(),
      settings.dayOfYear ?? getUTCDayOfYear(viewer.clock.currentTime),
      settings.hourUTC ?? getUTCHour(viewer.clock.currentTime)
    )
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

  if (settings.atmosphereSunLight !== undefined) {
    viewer.scene.atmosphereSunLight = settings.atmosphereSunLight
  }

  if (settings.atmosphereSkyLight !== undefined) {
    viewer.scene.atmosphereSkyLight = settings.atmosphereSkyLight
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

  if (settings.sunIntensity !== undefined && lights.sunLight) {
    lights.sunLight.intensity = settings.sunIntensity
  }

  if (settings.skyIntensity !== undefined && lights.skyLight) {
    lights.skyLight.intensity = settings.skyIntensity
  }
}

function mountExampleSettingsPanel(
  viewer: Viewer,
  settings: ExampleSettingsPanelOptions
) {
  const shell = viewer.container.parentElement ?? viewer.container
  const existingPanel = shell.querySelector(".example-settings")
  existingPanel?.remove()

  const lights = getSceneLights(viewer)
  const panel = document.createElement("section")
  panel.className = "example-settings"
  panel.setAttribute("aria-label", "公共场景设置")

  const toggle = document.createElement("button")
  toggle.className = "example-settings__toggle"
  toggle.type = "button"
  toggle.textContent = "设置"
  toggle.title = "打开公共设置"
  toggle.setAttribute("aria-expanded", "false")

  const body = document.createElement("div")
  body.className = "example-settings__panel"
  body.hidden = true

  const title = document.createElement("h2")
  title.textContent = "场景设置"
  body.appendChild(title)

  const content = document.createElement("div")
  content.className = "example-settings__content"
  body.appendChild(content)

  const skyToggle = createSwitchControl(
    "sky-atmosphere",
    "大气",
    viewer.scene.skyAtmosphere.show
  )
  const transmittanceToggle = createSwitchControl(
    "atmosphere-transmittance",
    "透射衰减",
    settings.atmosphereTransmittance ?? viewer.scene.atmosphereTransmittance
  )
  const nativeInscatterToggle = createSwitchControl(
    "atmosphere-inscatter",
    "原生散射",
    settings.atmosphereInscatter ?? viewer.scene.atmosphereInscatter
  )
  const inscatterHorizonToggle = createSwitchControl(
    "atmosphere-inscatter-horizon",
    "地平线散射",
    viewer.scene.atmosphereInscatterHorizonBlend
  )
  const sunLightToggle = createSwitchControl(
    "atmosphere-sun-light",
    "太阳光照",
    settings.atmosphereSunLight ?? viewer.scene.atmosphereSunLight
  )
  const skyLightToggle = createSwitchControl(
    "atmosphere-sky-light",
    "天空光照",
    settings.atmosphereSkyLight ?? viewer.scene.atmosphereSkyLight
  )
  const sunDiscToggle = createSwitchControl(
    "atmosphere-sun-disc",
    "太阳盘",
    settings.atmosphereSun ?? viewer.scene.atmosphereSun
  )
  const moonToggle = createSwitchControl(
    "atmosphere-moon",
    "月亮",
    settings.atmosphereMoon ?? viewer.scene.atmosphereMoon
  )
  const groundToggle = createSwitchControl(
    "atmosphere-ground",
    "天空地面",
    settings.atmosphereGround ?? viewer.scene.atmosphereGround
  )
  const correctAltitudeToggle = createSwitchControl(
    "atmosphere-correct-altitude",
    "高度修正",
    settings.atmosphereCorrectAltitude ?? viewer.scene.atmosphereCorrectAltitude
  )
  const correctGeometricToggle = createSwitchControl(
    "atmosphere-correct-geometric",
    "瓦片法线修正",
    settings.atmosphereCorrectGeometricError ??
      viewer.scene.atmosphereCorrectGeometricError
  )
  const cloudToggle = createSwitchControl(
    "clouds",
    "体积云",
    viewer.scene.clouds.show
  )
  const lensFlareToggle = createSwitchControl(
    "lens-flare",
    "镜头光晕",
    viewer.scene.postProcessStages.lensFlare.enabled
  )
  const smaaToggle = createSwitchControl(
    "smaa",
    "SMAA",
    viewer.scene.postProcessStages.smaa.enabled
  )
  const ditheringToggle = createSwitchControl(
    "dithering",
    "抖动",
    viewer.scene.postProcessStages.dithering.enabled
  )
  const fpsToggle = createSwitchControl(
    "fps",
    "显示帧率",
    settings.showFps ?? true
  )

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
    format: (value) => `${Math.round(value)}日`,
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
    createGroup("日期和时间", [dayOfYearControl.element, utcControl.element])
  )

  content.appendChild(
    createGroup(
      "光照",
      [
        createRangeControl({
          id: "sun-intensity",
          label: "太阳强度",
          min: 0,
          max: 8,
          step: 0.1,
          value: settings.sunIntensity ?? lights.sunLight?.intensity ?? 3,
          format: (value) => value.toFixed(1),
        }).element,
        createRangeControl({
          id: "sky-intensity",
          label: "天空补光",
          min: 0,
          max: 3,
          step: 0.05,
          value: settings.skyIntensity ?? lights.skyLight?.intensity ?? 0.8,
          format: (value) => value.toFixed(2),
        }).element,
      ],
      false
    )
  )

  const sunIntensityRange = content.querySelector<HTMLInputElement>(
    "#example-settings-sun-intensity"
  )
  const skyIntensityRange = content.querySelector<HTMLInputElement>(
    "#example-settings-sky-intensity"
  )

  const coverageControl = createRangeControl({
    id: "cloud-coverage",
    label: "云覆盖率",
    min: 0,
    max: 1,
    step: 0.01,
    value: viewer.scene.cloudCoverage,
    format: (value) => value.toFixed(2),
  })
  const cloudAltitudeControl = createRangeControl({
    id: "cloud-altitude",
    label: "低云云底",
    min: 200,
    max: 4000,
    step: 50,
    value: settings.cloudLayerAltitude ?? viewer.scene.cloudLayerAltitude,
    format: (value) => `${Math.round(value)}m`,
  })
  const cloudHeightControl = createRangeControl({
    id: "cloud-height",
    label: "低云厚度",
    min: 100,
    max: 3000,
    step: 50,
    value: settings.cloudLayerHeight ?? viewer.scene.cloudLayerHeight,
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
      viewer.scene.atmosphereInscatterIntensity,
    format: (value) => value.toFixed(2),
  })
  const horizonRange =
    settings.atmosphereInscatterHorizonRange ??
    viewer.scene.atmosphereInscatterHorizonRange
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
    value: settings.atmosphereAlbedoScale ?? viewer.scene.atmosphereAlbedoScale,
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
      viewer.scene.atmosphereSunAngularRadius,
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
      viewer.scene.atmosphereMoonAngularRadius,
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
      viewer.scene.atmosphereLunarRadianceScale,
    format: (value) => value.toFixed(2),
  })
  const shadowRadiusControl = createRangeControl({
    id: "atmosphere-shadow-radius",
    label: "云影柔化",
    min: 0,
    max: 16,
    step: 0.25,
    value:
      settings.atmosphereShadowRadius ?? viewer.scene.atmosphereShadowRadius,
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
      viewer.scene.atmosphereShadowSampleCount,
    format: (value) => String(Math.round(value)),
  })
  const solarIrradianceControl = createRangeControl({
    id: "atmosphere-solar-irradiance",
    label: "太阳辐照",
    min: 0,
    max: 4,
    step: 0.01,
    value:
      settings.atmosphereSolarIrradianceScale ??
      viewer.scene.atmosphereSolarIrradianceScale,
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
      viewer.scene.atmosphereRayleighScatteringScale,
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
      viewer.scene.atmosphereMieScatteringScale,
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
      viewer.scene.atmosphereMieExtinctionScale,
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
      viewer.scene.atmosphereMiePhaseFunctionG,
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
      viewer.scene.atmosphereAbsorptionExtinctionScale,
    format: (value) => value.toFixed(2),
  })
  const groundAlbedoControl = createRangeControl({
    id: "atmosphere-ground-albedo",
    label: "地表反照率",
    min: 0,
    max: 1,
    step: 0.01,
    value:
      settings.atmosphereGroundAlbedo ?? viewer.scene.atmosphereGroundAlbedo,
    format: (value) => value.toFixed(2),
  })

  content.appendChild(
    createGroup(
      "大气基础",
      [
        skyToggle.element,
        transmittanceToggle.element,
        nativeInscatterToggle.element,
        inscatterIntensityControl.element,
        inscatterHorizonToggle.element,
        horizonStartControl.element,
        horizonEndControl.element,
        sunLightToggle.element,
        skyLightToggle.element,
        sunDiscToggle.element,
        moonToggle.element,
        groundToggle.element,
        correctAltitudeToggle.element,
        correctGeometricToggle.element,
      ],
      false
    )
  )

  content.appendChild(
    createGroup(
      "大气物理",
      [
        solarIrradianceControl.element,
        rayleighControl.element,
        mieScatteringControl.element,
        mieExtinctionControl.element,
        miePhaseControl.element,
        absorptionControl.element,
        groundAlbedoControl.element,
        albedoScaleControl.element,
        sunAngularRadiusControl.element,
        moonAngularRadiusControl.element,
        lunarRadianceScaleControl.element,
        shadowRadiusControl.element,
        shadowSampleCountControl.element,
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
        cloudAltitudeControl.element,
        cloudHeightControl.element,
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
    value: viewer.toneMappingExposure,
    format: (value) => value.toFixed(1),
  })
  const resolutionControl = createRangeControl({
    id: "resolution",
    label: "像素倍率",
    min: 0.5,
    max: 2,
    step: 0.05,
    value: viewer.resolutionScale,
    format: (value) => `${value.toFixed(2)}x`,
  })

  content.appendChild(
    createGroup(
      "渲染",
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

  const status = document.createElement("p")
  status.className = "example-settings__status"
  status.setAttribute("aria-live", "polite")
  content.appendChild(status)

  panel.append(toggle, body)
  shell.appendChild(panel)
  const fpsHud = mountFpsHud(viewer, shell, fpsToggle.input.checked)

  function applyControls() {
    const currentLights = getSceneLights(viewer)

    viewer.scene.skyAtmosphere.show = skyToggle.input.checked
    viewer.scene.atmosphereTransmittance = transmittanceToggle.input.checked
    viewer.scene.atmosphereInscatter = nativeInscatterToggle.input.checked
    viewer.scene.atmosphereInscatterIntensity = Number(
      inscatterIntensityControl.input.value
    )
    viewer.scene.atmosphereInscatterHorizonBlend =
      inscatterHorizonToggle.input.checked
    viewer.scene.atmosphereInscatterHorizonRange = [
      Number(horizonStartControl.input.value),
      Number(horizonEndControl.input.value),
    ]
    viewer.scene.atmosphereSunLight = sunLightToggle.input.checked
    viewer.scene.atmosphereSkyLight = skyLightToggle.input.checked
    viewer.scene.atmosphereSun = sunDiscToggle.input.checked
    viewer.scene.atmosphereMoon = moonToggle.input.checked
    viewer.scene.atmosphereGround = groundToggle.input.checked
    viewer.scene.atmosphereCorrectAltitude = correctAltitudeToggle.input.checked
    viewer.scene.atmosphereCorrectGeometricError =
      correctGeometricToggle.input.checked
    viewer.scene.atmosphereSolarIrradianceScale = Number(
      solarIrradianceControl.input.value
    )
    viewer.scene.atmosphereRayleighScatteringScale = Number(
      rayleighControl.input.value
    )
    viewer.scene.atmosphereMieScatteringScale = Number(
      mieScatteringControl.input.value
    )
    viewer.scene.atmosphereMieExtinctionScale = Number(
      mieExtinctionControl.input.value
    )
    viewer.scene.atmosphereMiePhaseFunctionG = Number(
      miePhaseControl.input.value
    )
    viewer.scene.atmosphereAbsorptionExtinctionScale = Number(
      absorptionControl.input.value
    )
    viewer.scene.atmosphereGroundAlbedo = Number(
      groundAlbedoControl.input.value
    )
    viewer.scene.atmosphereAlbedoScale = Number(albedoScaleControl.input.value)
    viewer.scene.atmosphereSunAngularRadius = Number(
      sunAngularRadiusControl.input.value
    )
    viewer.scene.atmosphereMoonAngularRadius = Number(
      moonAngularRadiusControl.input.value
    )
    viewer.scene.atmosphereLunarRadianceScale = Number(
      lunarRadianceScaleControl.input.value
    )
    viewer.scene.atmosphereShadowRadius = Number(
      shadowRadiusControl.input.value
    )
    viewer.scene.atmosphereShadowSampleCount = Number(
      shadowSampleCountControl.input.value
    )
    viewer.scene.clouds.show = cloudToggle.input.checked
    viewer.clock.currentTime = createUTCDateFromControls(
      viewer.clock.currentTime.getUTCFullYear(),
      Number(dayOfYearControl.input.value),
      Number(utcControl.input.value)
    )
    viewer.scene.cloudCoverage = Number(coverageControl.input.value)
    viewer.scene.cloudLayerAltitude = Number(cloudAltitudeControl.input.value)
    viewer.scene.cloudLayerHeight = Number(cloudHeightControl.input.value)
    viewer.toneMappingExposure = Number(exposureControl.input.value)
    viewer.resolutionScale = Number(resolutionControl.input.value)
    viewer.scene.postProcessStages.lensFlare.enabled =
      lensFlareToggle.input.checked
    viewer.scene.postProcessStages.smaa.enabled = smaaToggle.input.checked
    viewer.scene.postProcessStages.dithering.enabled =
      ditheringToggle.input.checked
    fpsHud.setVisible(fpsToggle.input.checked)

    if (currentLights.sunLight && sunIntensityRange) {
      currentLights.sunLight.intensity = Number(sunIntensityRange.value)
    }

    if (currentLights.skyLight && skyIntensityRange) {
      currentLights.skyLight.intensity = Number(skyIntensityRange.value)
    }

    const currentTime = viewer.clock.currentTime
    status.textContent =
      `第 ${getUTCDayOfYear(currentTime)} 日 UTC ${formatHour(
        getUTCHour(currentTime)
      )} / 云量 ${viewer.scene.cloudCoverage.toFixed(2)} / ` +
      `散射 ${viewer.scene.atmosphereInscatterIntensity.toFixed(
        2
      )} / 曝光 ${viewer.toneMappingExposure.toFixed(1)}`
  }

  toggle.addEventListener("click", () => {
    const isOpen = body.hidden
    body.hidden = !isOpen
    toggle.setAttribute("aria-expanded", String(isOpen))
  })

  content.querySelectorAll("input").forEach((input) => {
    const eventType = input.type === "range" ? "input" : "change"
    input.addEventListener(eventType, applyControls)
  })

  applyControls()

  const destroy = viewer.destroy.bind(viewer)
  viewer.destroy = () => {
    panel.remove()
    fpsHud.dispose()
    destroy()
  }
}

function mountFpsHud(viewer: Viewer, shell: HTMLElement, isVisible: boolean) {
  const hud = document.createElement("div")
  hud.className = "example-fps"
  hud.textContent = "-- fps"
  hud.hidden = !isVisible
  shell.appendChild(hud)

  const render = viewer.render.bind(viewer)
  let frames = 0
  let lastSampleTime = performance.now()

  viewer.render = (time = performance.now()) => {
    const deltaTime = render(time)
    frames += 1

    const elapsed = time - lastSampleTime
    if (elapsed >= 500) {
      hud.textContent = `${Math.round((frames * 1000) / elapsed)} fps`
      frames = 0
      lastSampleTime = time
    }

    return deltaTime
  }

  return {
    setVisible(value: boolean) {
      hud.hidden = !value
    },
    dispose() {
      viewer.render = render
      hud.remove()
    },
  }
}

function createGroup(label: string, controls: HTMLElement[], expanded = true) {
  const group = document.createElement("div")
  group.className = "example-settings__group"

  const header = document.createElement("button")
  header.className = "example-settings__group-header"
  header.type = "button"
  header.setAttribute("aria-expanded", String(expanded))

  const title = document.createElement("span")
  title.textContent = label

  const marker = document.createElement("span")
  marker.className = "example-settings__group-marker"
  marker.setAttribute("aria-hidden", "true")

  const content = document.createElement("div")
  content.className = "example-settings__group-content"
  content.inert = !expanded

  header.append(title, marker)
  controls.forEach((control) => {
    content.appendChild(control)
  })

  header.addEventListener("click", () => {
    const isOpen = header.getAttribute("aria-expanded") === "true"
    header.setAttribute("aria-expanded", String(!isOpen))
    content.inert = isOpen
  })

  group.append(header, content)
  return group
}

function createSwitchControl(id: string, label: string, checked: boolean) {
  const wrapper = document.createElement("label")
  wrapper.className = "example-settings__switch"

  const input = document.createElement("input")
  input.id = `example-settings-${id}`
  input.type = "checkbox"
  input.checked = checked

  const text = document.createElement("span")
  text.textContent = label

  wrapper.append(input, text)
  return { element: wrapper, input }
}

function createRangeControl(options: RangeControlOptions) {
  const wrapper = document.createElement("label")
  wrapper.className = "example-settings__range"

  const header = document.createElement("span")
  header.className = "example-settings__range-header"

  const label = document.createElement("span")
  label.textContent = options.label

  const value = document.createElement("output")
  value.textContent = options.format(options.value)

  const input = document.createElement("input")
  input.id = `example-settings-${options.id}`
  input.type = "range"
  input.min = String(options.min)
  input.max = String(options.max)
  input.step = String(options.step)
  input.value = String(options.value)
  input.addEventListener("input", () => {
    value.textContent = options.format(Number(input.value))
  })

  header.append(label, value)
  wrapper.append(header, input)

  return { element: wrapper, input }
}

function getSceneLights(viewer: Viewer) {
  let sunLight: THREE.DirectionalLight | null = null
  let skyLight: THREE.HemisphereLight | null = null

  viewer.scene.threeScene.traverse((object) => {
    if (!sunLight && object instanceof THREE.DirectionalLight) {
      sunLight = object
    }

    if (!skyLight && object instanceof THREE.HemisphereLight) {
      skyLight = object
    }
  })

  return { sunLight, skyLight }
}

function formatHour(value: number) {
  const totalMinutes = Math.round(value * 60) % (24 * 60)
  const hour = Math.floor(totalMinutes / 60)
  const minute = totalMinutes % 60
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function formatRadians(value: number) {
  return `${value.toFixed(4)}rad`
}

function getUTCHour(date: Date) {
  return (
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  )
}

function getUTCDayOfYear(date: Date) {
  const year = date.getUTCFullYear()
  const start = Date.UTC(year, 0, 1)
  const current = Date.UTC(year, date.getUTCMonth(), date.getUTCDate())
  return Math.floor((current - start) / 86400000) + 1
}

function getDaysInUTCYear(year: number) {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000
}

function createUTCDateFromControls(
  year: number,
  dayOfYear: number,
  hourUTC: number
) {
  const safeYear = Math.round(toFinite(year, new Date().getUTCFullYear()))
  const safeDayOfYear = clamp(
    Math.round(toFinite(dayOfYear, 1)),
    1,
    getDaysInUTCYear(safeYear)
  )
  const totalSeconds =
    Math.round(clamp(toFinite(hourUTC, 0), 0, 24) * 3600) % 86400
  const hour = Math.floor(totalSeconds / 3600)
  const minute = Math.floor((totalSeconds % 3600) / 60)
  const second = totalSeconds % 60

  return new Date(Date.UTC(safeYear, 0, safeDayOfYear, hour, minute, second, 0))
}

function toFinite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
