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
  dracoDecoderPath: "/draco/gltf/",
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

const modelCoordinatesText = t("example.threejs-interop.coords.text", {
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
    ? t("example.threejs-interop.btn.pause")
    : t("example.threejs-interop.btn.play")
}

async function loadModelOnSampledGround() {
  setStatus(t("example.threejs-interop.status.sampling"))
  if (modelStatusElement) {
    modelStatusElement.textContent = t("example.threejs-interop.readout.sampling")
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
      setStatus(t("example.threejs-interop.status.noHit"))
      if (modelStatusElement) {
        modelStatusElement.textContent = t("example.threejs-interop.readout.noHit")
      }
      return
    }
    modelHeight = sampledPosition[2]
  } catch (error) {
    console.warn("Failed to sample terrain height before loading model.", error)
    setStatus(t("example.threejs-interop.status.sampleFail"))
    if (modelStatusElement) {
      modelStatusElement.textContent = t("example.threejs-interop.readout.sampleFail")
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
      modelStatusElement.textContent = t("example.threejs-interop.readout.anims", { n: layer.animations.length })
    }
    flyToModelButton.disabled = false
    toggleAnimationButton.disabled = false
    viewer.flyToTarget(model.root, {
      heading: -30,
      pitch: -10,
      distance: 500,
    })
    setStatus(
      t("example.threejs-interop.status.ready", { h: modelHeight.toFixed(2) })
    )
  } catch (error) {
    console.error(error)
    setStatus(t("example.threejs-interop.status.modelFail"))
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
      t("example.threejs-interop.status.picked", {
        name: hit.object.object.name || hit.object.object.type,
        d: hit.distance.toFixed(1),
      })
    )
  } else {
    viewer.highlight.clear()
    setStatus(t("example.threejs-interop.status.clearPick"))
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
