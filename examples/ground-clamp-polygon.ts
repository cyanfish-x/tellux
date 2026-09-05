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

const CONCAVE_RING: Array<[number, number]> = [
  [-112.15, 36.06],
  [-112.1, 36.06],
  [-112.1, 36.085],
  [-112.125, 36.085],
  [-112.125, 36.11],
  [-112.15, 36.11],
]

const REFERENCE_HEIGHT = 2200
const REFERENCE_OFFSET_LON = 0.06

const viewer = new tellux.Viewer(container, {
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  overlays: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  camera: {
    destination: {
      longitude: -112.1,
      latitude: 36.0,
      height: 6500,
    },
    orientation: {
      heading: 352,
      pitch: -32,
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
  id: "clamp-zone",
  polygon: {
    positions: CONCAVE_RING,
    clamp: true,
    color: "rgba(34, 211, 238, 0.5)",
  },
  properties: { kind: "clamp", label: t({ zh: "贴地面", en: "Clamped polygon" }) },
})

viewer.entities.add({
  id: "reference-zone",
  polygon: {
    positions: CONCAVE_RING.map(
      ([lon, lat]) => [lon + REFERENCE_OFFSET_LON, lat] as [number, number]
    ),
    height: REFERENCE_HEIGHT,
    color: "rgba(250, 204, 21, 0.5)",
    outline: { color: "#fde047" },
  },
  properties: {
    kind: "reference",
    label: t({ zh: "固定高平面", en: "Fixed-height plane" }),
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
    zh: "青色凹多边形贴合峡谷地形（缺口镂空）；黄色同形面固定高度，悬空于峡谷之上。",
    en: "Cyan concave polygon follows canyon (with hole); yellow same shape at fixed height.",
  })
}

const groundClampPolygonSchema = () =>
  ({
    display: {
      $: { label: t({ zh: "显示", en: "Display" }) },
      hint: {
        type: "hint" as const,
        value: t({
          zh: "polygon.clamp: true 支持凹多边形贴地；青色为贴地凹多边形，黄色为固定高对比平面。",
          en: "polygon.clamp: true supports concave polygon clamp; cyan = clamped, yellow = fixed-height reference.",
        }),
      },
      clamp: {
        value: true,
        label: t({ zh: "贴地面", en: "Clamped polygon" }),
      },
      reference: {
        value: true,
        label: t({ zh: "固定高平面", en: "Fixed-height plane" }),
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

function bindPanelInteractions(
  currentPanel: TelluxPanel<ReturnType<typeof groundClampPolygonSchema>>
) {
  const { controls } = currentPanel
  const cleanups: Array<() => void> = []

  cleanups.push(
    controls.effect(() => {
      void controls.display.clamp
      const entity = viewer.entities.getById("clamp-zone")
      if (entity) entity.show = controls.display.clamp
    })
  )

  cleanups.push(
    controls.effect(() => {
      void controls.display.reference
      const entity = viewer.entities.getById("reference-zone")
      if (entity) entity.show = controls.display.reference
    })
  )

  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}

const panel = createTelluxPanel(groundClampPolygonSchema, {
  id: "ground-clamp-polygon-panel",
  title: () => t({ zh: "贴地面", en: "Ground-clamped polygon" }),
  statusPath: "status.message",
  onRebuild: bindPanelInteractions,
})

window.addEventListener("beforeunload", () => {
  locationReadout.destroy()
  panel.dispose()
  viewer.destroy()
})
