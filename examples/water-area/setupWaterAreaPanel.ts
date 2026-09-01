import type { Viewer } from "../../src"
import { createTelluxPanel, type TelluxPanel } from "../example-panel-leva"
import { t } from "../i18n"
import {
  createWaterAreaDemo,
  type WaterAreaDemo,
} from "./createWaterAreaDemo"
import {
  DEFAULT_WATER_AREA_APPEARANCE,
  normalizeWaterAreaAppearance,
  type ResolvedWaterAreaAppearance,
} from "./WaterAreaAppearance"
import {
  DEFAULT_WATER_AREA_OPTICS,
  normalizeWaterAreaOptics,
  type ResolvedWaterAreaOptics,
} from "./WaterAreaOptics"

const waterAreaSchema = () =>
  ({
    setup: {
      $: { label: t({ zh: "效果", en: "Effect" }) },
      token: {
        value: "",
        label: t({ zh: "Cesium Ion token", en: "Cesium Ion token" }),
      },
      show: {
        value: true,
        label: t({ zh: "显示水域外观", en: "Show water appearance" }),
      },
    },
    appearance: {
      $: { label: t({ zh: "外观", en: "Appearance" }) },
      color: {
        value: "#06172d",
        label: t({ zh: "水色", en: "Water color" }),
      },
      colorMix: {
        value: 0.8,
        min: 0,
        max: 1,
        step: 0.05,
        label: t({ zh: "颜色混合", en: "Color mix" }),
      },
      roughness: {
        value: 0.11,
        min: 0.05,
        max: 0.8,
        step: 0.01,
        label: t({ zh: "粗糙度", en: "Roughness" }),
      },
    },
    waves: {
      $: { label: t({ zh: "波纹", en: "Waves" }) },
      strength: {
        value: 0.8,
        min: 0,
        max: 1,
        step: 0.01,
        label: t({ zh: "强度", en: "Strength" }),
      },
      scale: {
        value: 0.3,
        min: 0.25,
        max: 4,
        step: 0.05,
        label: t({ zh: "尺度", en: "Scale" }),
      },
      speed: {
        value: 0.5,
        min: 0,
        max: 2,
        step: 0.05,
        label: t({ zh: "速度", en: "Speed" }),
      },
      direction: {
        value: 160,
        min: 0,
        max: 360,
        step: 1,
        label: t({ zh: "方向（°）", en: "Direction (°)" }),
      },
    },
    environment: {
      $: { label: t({ zh: "环境", en: "Environment" }) },
      enabled: {
        value: true,
        label: t({ zh: "天空环境倒影", en: "Sky environment" }),
      },
      intensity: {
        value: 1,
        min: 0,
        max: 2,
        step: 0.05,
        label: t({ zh: "环境强度", en: "Environment intensity" }),
      },
    },
    status: {
      $: { label: t({ zh: "状态", en: "Status" }) },
      message: {
        type: "hint",
        value: "",
      },
    },
  }) as const

export type WaterAreaPanel = TelluxPanel<ReturnType<typeof waterAreaSchema>>

export interface SetupWaterAreaPanelOptions {
  viewer: Viewer
  defaultIonToken?: string
  attributionsElement: HTMLElement
  onDemoChange?: (demo: WaterAreaDemo | null) => void
}

export interface WaterAreaPanelHandle {
  panel: WaterAreaPanel
  reload: () => Promise<void>
  dispose: () => Promise<void>
}

export function setupWaterAreaPanel({
  viewer,
  defaultIonToken = "",
  attributionsElement,
  onDemoChange,
}: SetupWaterAreaPanelOptions): WaterAreaPanelHandle {
  let activeDemo: WaterAreaDemo | null = null
  let appearanceState: ResolvedWaterAreaAppearance = {
    ...DEFAULT_WATER_AREA_APPEARANCE,
  }
  let opticsState: ResolvedWaterAreaOptics = normalizeWaterAreaOptics(
    DEFAULT_WATER_AREA_OPTICS
  )
  let attributionFrame = 0
  let reloading = false

  function setOpticsControlsDisabled(
    targetPanel: WaterAreaPanel,
    disabled: boolean
  ) {
    targetPanel.setFieldDisabled("environment.enabled", disabled)
    targetPanel.setFieldDisabled("environment.intensity", disabled)
  }

  function renderEffectStatus(targetPanel: WaterAreaPanel) {
    const { controls } = targetPanel
    targetPanel.setStatus(
      controls.setup.show
        ? t({
            zh: `水域外观已显示：动态天空环境${controls.environment.enabled ? "开启" : "关闭"}。`,
            en: `Water appearance shown: dynamic sky environment ${controls.environment.enabled ? "on" : "off"}.`,
          })
        : t({
            zh: "水域外观已隐藏；瓦片、Worker 与 Mask 缓存保持运行。",
            en: "Water appearance hidden; tiles, workers, and the mask cache remain active.",
          })
    )
  }

  function readAppearanceControls(
    targetPanel: WaterAreaPanel
  ): ResolvedWaterAreaAppearance {
    const { controls } = targetPanel
    return normalizeWaterAreaAppearance({
      show: controls.setup.show,
      color: controls.appearance.color,
      colorMix: controls.appearance.colorMix,
      roughness: controls.appearance.roughness,
      waveStrength: controls.waves.strength,
      waveScale: controls.waves.scale,
      waveSpeed: controls.waves.speed,
      waveDirection: controls.waves.direction,
    })
  }

  function applyAppearanceControls(targetPanel: WaterAreaPanel) {
    appearanceState = readAppearanceControls(targetPanel)
    activeDemo?.appearance.assign(appearanceState)
  }

  function readOpticsControls(targetPanel: WaterAreaPanel): ResolvedWaterAreaOptics {
    const { controls } = targetPanel
    return normalizeWaterAreaOptics({
      environment: {
        enabled: controls.environment.enabled,
        intensity: controls.environment.intensity,
      },
    })
  }

  function applyOpticsControls(targetPanel: WaterAreaPanel) {
    opticsState = readOpticsControls(targetPanel)
    activeDemo?.optics.assign(opticsState)
    renderEffectStatus(targetPanel)
  }

  function bindPanelInteractions(currentPanel: WaterAreaPanel) {
    const { controls } = currentPanel
    const cleanups: Array<() => void> = []

    cleanups.push(
      controls.effect(() => {
        void controls.setup.show
        void controls.appearance.color
        void controls.appearance.colorMix
        void controls.appearance.roughness
        void controls.waves.strength
        void controls.waves.scale
        void controls.waves.speed
        void controls.waves.direction
        applyAppearanceControls(currentPanel)
        renderEffectStatus(currentPanel)
      })
    )

    cleanups.push(
      controls.effect(() => {
        void controls.environment.enabled
        void controls.environment.intensity
        applyOpticsControls(currentPanel)
      })
    )

    const tokenInput = currentPanel.getFieldElement("setup.token")
    const onTokenKeydown = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return
      event.preventDefault()
      void reload()
    }
    if (tokenInput instanceof HTMLInputElement) {
      tokenInput.addEventListener("keydown", onTokenKeydown)
      cleanups.push(() => tokenInput.removeEventListener("keydown", onTokenKeydown))
    }

    if (reloading) {
      currentPanel.setFieldDisabled("setup.token", true)
      currentPanel.setFieldDisabled("setup.show", true)
      setOpticsControlsDisabled(currentPanel, true)
    } else if (!defaultIonToken && !controls.setup.token.trim()) {
      currentPanel.setFieldDisabled("setup.show", true)
      setOpticsControlsDisabled(currentPanel, true)
    }

    renderEffectStatus(currentPanel)

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }

  const panel = createTelluxPanel(waterAreaSchema, {
    id: "water-area-panel",
    title: () => t({ zh: "水域渲染", en: "Water Area" }),
    statusPath: "status.message",
    onRebuild: bindPanelInteractions,
  })

  function renderAttributions() {
    const attributions = activeDemo?.tileset.getAttributions() ?? []
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

  async function reload() {
    if (reloading) return
    const { controls } = panel
    const apiToken = controls.setup.token.trim() || defaultIonToken
    if (!apiToken) {
      panel.setFieldDisabled("setup.show", true)
      setOpticsControlsDisabled(panel, true)
      panel.setStatus(
        t({
          zh: "请输入 Cesium Ion token 后按 Enter，或在 .env 中配置 VITE_CESIUM_ION_TOKEN。",
          en: "Enter a Cesium Ion token and press Enter, or set VITE_CESIUM_ION_TOKEN.",
        })
      )
      return
    }

    reloading = true
    panel.setFieldDisabled("setup.token", true)
    panel.setFieldDisabled("setup.show", true)
    setOpticsControlsDisabled(panel, true)
    try {
      await activeDemo?.dispose()
      activeDemo = null
      onDemoChange?.(null)
      activeDemo = createWaterAreaDemo({
        viewer,
        apiToken,
        appearance: appearanceState,
        optics: opticsState,
      })
      onDemoChange?.(activeDemo)
      panel.setFieldDisabled("setup.show", false)
      setOpticsControlsDisabled(panel, false)
      renderEffectStatus(panel)
    } catch (error) {
      panel.setFieldDisabled("setup.show", true)
      panel.setStatus(error instanceof Error ? error.message : String(error))
      console.error(error)
    } finally {
      reloading = false
      panel.setFieldDisabled("setup.token", false)
    }
  }

  renderAttributions()

  void (async () => {
    if (defaultIonToken) {
      await reload()
      return
    }

    panel.setFieldDisabled("setup.show", true)
    setOpticsControlsDisabled(panel, true)
    panel.setStatus(
      t({
        zh: "输入 Cesium Ion token 后按 Enter 加载 Water Area 案例。",
        en: "Enter a Cesium Ion token and press Enter to load the Water Area example.",
      })
    )
  })()

  return {
    panel,
    reload,
    async dispose() {
      window.cancelAnimationFrame(attributionFrame)
      await activeDemo?.dispose()
      activeDemo = null
      onDemoChange?.(null)
      panel.dispose()
    },
  }
}
