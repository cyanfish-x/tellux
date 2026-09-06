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

const FOCUS_LONGITUDE = 121.4737
const FOCUS_LATITUDE = 31.2304
const SURFACE_OFFSET = 50

const viewer = new tellux.Viewer(container, {
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  overlays: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  camera: {
    destination: {
      longitude: 121.47150658039027,
      latitude: 31.213287073562483,
      height: 2064.8970060099077,
    },
    orientation: {
      heading: 7.57778279899678,
      pitch: -47.26511725121502,
      roll: -0.000010753896468325056,
    },
  },
  scene: {
    atmosphere: {
      show: true,
      lighting: {
        mode: "light-source",
      },
      fallbackAmbientLight: {
        intensity: 0.8,
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

let panel: TelluxPanel | undefined

const pointPositions: Array<[number, number, string]> = [
  [FOCUS_LONGITUDE - 0.008, FOCUS_LATITUDE + 0.004, t({ zh: "节点 A", en: "Node A" })],
  [FOCUS_LONGITUDE + 0.006, FOCUS_LATITUDE + 0.006, t({ zh: "节点 B", en: "Node B" })],
  [FOCUS_LONGITUDE + 0.01, FOCUS_LATITUDE - 0.003, t({ zh: "节点 C", en: "Node C" })],
  [FOCUS_LONGITUDE - 0.004, FOCUS_LATITUDE - 0.007, t({ zh: "节点 D", en: "Node D" })],
]

pointPositions.forEach(([longitude, latitude, label], index) => {
  viewer.entities.add({
    id: `point-${index}`,
    position: [longitude, latitude, SURFACE_OFFSET],
    point: {
      pixelSize: 12,
      color: index === 0 ? "#ffd166" : "#38bdf8",
      outline: { color: "#0f172a", width: 2 },
    },
    properties: { kind: "point", label },
  })
})

const polylinePositions = pointPositions.map(
  ([longitude, latitude]) =>
    [longitude, latitude, SURFACE_OFFSET] as [number, number, number]
)
viewer.entities.add({
  id: "route-polyline",
  polyline: {
    positions: polylinePositions,
    width: 3,
    color: "#f472b6",
  },
  properties: { kind: "polyline", label: t({ zh: "游览路径", en: "Tour route" }) },
})

viewer.entities.add({
  id: "zone-polygon",
  polygon: {
    positions: [
      [FOCUS_LONGITUDE - 0.012, FOCUS_LATITUDE + 0.008, 0],
      [FOCUS_LONGITUDE + 0.014, FOCUS_LATITUDE + 0.008, 0],
      [FOCUS_LONGITUDE + 0.014, FOCUS_LATITUDE - 0.01, 0],
      [FOCUS_LONGITUDE - 0.012, FOCUS_LATITUDE - 0.01, 0],
    ],
    height: SURFACE_OFFSET,
    fill: true,
    color: "rgba(45, 212, 191, 0.35)",
    outline: { color: "#5eead4" },
  },
  properties: { kind: "polygon", label: t({ zh: "规划区块", en: "Planning zone" }) },
})

viewer.entities.add({
  id: "block-extruded",
  polygon: {
    positions: [
      [FOCUS_LONGITUDE - 0.002, FOCUS_LATITUDE - 0.0015, 0],
      [FOCUS_LONGITUDE + 0.002, FOCUS_LATITUDE - 0.0015, 0],
      [FOCUS_LONGITUDE + 0.002, FOCUS_LATITUDE + 0.0015, 0],
      [FOCUS_LONGITUDE - 0.002, FOCUS_LATITUDE + 0.0015, 0],
    ],
    height: SURFACE_OFFSET,
    extrudeHeight: SURFACE_OFFSET + 300,
    fill: true,
    color: "rgba(244, 114, 182, 0.55)",
    outline: { color: "#f9a8d4" },
  },
  properties: { kind: "extruded", label: t({ zh: "拉伸体块", en: "Extruded block" }) },
})

function setStatus(message: string) {
  panel?.setStatus(message)
}

function setPickReadout(message: string) {
  if (!panel) return
  panel.controls.status.pick = message
}

const entitiesSchema = () =>
  ({
    display: {
      $: { label: t({ zh: "显示", en: "Display" }) },
      hint: {
        type: "hint" as const,
        value: t({
          zh: "通过 viewer.entities.add() 绘制点、折线、多边形和拉伸体块。",
          en: "Draw points, polylines, polygons and extruded blocks via viewer.entities.add().",
        }),
      },
      points: {
        value: true,
        label: t({ zh: "点位", en: "Points" }),
      },
      polyline: {
        value: true,
        label: t({ zh: "折线", en: "Polyline" }),
      },
      polygon: {
        value: true,
        label: t({ zh: "面块", en: "Polygons" }),
      },
      clear: {
        onClick: () => {
          viewer.entities.removeAll()
          setStatus(t({ zh: "已清空所有实体。", en: "All entities cleared." }))
        },
        label: t({ zh: "清空实体", en: "Clear entities" }),
      },
    },
    status: {
      $: { label: t({ zh: "状态", en: "Status" }) },
      message: {
        type: "hint" as const,
        value: t(
          {
            zh: "已绘制 {n} 个点位 + 1 条折线 + 2 个多边形（含 1 个拉伸体块）。",
            en: "Drew {n} points + 1 polyline + 2 polygons (including 1 extruded block).",
          },
          { n: pointPositions.length }
        ),
      },
      pick: {
        type: "hint" as const,
        label: t({ zh: "拾取", en: "Pick" }),
        value: t({ zh: "点击任意实体查看属性", en: "Click an entity to inspect properties" }),
      },
    },
  }) as const

function bindPanelInteractions(
  currentPanel: TelluxPanel<ReturnType<typeof entitiesSchema>>
) {
  const { controls } = currentPanel
  const cleanups: Array<() => void> = []

  cleanups.push(
    controls.effect(() => {
      void controls.display.points
      const visible = controls.display.points
      pointPositions.forEach((_, index) => {
        const entity = viewer.entities.getById(`point-${index}`)
        if (entity) entity.show = visible
      })
      setStatus(
        t(
          { zh: "点位已{state}。", en: "Points are {state}." },
          {
            state: visible
              ? t({ zh: "显示", en: "shown" })
              : t({ zh: "隐藏", en: "hidden" }),
          }
        )
      )
    })
  )

  cleanups.push(
    controls.effect(() => {
      void controls.display.polyline
      const entity = viewer.entities.getById("route-polyline")
      if (entity) entity.show = controls.display.polyline
    })
  )

  cleanups.push(
    controls.effect(() => {
      void controls.display.polygon
      const visible = controls.display.polygon
      const zone = viewer.entities.getById("zone-polygon")
      const block = viewer.entities.getById("block-extruded")
      if (zone) zone.show = visible
      if (block) block.show = visible
      setStatus(
        t(
          { zh: "面块已{state}。", en: "Polygons are {state}." },
          {
            state: visible
              ? t({ zh: "显示", en: "shown" })
              : t({ zh: "隐藏", en: "hidden" }),
          }
        )
      )
    })
  )

  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}

panel = createTelluxPanel(entitiesSchema, {
  id: "entities-panel",
  title: () => t({ zh: "实体绘制", en: "Entity drawing" }),
  statusPath: "status.message",
  onRebuild: bindPanelInteractions,
})

viewer.on("click", (event) => {
  const pickedEntity =
    event.pick?.type === "entity" ? event.pick.entity : null
  if (!pickedEntity) {
    setPickReadout(t({ zh: "未命中实体", en: "No entity hit" }))
    return
  }

  const { entity } = pickedEntity
  const label = (entity.properties.label as string) ?? entity.id
  const kind = (entity.properties.kind as string) ?? "unknown"
  setPickReadout(
    t(
      {
        zh: "命中：{label}（类型：{kind}，id：{id}）",
        en: "Hit: {label} (type: {kind}, id: {id})",
      },
      { label, kind, id: entity.id }
    )
  )
})

window.addEventListener("beforeunload", () => {
  locationReadout.destroy()
  panel?.dispose()
  viewer.destroy()
})
