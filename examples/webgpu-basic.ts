import tellux from "../src"
import { arcgisWorldImageryUrl } from "./shared"

async function main() {
  const viewer = await tellux.Viewer.create("viewer", {
    renderer: {
      type: "webgpu",
    },
    layers: [
      {
        source: {
          type: "xyz",
          url: arcgisWorldImageryUrl,
          levels: 19,
        },
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
        show: false,
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
}

void main()
