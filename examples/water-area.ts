import tellux from "../src"
import { setupExamplePanels } from "./example-panel"
import { bootExampleI18n, t } from "./i18n"
import {
  createWaterAreaDemo,
  type WaterAreaDemo,
} from "./water-area/createWaterAreaDemo"
import {
  DEFAULT_WATER_AREA_APPEARANCE,
  normalizeWaterAreaAppearance,
  type ResolvedWaterAreaAppearance,
} from "./water-area/WaterAreaAppearance"
import {
  DEFAULT_WATER_AREA_OPTICS,
  normalizeWaterAreaOptics,
  type ResolvedWaterAreaOptics,
} from "./water-area/WaterAreaOptics"

const WATER_AREA_VIEW = {
  "latitude": 57.01944780700264,
  "longitude": -132.91669016841638,
  "height": 404.4714851389597,
  "heading": 57.090078519217464,
  "pitch": 1.7434647918138277,
  "roll": -0.000009369041331049295
}

const WATER_AREA_UTC_TIME = new Date(Date.UTC(2026, 7, 23, 11, 51, 18))

const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""

bootExampleI18n()
setupExamplePanels()

void main().catch((error) => console.error(error))

async function main() {
  const tokenInput = document.querySelector<HTMLInputElement>("#ion-token")
  const showInput =
    document.querySelector<HTMLInputElement>("#water-area-show")
  const colorInput =
    document.querySelector<HTMLInputElement>("#water-area-color")
  const colorMixInput = document.querySelector<HTMLInputElement>(
    "#water-area-color-mix"
  )
  const roughnessInput = document.querySelector<HTMLInputElement>(
    "#water-area-roughness"
  )
  const waveStrengthInput = document.querySelector<HTMLInputElement>(
    "#water-area-wave-strength"
  )
  const waveScaleInput = document.querySelector<HTMLInputElement>(
    "#water-area-wave-scale"
  )
  const waveSpeedInput = document.querySelector<HTMLInputElement>(
    "#water-area-wave-speed"
  )
  const waveDirectionInput = document.querySelector<HTMLInputElement>(
    "#water-area-wave-direction"
  )
  const environmentInput = document.querySelector<HTMLInputElement>(
    "#water-area-environment"
  )
  const environmentIntensityInput =
    document.querySelector<HTMLInputElement>(
      "#water-area-environment-intensity"
    )
  const statusElement =
    document.querySelector<HTMLElement>("#water-area-status")
  const attributionsElement = document.querySelector<HTMLElement>(
    "#google-attributions"
  )

  if (
    !tokenInput ||
    !showInput ||
    !colorInput ||
    !colorMixInput ||
    !roughnessInput ||
    !waveStrengthInput ||
    !waveScaleInput ||
    !waveSpeedInput ||
    !waveDirectionInput ||
    !environmentInput ||
    !environmentIntensityInput ||
    !statusElement ||
    !attributionsElement
  ) {
    throw new Error("Water-area controls not found.")
  }

  const viewer = await tellux.Viewer.create("viewer", {
    renderer: {
      type: "webgpu",
    },
    dracoDecoderPath: "/draco/",
    camera: {
      ...WATER_AREA_VIEW,
      far: 30000000,
    },
    scene: {
      atmosphere: {
        show: true,
        lighting: {
          mode: "light-source",
          sunLight: true,
          skyLight: true,
        },
      },
      clouds: {
        show: false,
      },
      postProcess: {
        toneMappingExposure: 5,
      },
    },
    widgets: {
      timeline: true
    }
  })

    ; (window as any).viewer = viewer
  viewer.tileset.group.visible = false
  viewer.clock.currentTime = WATER_AREA_UTC_TIME

  tokenInput.value = ""
  tokenInput.placeholder = DEFAULT_ION_TOKEN
    ? t({
      zh: "留空使用 VITE_CESIUM_ION_TOKEN",
      en: "Leave empty to use VITE_CESIUM_ION_TOKEN",
    })
    : t({ zh: "输入 Cesium Ion token", en: "Enter Cesium Ion token" })

  let activeDemo: WaterAreaDemo | null = null
  let appearanceState: ResolvedWaterAreaAppearance = {
    ...DEFAULT_WATER_AREA_APPEARANCE,
  }
  let opticsState: ResolvedWaterAreaOptics = normalizeWaterAreaOptics(
    DEFAULT_WATER_AREA_OPTICS
  )
  let attributionFrame = 0
  let reloading = false

  const setStatus = (message: string): void => {
    statusElement.textContent = message
  }

  const renderAttributions = (): void => {
    const attributions = activeDemo?.layer.tileset.getAttributions() ?? []
    attributionsElement.replaceChildren()
    for (const attribution of attributions) {
      if (attribution.type === "image") {
        const image = document.createElement("img")
        image.src = String(attribution.value)
        image.alt = ""
        attributionsElement.append(image)
      } else if (attribution.value) {
        const item = document.createElement("span")
        item.innerHTML = String(attribution.value)
        attributionsElement.append(item)
      }
    }
    attributionFrame = window.requestAnimationFrame(renderAttributions)
  }

  const renderEffectStatus = (): void => {
    setStatus(
      showInput.checked
        ? t({
          zh: `水域外观已显示：动态天空环境${environmentInput.checked ? "开启" : "关闭"}。`,
          en: `Water appearance shown: dynamic sky environment ${environmentInput.checked ? "on" : "off"}.`,
        })
        : t({
          zh: "水域外观已隐藏；瓦片、Worker 与 Mask 缓存保持运行。",
          en: "Water appearance hidden; tiles, workers, and the mask cache remain active.",
        })
    )
  }

  const readAppearanceControls = (): ResolvedWaterAreaAppearance =>
    normalizeWaterAreaAppearance({
      show: showInput.checked,
      color: colorInput.value,
      colorMix: colorMixInput.valueAsNumber,
      roughness: roughnessInput.valueAsNumber,
      waveStrength: waveStrengthInput.valueAsNumber,
      waveScale: waveScaleInput.valueAsNumber,
      waveSpeed: waveSpeedInput.valueAsNumber,
      waveDirection: waveDirectionInput.valueAsNumber,
    })

  const applyAppearanceControls = (): void => {
    appearanceState = readAppearanceControls()
    activeDemo?.appearance.assign(appearanceState)
  }

  const readOpticsControls = (): ResolvedWaterAreaOptics =>
    normalizeWaterAreaOptics({
      environment: {
        enabled: environmentInput.checked,
        intensity: environmentIntensityInput.valueAsNumber,
      },
    })

  const applyOpticsControls = (): void => {
    opticsState = readOpticsControls()
    activeDemo?.optics.assign(opticsState)
    renderEffectStatus()
  }

  const setOpticsControlsDisabled = (disabled: boolean): void => {
    environmentInput.disabled = disabled
    environmentIntensityInput.disabled = disabled
  }

  const reloadWaterArea = async (): Promise<void> => {
    if (reloading) return
    const apiToken = tokenInput.value.trim() || DEFAULT_ION_TOKEN
    if (!apiToken) {
      showInput.disabled = true
      setOpticsControlsDisabled(true)
      setStatus(
        t({
          zh: "请输入 Cesium Ion token 后按 Enter，或在 .env 中配置 VITE_CESIUM_ION_TOKEN。",
          en: "Enter a Cesium Ion token and press Enter, or set VITE_CESIUM_ION_TOKEN.",
        })
      )
      return
    }

    reloading = true
    tokenInput.disabled = true
    showInput.disabled = true
    setOpticsControlsDisabled(true)
    try {
      await activeDemo?.dispose()
      activeDemo = null
      activeDemo = createWaterAreaDemo({
        viewer,
        apiToken,
        appearance: appearanceState,
        optics: opticsState,
      })
        ; (window as any).waterAreaDemo = activeDemo
      showInput.disabled = false
      setOpticsControlsDisabled(false)
      renderEffectStatus()
    } catch (error) {
      showInput.disabled = true
      setStatus(error instanceof Error ? error.message : String(error))
      console.error(error)
    } finally {
      reloading = false
      tokenInput.disabled = false
    }
  }

  showInput.addEventListener("change", () => {
    applyAppearanceControls()
    renderEffectStatus()
  })
  for (const input of [
    colorInput,
    colorMixInput,
    roughnessInput,
    waveStrengthInput,
    waveScaleInput,
    waveSpeedInput,
    waveDirectionInput,
  ]) {
    input.addEventListener("input", applyAppearanceControls)
  }
  environmentInput.addEventListener("change", applyOpticsControls)
  environmentIntensityInput.addEventListener("input", applyOpticsControls)
  tokenInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    void reloadWaterArea()
  })
  renderAttributions()

  if (DEFAULT_ION_TOKEN) {
    await reloadWaterArea()
  } else {
    showInput.disabled = true
    setOpticsControlsDisabled(true)
    setStatus(
      t({
        zh: "输入 Cesium Ion token 后按 Enter 加载 Water Area 案例。",
        en: "Enter a Cesium Ion token and press Enter to load the Water Area example.",
      })
    )
  }

  window.addEventListener("beforeunload", () => {
    window.cancelAnimationFrame(attributionFrame)
    void activeDemo?.dispose()
    viewer.destroy()
  })
}
