import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { Grass } from "three-stylized"
import tellux from "../../src"
import type { ToneMappingMode } from "../../src"
import { createTelluxPanel, type TelluxPanel } from "../example-panel-leva"
import { t } from "../i18n"

/** 局部原点锚点（经纬高）。Local-origin geographic anchor. */
export const LOCAL_MEADOW_ANCHOR = {
  longitude: 103.5807,
  latitude: 31.0516,
  height: 0,
} as const

export interface LocalMeadowAtmosphereDemo {
  viewer: InstanceType<typeof tellux.Viewer>
  meadow: Grass
  dispose: () => void
}

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

/**
 * 藏球 + 局部原点草地 + Tellux 大气。
 * Hide globe, place a local-origin meadow, keep Tellux atmosphere.
 */
export function createLocalMeadowAtmosphereDemo(
  container: HTMLElement
): LocalMeadowAtmosphereDemo {
  const initialClockTime = new Date()
  initialClockTime.setUTCHours(6, 30, 0, 0)

  const viewer = new tellux.Viewer(container, {
    clock: {
      currentTime: initialClockTime,
    },
    camera: {
      projection: {
        near: 0.1,
        far: 50_000,
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
      toneMapping: { exposure: 8 },
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

  // 对齐上游 Non-geospatial：大平面填满地平线，避免藏球后脚下发黑。
  // Match upstream Non-geospatial: a large plane fills the horizon under the meadow.
  const groundSize = 500
  const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize)
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0xc0a783,
    roughness: 0.95,
    metalness: 0,
  })
  const ground = new THREE.Mesh(groundGeometry, groundMaterial)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.05
  ground.receiveShadow = true
  ground.visible = true
  viewer.scene.raw.add(ground)

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

  const meadowInitial = meadow.options

  const camera = viewer.camera.raw
  camera.up.set(0, 1, 0)
  camera.position.set(14, 8, 16)
  camera.lookAt(0, 0.6, 0)
  camera.updateProjectionMatrix()

  const orbit = new OrbitControls(camera, viewer.renderer.raw.domElement)
  orbit.enableDamping = true
  orbit.dampingFactor = 0.06
  orbit.target.set(0, 0.6, 0)
  orbit.minDistance = 4
  orbit.maxDistance = 280
  orbit.maxPolarAngle = Math.PI * 0.49

  const clock = new THREE.Clock()
  let disposed = false

  viewer.renderer.raw.setAnimationLoop((time) => {
    if (disposed) return
    meadow.update(clock.getElapsedTime())
    const sun = findVisibleDirectionalLight(viewer.scene.raw)
    if (sun) meadow.syncDirectionalLight(sun)
    orbit.update()
    viewer.render(time)
  })

  let panel: TelluxPanel<ReturnType<typeof panelSchema>> | null = null

  const panelSchema = () =>
    ({
      scene: {
        $: { label: t({ zh: "场景", en: "Scene" }) },
        atmosphereShow: {
          value: viewer.scene.atmosphere.show,
          label: t({ zh: "大气", en: "Atmosphere" }),
        },
        groundShow: {
          value: ground.visible,
          label: t({ zh: "几何地面", en: "Ground plane" }),
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
            zh: "已藏球；大平面色 #c0a783。草地参数走 three-stylized.setOptions。",
            en: "Globe hidden; ground #c0a783. Grass params via three-stylized.setOptions.",
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
        viewer.scene.atmosphere.show = controls.scene.atmosphereShow
        ground.visible = controls.scene.groundShow
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

  const dispose = () => {
    if (disposed) return
    disposed = true
    viewer.renderer.raw.setAnimationLoop(null)
    panel?.dispose()
    orbit.dispose()
    viewer.scene.raw.remove(ground)
    groundGeometry.dispose()
    groundMaterial.dispose()
    viewer.scene.raw.remove(meadow)
    meadow.dispose()
    viewer.destroy()
  }

  window.addEventListener("beforeunload", dispose)

  return { viewer, meadow, dispose }
}
