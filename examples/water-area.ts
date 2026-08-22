import tellux from "../src"
import { setupExamplePanels } from "./example-panel"
import { bootExampleI18n, t } from "./i18n"
import {
  createWaterAreaDemo,
  type WaterAreaDemo,
} from "./water-area/createWaterAreaDemo"

const WATER_AREA_VIEW = {
  latitude: 69.3782,
  longitude: -112.2525,
  height: 100000,
  heading: 69,
  pitch: -38,
  roll: 0,
}

const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""

bootExampleI18n()
setupExamplePanels()

void main().catch((error) => console.error(error))

async function main() {
  const tokenInput = document.querySelector<HTMLInputElement>("#ion-token")
  const showInput =
    document.querySelector<HTMLInputElement>("#water-area-show")
  const statusElement =
    document.querySelector<HTMLElement>("#water-area-status")
  const attributionsElement = document.querySelector<HTMLElement>(
    "#google-attributions"
  )

  if (!tokenInput || !showInput || !statusElement || !attributionsElement) {
    throw new Error("Water-area controls not found.")
  }

  const viewer = await tellux.Viewer.create("viewer", {
    renderer: {
      type: "webgpu",
    },
    dracoDecoderPath: "/draco/",
    camera: {
      ...WATER_AREA_VIEW,
      far: 30000000,
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
      postProcess: {
        toneMappingExposure: 5,
      },
    },
  })

  ;(window as any).viewer = viewer
  viewer.tileset.group.visible = false
  viewer.clock.currentTime = new Date(Date.UTC(2026, 5, 19, 2, 42))

  tokenInput.value = ""
  tokenInput.placeholder = DEFAULT_ION_TOKEN
    ? t({
        zh: "留空使用 VITE_CESIUM_ION_TOKEN",
        en: "Leave empty to use VITE_CESIUM_ION_TOKEN",
      })
    : t({ zh: "输入 Cesium Ion token", en: "Enter Cesium Ion token" })

  let activeDemo: WaterAreaDemo | null = null
  let attributionFrame = 0
  let reloading = false

  const setStatus = (message: string): void => {
    statusElement.textContent = message
  }

  const renderAttributions = (): void => {
    const attributions = activeDemo?.layer.tileset.getAttributions() ?? []
    attributionsElement.replaceChildren()
    for (const attribution of attributions) {
      if (attribution.type === "image") {
        const image = document.createElement("img")
        image.src = String(attribution.value)
        image.alt = ""
        attributionsElement.append(image)
      } else if (attribution.value) {
        const item = document.createElement("span")
        item.innerHTML = String(attribution.value)
        attributionsElement.append(item)
      }
    }
    attributionFrame = window.requestAnimationFrame(renderAttributions)
  }

  const renderEffectStatus = (): void => {
    setStatus(
      showInput.checked
        ? t({
            zh: "水域 Mask 效果已显示：MVT 在 8 个 LIFO Worker 中解码与栅格化。",
            en: "Water mask effect shown: MVT decoding and rasterization run in eight LIFO workers.",
          })
        : t({
            zh: "水域 Mask 效果已隐藏；瓦片、Worker 与 Mask 缓存保持运行。",
            en: "Water mask effect hidden; tiles, workers, and the mask cache remain active.",
          })
    )
  }

  const reloadWaterArea = async (): Promise<void> => {
    if (reloading) return
    const apiToken = tokenInput.value.trim() || DEFAULT_ION_TOKEN
    if (!apiToken) {
      showInput.disabled = true
      setStatus(
        t({
          zh: "请输入 Cesium Ion token 后按 Enter，或在 .env 中配置 VITE_CESIUM_ION_TOKEN。",
          en: "Enter a Cesium Ion token and press Enter, or set VITE_CESIUM_ION_TOKEN.",
        })
      )
      return
    }

    reloading = true
    tokenInput.disabled = true
    showInput.disabled = true
    try {
      await activeDemo?.dispose()
      activeDemo = null
      activeDemo = createWaterAreaDemo({
        viewer,
        apiToken,
        show: showInput.checked,
      })
      ;(window as any).waterAreaDemo = activeDemo
      showInput.disabled = false
      renderEffectStatus()
    } catch (error) {
      showInput.disabled = true
      setStatus(error instanceof Error ? error.message : String(error))
      console.error(error)
    } finally {
      reloading = false
      tokenInput.disabled = false
    }
  }

  showInput.addEventListener("change", () => {
    if (!activeDemo) return
    activeDemo.show = showInput.checked
    renderEffectStatus()
  })
  tokenInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    void reloadWaterArea()
  })
  renderAttributions()

  if (DEFAULT_ION_TOKEN) {
    await reloadWaterArea()
  } else {
    showInput.disabled = true
    setStatus(
      t({
        zh: "输入 Cesium Ion token 后按 Enter 加载 Water Area 案例。",
        en: "Enter a Cesium Ion token and press Enter to load the Water Area example.",
      })
    )
  }

  window.addEventListener("beforeunload", () => {
    window.cancelAnimationFrame(attributionFrame)
    void activeDemo?.dispose()
    viewer.destroy()
  })
}
