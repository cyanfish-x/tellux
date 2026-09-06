import tellux from "../src"
import { bootExampleI18n } from "./i18n"
import { exampleMapServiceConfig } from "./shared"

bootExampleI18n()

async function main() {
  const viewer = await tellux.Viewer.create("viewer", {
    renderer: {
      type: "webgpu",
    },
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
        show: true,
        lighting: {
          mode: "light-source",
        },
        sky: {
          stars: true,
        },
      },
    clouds: {
        show: false,
      }
  },
  postProcess: {
        taa: true,
      },
  })

  ;(window as any).viewer = viewer

  window.addEventListener("beforeunload", () => {
    viewer.destroy()
  })
}

void main()
