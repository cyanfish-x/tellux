import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { Grass } from "three-stylized"
import tellux from "../src"
import type { ToneMappingMode } from "../src"
import { createTelluxPanel, type TelluxPanel } from "./example-panel-leva"
import { bootExampleI18n, t } from "./i18n"
import { exampleMapServiceConfig } from "./shared"
import {
  applyMeadowRtc,
  createMeadowRtc,
  setMeadowRtcOrigin,
} from "./atmosphere-local-meadow/applyMeadowRtc"

bootExampleI18n()

const container = document.querySelector("#viewer")
if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

/** 局部原点锚点（经纬高）。Local-origin geographic anchor. */
const LOCAL_MEADOW_ANCHOR = {
  longitude: 103.59408648396084,
  latitude: 31.017899106301737,
  height: 701.7311376109614,
} as const

const LOCAL_CAMERA_NEAR = 0.1
const LOCAL_CAMERA_FAR = 50_000
const localCameraPosition = new THREE.Vector3(14, 8, 16)
const localCameraTarget = new THREE.Vector3(0, 0.6, 0)

/** 打开地球后的 ECEF 视角。ECEF view used when the globe is shown. */
const GLOBE_VIEW = {
  destination: {
    longitude: 103.59430748839307,
    latitude: 31.01811875252709,
    height: 710.4785955899542,
  },
  orientation: {
    heading: -149.18744440098246,
    pitch: -11.36538673953464,
    roll: 0.000009914943654922439,
  },
} as const

const GLOBE_CAMERA_FAR = 8_000_000

const initialClockTime = new Date()
initialClockTime.setUTCHours(6, 30, 0, 0)

const viewer = new tellux.Viewer(container, {
  clock: {
    currentTime: initialClockTime,
  },
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  overlays: [
    {
      id: "imagery",
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  camera: {
    destination: {
      longitude: LOCAL_MEADOW_ANCHOR.longitude,
      latitude: LOCAL_MEADOW_ANCHOR.latitude,
      height: LOCAL_MEADOW_ANCHOR.height,
    },
    projection: {
      near: LOCAL_CAMERA_NEAR,
      far: LOCAL_CAMERA_FAR,
      fov: 55,
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
      sky: {
        // 无球时关闭大气地面项，避免地平线以下出现黑盘。
        // Without a globe, disable the atmospheric ground term to avoid a black disc.
        ground: false,
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
    toneMapping: {
      mode: "linear",
      exposure: 2.4,
    },
    lensFlare: true,
    smaa: true,
  },
  widgets: {
    timeline: true,
  },
  useDefaultRenderLoop: false,
})

viewer.globe.show = false
viewer.controls.enabled = false

// 整场景用 cartographicToMatrix4 的当地框架（+Y 上、+Z 前）作为世界。
// Use the cartographic object frame (+Y up, +Z forward) as the world basis.
const worldToECEF = viewer.cartographicToMatrix4(LOCAL_MEADOW_ANCHOR)
viewer.scene.atmosphere.setWorldToECEFMatrix(worldToECEF)

const meadow = new Grass({
  terrain: {
    width: 24,
    depth: 18,
    terrainDegree: 0.35,
    seed: 17,
    groundColor: "#557d24",
  },
  grass: {
    density: 36,
    wind: { strength: 0.2, direction: 45, speed: 1.1 },
    brightness: 0.4,
    colors: {
      bottom: "#4f7c13",
      top: "#b8da57",
    },
    blade: {
      minHeight: 0.7,
      maxHeight: 1.5,
    },
  },
  wildflowers: { enabled: true, density: 0.75 },
})
viewer.scene.raw.add(meadow)

const meadowRtc = createMeadowRtc(viewer.camera.raw)
const meadowEcefOrigin = new THREE.Vector3()
const meadowEcefQuaternion = new THREE.Quaternion()
const meadowEcefScale = new THREE.Vector3(1, 1, 1)
applyMeadowRtc(meadow, meadowRtc)

const meadowInitial = meadow.options

const camera = viewer.camera.raw
camera.up.set(0, 1, 0)
camera.position.copy(localCameraPosition)
camera.lookAt(localCameraTarget)
camera.updateProjectionMatrix()

const orbit = new OrbitControls(camera, viewer.renderer.raw.domElement)
orbit.enableDamping = true
orbit.dampingFactor = 0.06
orbit.target.copy(localCameraTarget)
orbit.minDistance = 4
orbit.maxDistance = 280
orbit.maxPolarAngle = Math.PI * 0.49

function setMeadowLocalFrame() {
  meadow.position.set(0, 0, 0)
  meadow.quaternion.identity()
  meadow.scale.set(1, 1, 1)
  meadowEcefOrigin.set(0, 0, 0)
  setMeadowRtcOrigin(meadowRtc, meadowEcefOrigin)
}

function setMeadowEcefFrame() {
  worldToECEF.decompose(meadowEcefOrigin, meadowEcefQuaternion, meadowEcefScale)
  meadow.position.set(0, 0, 0)
  meadow.quaternion.copy(meadowEcefQuaternion)
  meadow.scale.copy(meadowEcefScale)
  meadow.updateMatrixWorld(true)
  setMeadowRtcOrigin(meadowRtc, meadowEcefOrigin)
}

function restoreLocalCamera() {
  camera.up.set(0, 1, 0)
  camera.near = LOCAL_CAMERA_NEAR
  camera.far = LOCAL_CAMERA_FAR
  camera.position.copy(localCameraPosition)
  camera.lookAt(localCameraTarget)
  camera.updateProjectionMatrix()
  orbit.target.copy(localCameraTarget)
}

function applyGlobeMode(show: boolean) {
  viewer.globe.show = show
  if (!show) {
    viewer.controls.enabled = false
    setMeadowLocalFrame()
    viewer.scene.atmosphere.setWorldToECEFMatrix(worldToECEF)
    restoreLocalCamera()
    orbit.enabled = true
    return
  }

  orbit.enabled = false
  setMeadowEcefFrame()
  viewer.scene.atmosphere.setWorldToECEFMatrix(new THREE.Matrix4())
  camera.near = LOCAL_CAMERA_NEAR
  camera.far = GLOBE_CAMERA_FAR
  camera.updateProjectionMatrix()
  viewer.camera.setView(GLOBE_VIEW)
  viewer.controls.enabled = true
}

const clock = new THREE.Clock()
let disposed = false

viewer.renderer.raw.setAnimationLoop((time) => {
  if (disposed) return
  applyMeadowRtc(meadow, meadowRtc)
  meadowRtc.rtcUniforms.update()
  meadow.update(clock.getElapsedTime())
  const sun = findVisibleDirectionalLight(viewer.scene.raw)
  if (sun) meadow.syncDirectionalLight(sun)
  if (orbit.enabled) orbit.update()
  viewer.render(time)
})

let panel: TelluxPanel<ReturnType<typeof panelSchema>> | null = null

const panelSchema = () =>
  ({
    scene: {
      $: { label: t({ zh: "场景", en: "Scene" }) },
      globeShow: {
        value: viewer.globe.show,
        label: t({ zh: "地球", en: "Globe" }),
      },
      globeOpacity: {
        value: viewer.globe.opacity,
        min: 0,
        max: 1,
        step: 0.01,
        label: t({ zh: "地表透明度", en: "Globe opacity" }),
      },
      atmosphereShow: {
        value: viewer.scene.atmosphere.show,
        label: t({ zh: "大气", en: "Atmosphere" }),
      },
      skyGround: {
        value: viewer.scene.atmosphere.sky.ground,
        label: t({ zh: "大气地面", en: "Sky ground" }),
      },
    },
    toneMapping: {
      $: { label: t({ zh: "色调映射", en: "Tone mapping" }) },
      enabled: {
        value: viewer.postProcess.toneMapping.enabled,
        label: t({ zh: "启用", en: "Enabled" }),
      },
      mode: {
        value: viewer.postProcess.toneMapping.mode,
        options: {
          Linear: "linear",
          Reinhard: "reinhard",
          Cineon: "cineon",
          "ACES Filmic": "aces-filmic",
          AgX: "agx",
          Neutral: "neutral",
        },
        label: t({ zh: "算子", en: "Operator" }),
      },
      exposure: {
        value: viewer.postProcess.toneMapping.exposure,
        min: 0.1,
        max: 14,
        step: 0.1,
        label: t({ zh: "曝光", en: "Exposure" }),
      },
    },
    grass: {
      $: { label: t({ zh: "草地 (three-stylized)", en: "Grass (three-stylized)" }) },
      density: {
        value: meadowInitial.grass.density,
        min: 8,
        max: 80,
        step: 1,
        label: t({ zh: "密度", en: "Density" }),
      },
      brightness: {
        value: meadowInitial.grass.brightness,
        min: 0,
        max: 1,
        step: 0.01,
        label: t({ zh: "亮度", en: "Brightness" }),
      },
      bladeMaxHeight: {
        value: meadowInitial.grass.blade.maxHeight,
        min: 0.3,
        max: 2.4,
        step: 0.05,
        label: t({ zh: "草叶高度", en: "Blade height" }),
      },
      windStrength: {
        value: meadowInitial.grass.wind.strength,
        min: 0,
        max: 1,
        step: 0.01,
        label: t({ zh: "风力", en: "Wind strength" }),
      },
      windSpeed: {
        value: meadowInitial.grass.wind.speed,
        min: 0,
        max: 3,
        step: 0.05,
        label: t({ zh: "风速", en: "Wind speed" }),
      },
      windDirection: {
        value: meadowInitial.grass.wind.direction,
        min: 0,
        max: 360,
        step: 1,
        label: t({ zh: "风向 (°)", en: "Wind direction (°)" }),
      },
      bottomColor: {
        value: colorToHex(meadowInitial.grass.colors.bottom),
        label: t({ zh: "草根色", en: "Bottom color" }),
      },
      topColor: {
        value: colorToHex(meadowInitial.grass.colors.top),
        label: t({ zh: "草尖色", en: "Top color" }),
      },
      terrainDegree: {
        value: meadowInitial.terrain.terrainDegree,
        min: 0,
        max: 1,
        step: 0.01,
        label: t({ zh: "地形起伏", en: "Terrain degree" }),
      },
      terrainGroundColor: {
        value: colorToHex(meadowInitial.terrain.groundColor),
        label: t({ zh: "草地地表色", en: "Meadow ground color" }),
      },
      wildflowers: {
        value: meadowInitial.wildflowers.enabled,
        label: t({ zh: "野花", en: "Wildflowers" }),
      },
      wildflowerDensity: {
        value: meadowInitial.wildflowers.density,
        min: 0,
        max: 2,
        step: 0.05,
        label: t({ zh: "野花密度", en: "Wildflower density" }),
      },
    },
    status: {
      $: { label: t({ zh: "说明", en: "Notes" }) },
      message: {
        type: "hint" as const,
        value: t({
          zh: "默认藏球看局部草地。打开「地球」切到地球操作并飞到草地附近的预设视角；调低「地表透明度」可透过地形看到草地。",
          en: "Globe hidden by default for the local meadow. Toggling Globe switches to globe controls and a preset view by the meadow. Lower Globe opacity to see the meadow through the surface.",
        }),
      },
    },
  }) as const

panel = createTelluxPanel(panelSchema, {
  id: "atmosphere-local-meadow-panel",
  title: () =>
    t({
      zh: "无球大气 + 局部草地",
      en: "Atmosphere without globe",
    }),
  statusPath: "status.message",
  onRebuild: (current) => {
    const { controls } = current
    return controls.effect(() => {
      if (controls.scene.globeShow !== viewer.globe.show) {
        applyGlobeMode(controls.scene.globeShow)
      }
      viewer.globe.opacity = controls.scene.globeOpacity
      viewer.scene.atmosphere.show = controls.scene.atmosphereShow
      viewer.scene.atmosphere.sky.ground = controls.scene.skyGround
      viewer.postProcess.toneMapping.enabled = controls.toneMapping.enabled
      viewer.postProcess.toneMapping.mode = controls.toneMapping.mode as ToneMappingMode
      viewer.postProcess.toneMapping.exposure = controls.toneMapping.exposure

      const bladeMax = controls.grass.bladeMaxHeight
      meadow.setOptions({
        terrain: {
          terrainDegree: controls.grass.terrainDegree,
          groundColor: controls.grass.terrainGroundColor,
        },
        grass: {
          density: controls.grass.density,
          brightness: controls.grass.brightness,
          blade: {
            minHeight: Math.min(0.7, bladeMax * 0.45),
            maxHeight: bladeMax,
          },
          wind: {
            strength: controls.grass.windStrength,
            speed: controls.grass.windSpeed,
            direction: controls.grass.windDirection,
          },
          colors: {
            bottom: controls.grass.bottomColor,
            top: controls.grass.topColor,
          },
        },
        wildflowers: {
          enabled: controls.grass.wildflowers,
          density: controls.grass.wildflowerDensity,
        },
      })
    })
  },
})

;(window as unknown as { viewer: typeof viewer }).viewer = viewer

window.addEventListener("beforeunload", () => {
  if (disposed) return
  disposed = true
  viewer.renderer.raw.setAnimationLoop(null)
  panel?.dispose()
  orbit.dispose()
  viewer.scene.raw.remove(meadow)
  meadow.dispose()
  viewer.destroy()
})

function findVisibleDirectionalLight(
  scene: THREE.Object3D
): THREE.DirectionalLight | null {
  let found: THREE.DirectionalLight | null = null
  scene.traverse((object) => {
    if (found) return
    const light = object as THREE.DirectionalLight
    if (light.isDirectionalLight && light.visible) {
      found = light
    }
  })
  return found
}

function colorToHex(color: THREE.ColorRepresentation): string {
  return `#${new THREE.Color(color).getHexString()}`
}
