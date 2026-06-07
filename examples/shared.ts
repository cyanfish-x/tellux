import tellux, {
  type ViewerOptions,
} from "../src"
import {
  applyInitialSettings,
  loadStoredExampleSettings,
  mountExampleSettingsPanel,
  type ExampleSettingsPanelOptions,
} from "./settings-panel/index"

export type { ExampleSettingsPanelOptions } from "./settings-panel/index"

const DEFAULT_TERRAIN_URL = import.meta.env.VITE_CESIUM_TERRAIN_URL ?? ""

tellux.baseUrl = "/tellux/"

export const arcgisWorldImageryUrl =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

export function createTelluxViewer(
  container: HTMLElement,
  options: ViewerOptions = {},
  settingsPanel: ExampleSettingsPanelOptions = {}
) {
  const layers = options.layers ?? [
    {
      source: {
        type: "xyz",
        url: arcgisWorldImageryUrl,
        levels: 19,
      },
    },
  ]
  const viewer = new tellux.Viewer(container, {
    dracoDecoderPath: "/draco/gltf/",
    terrain: DEFAULT_TERRAIN_URL
      ? {
          url: DEFAULT_TERRAIN_URL,
        }
      : undefined,
    ...options,
    layers,
  })
  const panelSettings = {
    ...settingsPanel,
    ...loadStoredExampleSettings(),
  }
  applyInitialSettings(viewer, panelSettings)
  mountExampleSettingsPanel(viewer, panelSettings)
  ;(window as any).viewer = viewer
  return viewer
}

export function showTokenNotice(element: HTMLElement | null) {
  if (!element) return

  element.textContent =
    "当前示例使用 XYZ 影像数据源加载 ArcGIS World Imagery。"
}
