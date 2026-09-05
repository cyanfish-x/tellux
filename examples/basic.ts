import tellux from "../src"
import { bootExampleI18n } from "./i18n"
import { exampleMapServiceConfig } from "./shared"

bootExampleI18n()

const viewer = new tellux.Viewer("viewer", {
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  overlays: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  camera: {
    destination: {
      longitude: -82,
      latitude: 48,
      height: 12000000,
    },
    orientation: {
      heading: 0,
      pitch: -90,
    },
    projection: {
      far: 30000000,
    },
  },
  scene: {
    atmosphere: {
      lighting: {
        mode: "light-source",
      },
    },
    clouds: {
      show: false,
    },
  },
})

;(window as any).viewer = viewer

window.addEventListener("beforeunload", () => {
  viewer.destroy()
})
