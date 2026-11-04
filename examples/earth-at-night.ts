import tellux, { type ImageryLayerSourceOptions } from "../src"
import { bootExampleI18n, t } from "./i18n"
import { createTelluxPanel, type TelluxPanel } from "./example-panel-leva"
import { exampleMapServiceConfig, defaultCesiumIonToken } from "./shared"

bootExampleI18n()

const CESIUM_ION_BLACK_MARBLE_ASSET_ID = 3812

const container = document.querySelector("#viewer")
if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

function createNightImagerySource(): ImageryLayerSourceOptions | undefined {
  if (!defaultCesiumIonToken) return undefined
  return {
    type: "cesium-ion",
    assetId: CESIUM_ION_BLACK_MARBLE_ASSET_ID,
    apiToken: defaultCesiumIonToken,
  }
}

const nightSource = createNightImagerySource()
const dayOverlays = exampleMapServiceConfig.createOverlays().map((layer, index) =>
  index === 0 ? { ...layer, id: "day", name: "Daytime" } : layer
)

const initialClockTime = new Date()
initialClockTime.setUTCHours(12, 0, 0, 0)

const viewer = new tellux.Viewer(container, {
  clock: {
    currentTime: initialClockTime,
    shouldAnimate: true,
    multiplier: 3600,
  },
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  overlays: [
    ...dayOverlays,
    ...(nightSource
      ? [
          {
            id: "night",
            name: "Night lights",
            source: nightSource,
            style: { dayOpacity: 0 },
          },
        ]
      : []),
  ],
  camera: {
    destination: {
      longitude: 20,
      latitude: 20,
      height: 18000000,
    },
    orientation: {
      heading: 0,
      pitch: -90,
    },
    projection: {
      far: 40000000,
    },
  },
  scene: {
    atmosphere: {
      lighting: {
        mode: "light-source",
      },
      night: {
        enabled: true,
        moonLight: true,
      },
      sky: {
        stars: {
          show: true,
        },
      },
    },
    clouds: {
      show: false,
    },
  },
})

const dayLayer = viewer.overlays.get("day")
const nightLayer = viewer.overlays.get("night")
;(window as any).viewer = viewer

const overlaySchema = () =>
  ({
    day: {
      $: { label: t({ zh: "白天底图", en: "Daytime imagery" }) },
      opacity: {
        value: dayLayer?.getStyle().opacity ?? 1,
        min: 0,
        max: 1,
        step: 0.01,
        label: "opacity",
      },
      dayOpacity: {
        value: dayLayer?.getStyle().dayOpacity ?? 1,
        min: 0,
        max: 1,
        step: 0.01,
        label: "dayOpacity",
      },
      nightOpacity: {
        value: dayLayer?.getStyle().nightOpacity ?? 1,
        min: 0,
        max: 1,
        step: 0.01,
        label: "nightOpacity",
      },
    },
    night: {
      $: { label: t({ zh: "夜光", en: "Night lights" }) },
      opacity: {
        value: nightLayer?.getStyle().opacity ?? 1,
        min: 0,
        max: 1,
        step: 0.01,
        label: "opacity",
      },
      dayOpacity: {
        value: nightLayer?.getStyle().dayOpacity ?? 0,
        min: 0,
        max: 1,
        step: 0.01,
        label: "dayOpacity",
      },
      nightOpacity: {
        value: nightLayer?.getStyle().nightOpacity ?? 1,
        min: 0,
        max: 1,
        step: 0.01,
        label: "nightOpacity",
      },
    },
    clock: {
      $: { label: t({ zh: "时钟", en: "Clock" }) },
      playing: {
        value: viewer.clock.shouldAnimate,
        label: t({ zh: "播放", en: "Play" }),
      },
      multiplier: {
        value: viewer.clock.multiplier,
        min: 0,
        max: 20000,
        step: 100,
        label: "clock.multiplier",
      },
    },
    status: {
      $: { label: t({ zh: "状态", en: "Status" }) },
      message: {
        type: "hint" as const,
        value: defaultCesiumIonToken
          ? t({
              zh: "白天底图和地形走示例图源配置。夜光是 Black Marble（Ion 3812）。",
              en: "Daytime imagery and terrain follow the example map profile. Night lights are Black Marble (Ion 3812).",
            })
          : t({
              zh: "白天底图和地形走示例图源配置。夜光 Black Marble 需要右上角设置里的 Cesium Ion token，填写后刷新。",
              en: "Daytime imagery and terrain follow the example map profile. Black Marble night lights need the Cesium Ion token in Settings; paste it and reload.",
            }),
      },
    },
  }) as const

function bindPanelInteractions(
  currentPanel: TelluxPanel<ReturnType<typeof overlaySchema>>
) {
  const { controls } = currentPanel
  return controls.effect(() => {
    dayLayer?.setStyle({
      opacity: controls.day.opacity,
      dayOpacity: controls.day.dayOpacity,
      nightOpacity: controls.day.nightOpacity,
    })
    nightLayer?.setStyle({
      opacity: controls.night.opacity,
      dayOpacity: controls.night.dayOpacity,
      nightOpacity: controls.night.nightOpacity,
    })
    viewer.clock.shouldAnimate = controls.clock.playing
    viewer.clock.multiplier = controls.clock.multiplier
  })
}

createTelluxPanel(overlaySchema, {
  id: "earth-at-night",
  title: () => t({ zh: "昼夜影像", en: "Day / night overlays" }),
  statusPath: "status.message",
  onRebuild: bindPanelInteractions,
})

window.addEventListener("beforeunload", () => {
  viewer.destroy()
})
