import tellux from "../src"
import { bootExampleI18n, t } from "./i18n"
import { exampleMapServiceConfig } from "./shared"
import { mountLocationReadout } from "./location-readout"
import { setupExamplePanels } from "./example-panel"

bootExampleI18n()
setupExamplePanels()

const MODEL_LONGITUDE = 113.9958  
const MODEL_LATITUDE = 30.0072
const MODEL_HEIGHT = 0
const MODEL_URL = "https://threejs.org/examples/models/gltf/LittlestTokyo.glb"

const container = document.querySelector("#viewer")
const statusElement = document.querySelector<HTMLElement>("#model-status")
const coordinatesTextElement = document.querySelector<HTMLElement>(
  "#model-coordinates-text"
)
const coordinatesElement = document.querySelector<HTMLElement>(
  "#model-coordinates"
)
const modelStatusElement = document.querySelector<HTMLElement>(
  "#model-ready-status"
)
const flyToModelButton =
  document.querySelector<HTMLButtonElement>("#fly-to-model")
const toggleAnimationButton =
  document.querySelector<HTMLButtonElement>("#toggle-animation")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

if (!flyToModelButton || !toggleAnimationButton) {
  throw new Error("Three.js interop controls not found.")
}

const viewer = new tellux.Viewer(container, {
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  layers: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  camera: {
    latitude: MODEL_LATITUDE,
    longitude: MODEL_LONGITUDE,
    height: 3500,
    heading: -35,
    pitch: -28,
    far: 40000000,
  },
  scene: {
    atmosphere: {
      show: true,
      fallbackAmbientLight: {
        intensity: 0.8
      }
    },
    clouds: {
      show: false
    },
    highlight: {
      outline: {
        enabled: true,
        color: "#7cff5b",
        edgeStrength: 2,
        xray: true
      }
    }
  },
  widgets:{
    timeline:true
  }
})

;(window as any).viewer = viewer

let isAnimationPlaying = true
let model: ReturnType<typeof viewer.addModel> | null = null
const locationReadout = mountLocationReadout(viewer, {
  parent: container.parentElement ?? document.body,
})

flyToModelButton.disabled = true
toggleAnimationButton.disabled = true

const modelCoordinatesText = t({ zh: "经度 {lon}、纬度 {lat}", en: "Longitude {lon}, latitude {lat}" }, {
  lon: MODEL_LONGITUDE.toFixed(6),
  lat: MODEL_LATITUDE.toFixed(6),
})
if (coordinatesTextElement) coordinatesTextElement.textContent = modelCoordinatesText
if (coordinatesElement) {
  coordinatesElement.textContent = `${MODEL_LONGITUDE.toFixed(6)}, ${MODEL_LATITUDE.toFixed(6)}`
}

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message
}

function updateAnimationButton() {
  toggleAnimationButton.textContent = isAnimationPlaying
    ? t({ zh: "暂停动画", en: "Pause animation" })
    : t({ zh: "播放动画", en: "Play animation" })
}

async function loadModelOnSampledGround() {
  setStatus(t({ zh: "正在离屏采样模型位置的地形高度...", en: "Offscreen sampling terrain height at model position..." }))
  if (modelStatusElement) {
    modelStatusElement.textContent = t({ zh: "采样地形高度中", en: "Sampling terrain height" })
  }

  let modelHeight = MODEL_HEIGHT
  try {
    const sampledPositions = await viewer.sampleHeightMostDetailed(
      [[MODEL_LONGITUDE, MODEL_LATITUDE]],
      {
        source: "terrain",
      }
    )
    const sampledPosition = sampledPositions[0]
    if (!sampledPosition) {
      setStatus(t({ zh: "离屏采样地形高度未命中，已取消模型加载。", en: "Offscreen terrain sample missed; model load cancelled." }))
      if (modelStatusElement) {
        modelStatusElement.textContent = t({ zh: "地形高度未命中", en: "Terrain height missed" })
      }
      return
    }
    modelHeight = sampledPosition[2]
  } catch (error) {
    console.warn("Failed to sample terrain height before loading model.", error)
    setStatus(t({ zh: "离屏采样地形高度失败，已取消模型加载。", en: "Offscreen terrain sample failed; model load cancelled." }))
    if (modelStatusElement) {
      modelStatusElement.textContent = t({ zh: "地形高度采样失败", en: "Terrain height sampling failed" })
    }
    return
  }

  model = viewer.addModel({
    type: "gltf",
    id: "littlest-tokyo",
    url: MODEL_URL,
    coordinates: [MODEL_LONGITUDE, MODEL_LATITUDE, modelHeight],
    scale: 0.45,
    heading: 160,
    alignToGround: true,
    animate: true,
  })

  try {
    const layer = await model.ready
    if (modelStatusElement) {
      modelStatusElement.textContent = t({ zh: "{n} 个动画通道", en: "{n} animation clip(s)" }, { n: layer.animations.length })
    }
    flyToModelButton.disabled = false
    toggleAnimationButton.disabled = false
    viewer.flyToTarget(model.root, {
      heading: -30,
      pitch: -10,
      distance: 500,
    })
    setStatus(
      t({ zh: "Littlest Tokyo 已在采样高度 {h} 米处加入场景，并自动播放第 0 个动画通道。", en: "Littlest Tokyo added at sampled height {h} m; playing animation channel 0." }, { h: modelHeight.toFixed(2) })
    )
  } catch (error) {
    console.error(error)
    setStatus(t({ zh: "模型加载失败，请检查网络或 three.js 示例资源是否可访问。", en: "Model load failed; check network or Three.js example assets." }))
  }
}

loadModelOnSampledGround()

viewer.on("click", (event) => {
  if (!model) {
    viewer.highlight.clear()
    return
  }

  // 传入 root 时默认只测 object 层，避免地形 / 瓦片抢先命中
  const hit = viewer.pick(event.position, { root: model.root })
  if (hit?.type === "object") {
    viewer.highlight.set(model.root)
    setStatus(
      t({ zh: "已选中模型（命中 {name}，距离 {d} m）。再次点击空白处取消。", en: "Model selected (hit {name}, distance {d} m). Click empty space to clear." }, {
        name: hit.object.object.name || hit.object.object.type,
        d: hit.distance.toFixed(1),
      })
    )
  } else {
    viewer.highlight.clear()
    setStatus(t({ zh: "未命中模型，已清除高亮。", en: "No model hit; highlight cleared." }))
  }
})

flyToModelButton.addEventListener("click", () => {
  if (!model) return

  viewer.flyToTarget(model.root, {
    heading: -30,
    pitch: -10,
    distance: 500,
  })
})

toggleAnimationButton.addEventListener("click", () => {
  if (!model) return

  isAnimationPlaying = !isAnimationPlaying
  if (isAnimationPlaying) {
    model.playAnimation(0)
  } else {
    model.pauseAnimation()
  }
  updateAnimationButton()
})

updateAnimationButton()

window.addEventListener("beforeunload", () => {
  locationReadout.destroy()
  viewer.destroy()
})
