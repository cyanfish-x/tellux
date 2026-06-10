import tellux from "../src"
import { arcgisWorldImageryUrl, defaultTerrainUrl } from "./shared"
import { mountLocationReadout } from "./location-readout"

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
  dracoDecoderPath: "/draco/gltf/",
  terrain: defaultTerrainUrl
    ? {
        url: defaultTerrainUrl,
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
      lighting: {
        mode: "light-source"
      },
      fallbackAmbientLight: {
        intensity: 0.8
      }
    },
    clouds: {
      show: false
    },
    postProcess: {
      toneMappingExposure: 7
    }
  },
})

;(window as any).viewer = viewer

let isAnimationPlaying = true
let model: ReturnType<typeof viewer.addModel> | null = null
const locationReadout = mountLocationReadout(viewer, {
  parent: container.parentElement ?? document.body,
})

flyToModelButton.disabled = true
toggleAnimationButton.disabled = true

const modelCoordinatesText = `经度 ${MODEL_LONGITUDE.toFixed(6)}、纬度 ${MODEL_LATITUDE.toFixed(6)}`
if (coordinatesTextElement) coordinatesTextElement.textContent = modelCoordinatesText
if (coordinatesElement) {
  coordinatesElement.textContent = `${MODEL_LONGITUDE.toFixed(6)}, ${MODEL_LATITUDE.toFixed(6)}`
}

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message
}

function updateAnimationButton() {
  toggleAnimationButton.textContent = isAnimationPlaying
    ? "暂停动画"
    : "播放动画"
}

async function loadModelOnSampledGround() {
  setStatus("正在离屏采样模型位置的地形高度...")
  if (modelStatusElement) {
    modelStatusElement.textContent = "采样地形高度中"
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
      setStatus("离屏采样地形高度未命中，已取消模型加载。")
      if (modelStatusElement) {
        modelStatusElement.textContent = "地形高度未命中"
      }
      return
    }
    modelHeight = sampledPosition[2]
  } catch (error) {
    console.warn("Failed to sample terrain height before loading model.", error)
    setStatus("离屏采样地形高度失败，已取消模型加载。")
    if (modelStatusElement) {
      modelStatusElement.textContent = "地形高度采样失败"
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
      modelStatusElement.textContent = `${layer.animations.length} 个动画通道`
    }
    flyToModelButton.disabled = false
    toggleAnimationButton.disabled = false
    viewer.flyToTarget(model.root, {
      heading: -30,
      pitch: -10,
      distance: 500,
    })
    setStatus(
      `Littlest Tokyo 已在采样高度 ${modelHeight.toFixed(2)} 米处加入场景，并自动播放第 0 个动画通道。`
    )
  } catch (error) {
    console.error(error)
    setStatus("模型加载失败，请检查网络或 three.js 示例资源是否可访问。")
  }
}

loadModelOnSampledGround()

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
