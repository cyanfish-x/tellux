import { createTelluxViewer } from "./shared"

const MODEL_LONGITUDE = 114
const MODEL_LATITUDE = 30
const MODEL_HEIGHT = 0
const MODEL_URL = "https://threejs.org/examples/models/gltf/LittlestTokyo.glb"

const container = document.querySelector("#viewer")
const statusElement = document.querySelector<HTMLElement>("#model-status")
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

const viewer = createTelluxViewer(container, {
  terrain: undefined,
  camera: {
    latitude: MODEL_LATITUDE,
    longitude: MODEL_LONGITUDE,
    height: 3500,
    heading: -35,
    pitch: -28,
    far: 40000000,
  },
  scene: {
    clouds: false,
    skyAtmosphere: true,
    atmosphereLightingMode: "light-source",
    toneMappingExposure: 7,
    fallbackAmbientLightIntensity: 0.8,
  },
})

const model = viewer.addModel({
  type: "gltf",
  id: "littlest-tokyo",
  url: MODEL_URL,
  coordinates: [MODEL_LONGITUDE, MODEL_LATITUDE, MODEL_HEIGHT],
  scale: 0.45,
  heading: 180,
  alignToGround: true,
  animate: true,
  animationChannel: 0,
})

let isAnimationPlaying = true

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message
}

function updateAnimationButton() {
  toggleAnimationButton.textContent = isAnimationPlaying
    ? "暂停动画"
    : "播放动画"
}

model.ready
  .then((layer) => {
    if (modelStatusElement) {
      modelStatusElement.textContent = `${layer.animations.length} 个动画通道`
      viewer.flyToTarget(model.root, {
        heading: -30,
        pitch: -10,
        distance: 500,
      })
    }
    setStatus(
      "Littlest Tokyo 已通过 viewer.addModel(...) 加入场景，并自动播放第 0 个动画通道。"
    )
  })
  .catch((error) => {
    console.error(error)
    setStatus("模型加载失败，请检查网络或 three.js 示例资源是否可访问。")
  })

flyToModelButton.addEventListener("click", () => {
  viewer.flyToTarget(model.root, {
    heading: -30,
    pitch: -10,
    distance: 500,
  })
})

toggleAnimationButton.addEventListener("click", () => {
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
  viewer.destroy()
})
