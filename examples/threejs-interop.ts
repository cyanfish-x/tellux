import tellux from "../src"
import type { Material, Mesh, MeshStandardMaterial, Object3D } from "three"
import { bootExampleI18n, t } from "./i18n"
import { exampleMapServiceConfig } from "./shared"
import { mountLocationReadout } from "./location-readout"
import { createTelluxPanel, type TelluxPanel } from "./example-panel-leva"

bootExampleI18n()

const MODEL_LONGITUDE = 113.9958
const MODEL_LATITUDE = 30.0072
const MODEL_HEIGHT = 0
const MODEL_URL = "https://threejs.org/examples/models/gltf/LittlestTokyo.glb"

const container = document.querySelector("#viewer")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

const viewer = new tellux.Viewer(container, {
  // 武汉当地 20:00（UTC+8），直接展示模型自发光在夜景中的效果。
  clock: {
    currentTime: "2026-09-01T12:00:00Z",
  },
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
      lighting: {
        mode: "light-source",
        skyLight: false,
      },
      fallbackAmbientLight: {
        show: false,
      },
    },
    clouds: {
      show: false,
    },
    postProcess: {
      toneMappingExposure: 1,
      bloom: {
        enabled: true,
        intensity: 2,
        luminanceThreshold: 0.8,
        luminanceSmoothing: 0.05,
        radius: 0.55,
      },
    },
    highlight: {
      outline: {
        enabled: true,
        color: "#7cff5b",
        edgeStrength: 2,
        xray: true,
      },
    },
  },
  widgets: {
    timeline: true,
  },
})

;(window as any).viewer = viewer

let isAnimationPlaying = true
let model: ReturnType<typeof viewer.addModel> | null = null
let emissiveMaterials: MeshStandardMaterial[] = []
let panel: TelluxPanel<ReturnType<typeof interopSchema>> | undefined
const locationReadout = mountLocationReadout(viewer, {
  parent: container.parentElement ?? document.body,
})

function setStatus(message: string) {
  panel?.setStatus(message)
}

function setReadyStatus(message: string) {
  if (panel) panel.controls.readout.animation = message
}

function setActionDisabled(disabled: boolean) {
  if (!panel) return
  panel.setFieldDisabled("actions.flyTo", disabled)
  panel.setFieldDisabled("actions.playing", disabled)
}

function flyToModel() {
  if (!model) return
  viewer.flyToTarget(model.root, {
    heading: -30,
    pitch: -10,
    distance: 280,
  })
}

function syncAnimationFromPanel() {
  if (!model || !panel) return
  isAnimationPlaying = panel.controls.actions.playing
  if (isAnimationPlaying) {
    model.playAnimation(0)
  } else {
    model.pauseAnimation()
  }
}

function syncBloomFromPanel() {
  if (!panel) return

  const bloom = panel.controls.bloom
  viewer.scene.postProcess.bloom.enabled = bloom.enabled
  viewer.scene.postProcess.bloom.intensity = bloom.intensity
  viewer.scene.postProcess.bloom.luminanceThreshold = bloom.luminanceThreshold
  viewer.scene.postProcess.bloom.radius = bloom.radius
  for (const material of emissiveMaterials) {
    material.emissiveIntensity = bloom.emissiveIntensity
  }
}

function isMeshStandardMaterial(material: Material): material is MeshStandardMaterial {
  return (material as MeshStandardMaterial).isMeshStandardMaterial === true
}

function collectEmissiveMaterials(root: Object3D) {
  const materials = new Set<MeshStandardMaterial>()
  root.traverse((object) => {
    if (!(object as Mesh).isMesh) return
    const material = (object as Mesh).material
    const entries = Array.isArray(material) ? material : [material]
    for (const entry of entries) {
      if (
        isMeshStandardMaterial(entry) &&
        (entry.emissiveMap !== null || entry.emissive.getHex() !== 0)
      ) {
        materials.add(entry)
      }
    }
  })
  return [...materials]
}

async function loadModelOnSampledGround() {
  setStatus(
    t({
      zh: "正在离屏采样模型位置的地形高度...",
      en: "Offscreen sampling terrain height at model position...",
    })
  )
  setReadyStatus(t({ zh: "采样地形高度中", en: "Sampling terrain height" }))

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
      setStatus(
        t({
          zh: "离屏采样地形高度未命中，已取消模型加载。",
          en: "Offscreen terrain sample missed; model load cancelled.",
        })
      )
      setReadyStatus(t({ zh: "地形高度未命中", en: "Terrain height missed" }))
      return
    }
    modelHeight = sampledPosition[2]
  } catch (error) {
    console.warn("Failed to sample terrain height before loading model.", error)
    setStatus(
      t({
        zh: "离屏采样地形高度失败，已取消模型加载。",
        en: "Offscreen terrain sample failed; model load cancelled.",
      })
    )
    setReadyStatus(
      t({ zh: "地形高度采样失败", en: "Terrain height sampling failed" })
    )
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
    materialMode: "preserve",
    animate: true,
  })

  try {
    const layer = await model.ready
    emissiveMaterials = collectEmissiveMaterials(layer.root)
    syncBloomFromPanel()
    setReadyStatus(
      t({ zh: "{n} 个动画通道", en: "{n} animation clip(s)" }, { n: layer.animations.length })
    )
    setActionDisabled(false)
    flyToModel()
    setStatus(
      t(
        {
          zh: "Littlest Tokyo 已在采样高度 {h} 米处加入场景；检测到 {n} 个自发光材质并启用夜景 Bloom。",
          en: "Littlest Tokyo added at sampled height {h} m; detected {n} emissive material(s) with night bloom enabled.",
        },
        { h: modelHeight.toFixed(2), n: emissiveMaterials.length }
      )
    )
  } catch (error) {
    console.error(error)
    setStatus(
      t({
        zh: "模型加载失败，请检查网络或 three.js 示例资源是否可访问。",
        en: "Model load failed; check network or Three.js example assets.",
      })
    )
  }
}

const interopSchema = () =>
  ({
    actions: {
      $: { label: t({ zh: "操作", en: "Actions" }) },
      hint: {
        type: "hint" as const,
        value: t(
          {
            zh: "加载 Three.js 官方 keyframes 模型，作为原生 Object3D 放到经度 {lon}、纬度 {lat} 的地表位置。",
            en: "Load the official Three.js keyframes model as a native Object3D at longitude {lon}, latitude {lat}.",
          },
          {
            lon: MODEL_LONGITUDE.toFixed(6),
            lat: MODEL_LATITUDE.toFixed(6),
          }
        ),
      },
      flyTo: {
        onClick: () => flyToModel(),
        label: t({ zh: "飞到模型", en: "Fly to model" }),
      },
      playing: {
        value: true,
        label: t({ zh: "播放动画", en: "Play animation" }),
      },
    },
    bloom: {
      $: { label: t({ zh: "夜景自发光", en: "Night emissive" }) },
      enabled: {
        value: true,
        label: t({ zh: "启用 Bloom", en: "Enable bloom" }),
      },
      intensity: {
        value: 2,
        min: 0,
        max: 4,
        step: 0.05,
        label: t({ zh: "Bloom 强度", en: "Bloom intensity" }),
      },
      luminanceThreshold: {
        value: 0.8,
        min: 0,
        max: 3,
        step: 0.05,
        label: t({ zh: "亮度阈值", en: "Luminance threshold" }),
      },
      radius: {
        value: 0.55,
        min: 0,
        max: 1,
        step: 0.05,
        label: t({ zh: "扩散半径", en: "Bloom radius" }),
      },
      emissiveIntensity: {
        value: 20,
        min: 0,
        max: 20,
        step: 0.5,
        label: t({ zh: "模型自发光", en: "Model emissive" }),
      },
    },
    readout: {
      $: { label: t({ zh: "信息", en: "Info" }) },
      api: {
        type: "hint" as const,
        label: "API",
        value: "viewer.addModel",
      },
      coords: {
        type: "hint" as const,
        label: t({ zh: "坐标", en: "Coordinates" }),
        value: `${MODEL_LONGITUDE.toFixed(6)}, ${MODEL_LATITUDE.toFixed(6)}`,
      },
      animation: {
        type: "hint" as const,
        label: t({ zh: "动画", en: "Animation" }),
        value: "-",
      },
    },
    status: {
      $: { label: t({ zh: "状态", en: "Status" }) },
      message: {
        type: "hint" as const,
        value: t({
          zh: "正在加载 Littlest Tokyo...",
          en: "Loading Littlest Tokyo...",
        }),
      },
    },
  }) as const

function bindPanelInteractions(
  currentPanel: TelluxPanel<ReturnType<typeof interopSchema>>
) {
  return currentPanel.controls.effect(() => {
    void currentPanel.controls.actions.playing
    void currentPanel.controls.bloom.enabled
    void currentPanel.controls.bloom.intensity
    void currentPanel.controls.bloom.luminanceThreshold
    void currentPanel.controls.bloom.radius
    void currentPanel.controls.bloom.emissiveIntensity
    syncAnimationFromPanel()
    syncBloomFromPanel()
  })
}

panel = createTelluxPanel(interopSchema, {
  id: "threejs-interop-panel",
  title: () => t({ zh: "Three.js 原生互操作", en: "Three.js interop" }),
  statusPath: "status.message",
  onRebuild: bindPanelInteractions,
})

setActionDisabled(true)
void loadModelOnSampledGround()

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
      t(
        {
          zh: "已选中模型（命中 {name}，距离 {d} m）。再次点击空白处取消。",
          en: "Model selected (hit {name}, distance {d} m). Click empty space to clear.",
        },
        {
          name: hit.object.object.name || hit.object.object.type,
          d: hit.distance.toFixed(1),
        }
      )
    )
  } else {
    viewer.highlight.clear()
    setStatus(
      t({ zh: "未命中模型，已清除高亮。", en: "No model hit; highlight cleared." })
    )
  }
})

window.addEventListener("beforeunload", () => {
  locationReadout.destroy()
  panel?.dispose()
  viewer.destroy()
})
