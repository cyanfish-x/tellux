import tellux from "../src"
import * as THREE from "three"
import { bootExampleI18n, t } from "./i18n"
import { exampleMapServiceConfig } from "./shared"
import { mountLocationReadout } from "./location-readout"
import { createTelluxPanel, type TelluxPanel } from "./example-panel-leva"
import {
  computeSunAltitudeAtLocation,
  isNightLightsOn,
  setupLittlestTokyoNightRig,
  type LittlestTokyoNightRig,
} from "./littlest-tokyo-night"

bootExampleI18n()

const MODEL_LONGITUDE = 113.9958
const MODEL_LATITUDE = 30.0072
const MODEL_HEIGHT = 0
const MODEL_URL = "https://threejs.org/examples/models/gltf/LittlestTokyo.glb"
const EMISSIVE_TEXTURE_URL = "/littlest-tokyo/emissive.jpg"

const container = document.querySelector("#viewer")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

void main().catch((error) => console.error(error))

async function main() {
  const initialClockTime = new Date()
  initialClockTime.setHours(22, 0, 0, 0)

  const viewer = await tellux.Viewer.create(container, {
    renderer: {
      type: "webgpu",
    },
    clock: {
      currentTime: initialClockTime,
    },
    terrain: exampleMapServiceConfig.createTerrainOptions(),
    overlays: [
      {
        source: exampleMapServiceConfig.createImagerySource(),
      },
    ],
    camera: {
      destination: {
        longitude: MODEL_LONGITUDE,
        latitude: MODEL_LATITUDE,
        height: 3500,
      },
      orientation: {
        heading: -35,
        pitch: -28,
      },
      projection: {
        far: 40000000,
      },
    },
    scene: {
      atmosphere: {
        show: true,
        lighting: {
          mode: "light-source",
          sunLight: true,
          skyLight: true,
          photometric: {
            enabled: true,
            sunIlluminance: 111000,
          },
        },
        night: {
          enabled: true,
          moonLight: true,
          ambientLight: true,
        },
        fallbackAmbientLight: {
          enabled: false,
        },
        sky: {
          stars: {
            show: true,
          },
        },
      },
      clouds: {
        show: false,
      },
    },
    postProcess: {
      toneMappingExposure: 10,
      autoExposure: {
        enabled: true,
        min: 2,
        max: 10,
        speed: 1.2,
      },
      // 对齐上游 Non-geospatial：不开 Bloom。镜头光晕自带 mipmap 模糊，也会像泛光。
      bloom: false,
      lensFlare: true,
      taa: true,
    },
    highlighter: {
      outline: {
        enabled: false,
      },
    },
    widgets: {
      timeline: {
        // 滑块即时显示目标时间；太阳和夜景灯光共同跟随 spring 平滑后的 clock。
        // Show the target immediately; sun and night lights follow the spring-smoothed clock.
        spring: true,
      },
    },
  })

  ;(window as any).viewer = viewer

  let isAnimationPlaying = true
  let model: ReturnType<typeof viewer.models.add> | null = null
  let nightRig: LittlestTokyoNightRig | null = null
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
    panel.setFieldDisabled("lights.brightness", disabled)
  }

  function resolveNightLightGain() {
    return panel?.controls.lights.brightness ?? 1
  }

  function flyToModel() {
    if (!model) return
    viewer.flyToTarget(model.root, {
      offset: { heading: -30, pitch: -10, distance: 280 },
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

  function syncNightLightsFromSun() {
    if (!nightRig) return

    const sunAltitude = computeSunAltitudeAtLocation(
      MODEL_LONGITUDE,
      MODEL_LATITUDE,
      viewer.clock.currentTime
    )
    nightRig.setLightIntensity(isNightLightsOn(sunAltitude) * resolveNightLightGain())
  }

  function handleClockUpdate() {
    syncNightLightsFromSun()
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
      if (sampledPosition === undefined) {
        setStatus(
          t({
            zh: "离屏采样地形高度未命中，已取消模型加载。",
            en: "Offscreen terrain sample missed; model load cancelled.",
          })
        )
        setReadyStatus(t({ zh: "地形高度未命中", en: "Terrain height missed" }))
        return
      }
      modelHeight = sampledPosition
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

    const emissiveMap = await new THREE.TextureLoader().loadAsync(EMISSIVE_TEXTURE_URL)
    emissiveMap.colorSpace = THREE.SRGBColorSpace
    emissiveMap.flipY = false

    model = viewer.models.add({
      type: "gltf",
      id: "littlest-tokyo",
      url: MODEL_URL,
      coordinates: [MODEL_LONGITUDE, MODEL_LATITUDE, modelHeight],
      scale: 0.45,
      heading: 160,
      alignToGround: true,
      materialMode: "preserve",
      lighting: "local",
      animate: true,
    })

    try {
      const layer = await model.ready
      nightRig = setupLittlestTokyoNightRig(layer.model ?? layer.root, emissiveMap)
      syncNightLightsFromSun()
      setReadyStatus(
        t({ zh: "{n} 个动画通道", en: "{n} animation clip(s)" }, { n: layer.animations.length })
      )
      setActionDisabled(false)
      flyToModel()
      setStatus(
        t(
          {
            zh: "Littlest Tokyo 已加入场景；已挂载 {n} 个夜景材质、{l} 盏模型灯光。拖动时间轴切换昼夜。",
            en: "Littlest Tokyo added; attached {n} night emissive material(s) and {l} model light(s). Scrub the timeline for day/night.",
          },
          {
            n: nightRig.emissiveMaterials.length,
            l: nightRig.lights.length,
          }
        )
      )
    } catch (error) {
      console.error(error)
      emissiveMap.dispose()
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
              zh: "本页使用 WebGPU 与 TAA。对齐 Cesium for Unreal 动态光照：灯一直开、白天被太阳冲淡、夜里广告牌和点光成为主体。拖时间轴，曝光随太阳高度走。",
              en: "This page uses WebGPU and TAA. Matches Cesium for Unreal dynamic lighting: lights stay on, daylight washes them out, and at night the signs and point lights take over. Scrub the timeline; exposure follows sun altitude.",
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
      lights: {
        $: { label: t({ zh: "灯光", en: "Lights" }) },
        brightness: {
          value: 1,
          min: 0,
          max: 4,
          step: 0.05,
          label: t({ zh: "光源亮度", en: "Light brightness" }),
        },
      },
      readout: {
        $: { label: t({ zh: "信息", en: "Info" }) },
        api: {
          type: "hint" as const,
          label: "API",
          value: "viewer.models.add",
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
      void currentPanel.controls.lights.brightness
      syncAnimationFromPanel()
      syncNightLightsFromSun()
    })
  }

  panel = createTelluxPanel(interopSchema, {
    id: "threejs-interop-panel",
    title: () => t({ zh: "Three.js 原生互操作", en: "Three.js interop" }),
    statusPath: "status.message",
    onRebuild: bindPanelInteractions,
  })

  viewer.clock.on("change", handleClockUpdate)
  viewer.clock.on("tick", handleClockUpdate)
  setActionDisabled(true)
  void loadModelOnSampledGround()

  viewer.on("click", (event) => {
    if (!model) {
      viewer.highlighter.clear()
      return
    }

    // 传入 root 时默认只测 object 层，避免地形 / 瓦片抢先命中
    const hit = viewer.pick(event.position, { root: model.root })
    if (hit?.type === "object") {
      viewer.highlighter.set(model.root)
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
      viewer.highlighter.clear()
      setStatus(
        t({ zh: "未命中模型，已清除高亮。", en: "No model hit; highlight cleared." })
      )
    }
  })

  window.addEventListener("beforeunload", () => {
    viewer.clock.off("change", handleClockUpdate)
    viewer.clock.off("tick", handleClockUpdate)
    nightRig?.dispose()
    locationReadout.destroy()
    panel?.dispose()
    viewer.destroy()
  })
}
