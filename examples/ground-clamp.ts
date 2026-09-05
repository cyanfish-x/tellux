import tellux from "../src"
import { bootExampleI18n, t } from "./i18n"
import { createTelluxPanel, type TelluxPanel } from "./example-panel-leva"
import { exampleMapServiceConfig } from "./shared"
import { mountLocationReadout } from "./location-readout"

bootExampleI18n()

const container = document.querySelector("#viewer")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

const ROUTE: Array<[number, number]> = [
  [-112.145, 36.045],
  [-112.125, 36.095],
  [-112.105, 36.14],
  [-112.085, 36.19],
]

const REFERENCE_HEIGHT = 2200

const viewer = new tellux.Viewer(container, {
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  overlays: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  camera: {
    destination: {
      longitude: -112.11,
      latitude: 36.005,
      height: 5200,
    },
    orientation: {
      heading: 4,
      pitch: -28,
      roll: 0,
    },
  },
  scene: {
    atmosphere: {
      show: true,
      lighting: {
        mode: "light-source",
      },
      fallbackAmbientLight: {
        intensity: 0.85,
      },
    },
    clouds: {
      show: false,
    },
  },
})

;(window as any).viewer = viewer

const locationReadout = mountLocationReadout(viewer, {
  parent: container.parentElement ?? document.body,
})

viewer.entities.add({
  id: "clamp-route",
  polyline: {
    positions: ROUTE,
    clamp: true,
    width: 60,
    color: "#22d3ee",
  },
  properties: { kind: "clamp", label: t({ zh: "贴地折线", en: "Clamped polyline" }) },
})

viewer.entities.add({
  id: "reference-route",
  polyline: {
    positions: ROUTE.map(
      ([lon, lat]) => [lon, lat, REFERENCE_HEIGHT] as [number, number, number]
    ),
    width: 3,
    color: "#facc15",
  },
  properties: {
    kind: "reference",
    label: t({ zh: "固定高折线", en: "Fixed-height polyline" }),
  },
})

function getInitialStatus() {
  if (!exampleMapServiceConfig.createTerrainOptions()) {
    return t({
      zh: "未配置默认地形服务，无地形数据，贴地效果不可见。",
      en: "No default terrain; clamp effect not visible.",
    })
  }
  return t({
    zh: "青色线贴合地形起伏；黄色线固定高，悬空穿越峡谷。",
    en: "Cyan follows terrain; yellow is fixed-height across the canyon.",
  })
}

const groundClampSchema = () =>
  ({
    display: {
      $: { label: t({ zh: "显示", en: "Display" }) },
      hint: {
        type: "hint" as const,
        value: t({
          zh: "polyline.clamp: true 依赖 GPU 深度分类贴地；青色为贴地折线，黄色为固定高对比折线。",
          en: "polyline.clamp: true uses GPU depth classification; cyan = clamped, yellow = fixed-height reference.",
        }),
      },
      clamp: {
        value: true,
        label: t({ zh: "贴地折线", en: "Clamped polyline" }),
      },
      reference: {
        value: true,
        label: t({ zh: "固定高折线", en: "Fixed-height polyline" }),
      },
    },
    status: {
      $: { label: t({ zh: "状态", en: "Status" }) },
      message: {
        type: "hint" as const,
        value: getInitialStatus(),
      },
    },
  }) as const

function bindPanelInteractions(currentPanel: TelluxPanel<ReturnType<typeof groundClampSchema>>) {
  const { controls } = currentPanel
  const cleanups: Array<() => void> = []

  cleanups.push(
    controls.effect(() => {
      void controls.display.clamp
      const entity = viewer.entities.getById("clamp-route")
      if (entity) entity.show = controls.display.clamp
    })
  )

  cleanups.push(
    controls.effect(() => {
      void controls.display.reference
      const entity = viewer.entities.getById("reference-route")
      if (entity) entity.show = controls.display.reference
    })
  )

  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}

const panel = createTelluxPanel(groundClampSchema, {
  id: "ground-clamp-panel",
  title: () => t({ zh: "贴地折线", en: "Ground-clamped polyline" }),
  statusPath: "status.message",
  onRebuild: bindPanelInteractions,
})

window.addEventListener("beforeunload", () => {
  locationReadout.destroy()
  panel.dispose()
  viewer.destroy()
})
