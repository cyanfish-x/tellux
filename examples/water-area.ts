import tellux from "../src"
import { bootExampleI18n } from "./i18n"
import { setupWaterAreaPanel } from "./water-area/setupWaterAreaPanel"

const WATER_AREA_VIEW = {
  latitude: 57.01944780700264,
  longitude: -132.91669016841638,
  height: 404.4714851389597,
  heading: 57.090078519217464,
  pitch: 1.7434647918138277,
  roll: -0.000009369041331049295,
}

const WATER_AREA_UTC_TIME = new Date(Date.UTC(2026, 7, 23, 15, 12, 18))

const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""

bootExampleI18n()

void main().catch((error) => console.error(error))

async function main() {
  const attributionsElement = document.querySelector<HTMLElement>(
    "#google-attributions"
  )
  if (!attributionsElement) {
    throw new Error("Water-area attributions element not found.")
  }

  const viewer = await tellux.Viewer.create("viewer", {
    renderer: {
      type: "webgpu",
    },
    camera: {
      destination: {
        longitude: WATER_AREA_VIEW.longitude,
        latitude: WATER_AREA_VIEW.latitude,
        height: WATER_AREA_VIEW.height,
      },
      orientation: {
        heading: WATER_AREA_VIEW.heading,
        pitch: WATER_AREA_VIEW.pitch,
        roll: WATER_AREA_VIEW.roll,
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
          sunLight: true,
          skyLight: true,
        },
      },
      clouds: {
        show: false,
      },
    },
    postProcess: {
      toneMappingExposure: 5,
    },
    widgets: {
      timeline: true,
    },
  })

  ;(window as any).viewer = viewer
  viewer.clock.currentTime = WATER_AREA_UTC_TIME

  const panelHandle = setupWaterAreaPanel({
    viewer,
    defaultIonToken: DEFAULT_ION_TOKEN,
    attributionsElement,
    onDemoChange: (demo) => {
      ;(window as any).waterAreaDemo = demo
    },
  })

  window.addEventListener("beforeunload", () => {
    void panelHandle.dispose()
    viewer.destroy()
  })
}
