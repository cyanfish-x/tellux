import tellux from "../src"
import { exampleMapServiceConfig } from "./shared"

const viewer = new tellux.Viewer("viewer", {
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  layers: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  camera: {
    latitude: 48,
    longitude: -82,
    height: 12000000,
    heading: 0,
    pitch: -90,
    far: 30000000,
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
