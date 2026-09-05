import tellux from "../src"
import { bootExampleI18n, t } from "./i18n"
import { createTelluxPanel } from "./example-panel-leva"
import { exampleMapServiceConfig } from "./shared"

bootExampleI18n()

const container = document.querySelector("#viewer")

const initialDaytimeHourUTC = 5

const dujiangyanView = {
  latitude: 31.025122345612274,
  longitude: 103.55132903720038,
  height: 2003.9716012054323,
  heading: -122.64353116544416,
  pitch: -14.837941851547878,
  roll: 0.00004662245553609294,
  clouds: {
    layerAltitude: 2500,
    layerHeight: 650,
  },
}

const himalayaView = {
  latitude: 27.98,
  longitude: 86.92,
  height: 6500,
  heading: -40,
  pitch: -16,
  roll: 0,
  clouds: {
    layerAltitude: 8500,
    layerHeight: 200,
  },
}

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

const initialClockTime = new Date()
initialClockTime.setUTCHours(initialDaytimeHourUTC, 0, 0, 0)

const viewer = new tellux.Viewer(container, {
  clock: {
    currentTime: initialClockTime,
  },
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  overlays: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  camera: {
    destination: {
      longitude: dujiangyanView.longitude,
      latitude: dujiangyanView.latitude,
      height: dujiangyanView.height,
    },
    orientation: {
      heading: dujiangyanView.heading,
      pitch: dujiangyanView.pitch,
      roll: dujiangyanView.roll,
    },
    projection: {
      far: 8000000,
    },
  },
  scene: {
    atmosphere: {
      show: true,
      lighting: {
        mode: "post-process",
      },
    },
    clouds: {
      show: true,
      coverage: 0.35,
    },
  },
  widgets: {
    timeline: {
      linkCloudSpeed: true,
    },
  },
  renderer: {
    resolutionScale: 1,
  },
})

viewer.scene.clouds.layer.altitude = dujiangyanView.clouds.layerAltitude
viewer.scene.clouds.layer.height = dujiangyanView.clouds.layerHeight
;(window as any).viewer = viewer

function applyLocationView(view: typeof dujiangyanView | typeof himalayaView) {
  viewer.scene.clouds.layer.altitude = view.clouds.layerAltitude
  viewer.scene.clouds.layer.height = view.clouds.layerHeight
  viewer.camera.flyTo({
    destination: {
      latitude: view.latitude,
      longitude: view.longitude,
      height: view.height,
    },
    orientation: {
      heading: view.heading,
      pitch: view.pitch,
      roll: view.roll,
    },
  })
}

const atmosphereSchema = () =>
  ({
    place: {
      $: { label: t({ zh: "地点", en: "Places" }) },
      hint: {
        type: "hint" as const,
        value: t({
          zh: "使用右上角公共设置面板调整大气、体积云、日期、光照和曝光。",
          en: "Use the top-right shared settings panel for atmosphere, clouds, date, lighting, and exposure.",
        }),
      },
      dujiangyan: {
        onClick: () => applyLocationView(dujiangyanView),
        label: t({ zh: "紫坪铺水库", en: "Zipingpu Reservoir" }),
      },
      himalaya: {
        onClick: () => applyLocationView(himalayaView),
        label: t({ zh: "喜马拉雅", en: "Himalaya" }),
      },
    },
  }) as const

const panel = createTelluxPanel(atmosphereSchema, {
  id: "atmosphere-panel",
  title: () => t({ zh: "体积云与大气", en: "Volumetric clouds & atmosphere" }),
})

window.addEventListener("beforeunload", () => {
  panel.dispose()
  viewer.destroy()
})
