import tellux from "../src"
import { arcgisWorldImageryUrl } from "./shared"

const DEFAULT_ION_TERRAIN_ASSET_ID =
  import.meta.env.VITE_CESIUM_ION_TERRAIN_ASSET_ID ?? "1"
const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""

async function main() {
  const viewer = await tellux.Viewer.create("viewer", {
    renderer: {
      type: "webgpu",
    },
    terrain: DEFAULT_ION_TOKEN
      ? {
          type: "cesium-ion",
          assetId: DEFAULT_ION_TERRAIN_ASSET_ID,
          apiToken: DEFAULT_ION_TOKEN,
          tileLoading: {
            enableTileSplitting: true,
          },
        }
      : undefined,
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
        show: true,
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
}

void main()
