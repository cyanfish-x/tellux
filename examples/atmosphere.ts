import tellux from "../src"
import { bootExampleI18n, t } from "./i18n"
import {
  createTelluxPanel,
  type TelluxPanel,
} from "./example-panel-leva"
import { exampleMapServiceConfig } from "./shared"

bootExampleI18n()

const container = document.querySelector("#viewer")

const initialDaytimeHourUTC = 5

const dujiangyanView = {
  latitude: 31.05157867702613,
  longitude: 103.58072127253753,
  height: 1673.1259765983373,
  heading: -151.6164823198256,
  pitch: -7.787794450304198,
  roll: 0.000021451645805256228,
  clouds: {
    layerAltitude: 2500,
    layerHeight: 650,
  },
}

const himalayaView = {
  latitude: 27.8796633251456,
  longitude: 86.88617354307131,
  height: 10836.791552456161,
  heading: 22.93068928328877,
  pitch: -19.516994695591997,
  roll: -0.00011182679374040685,
  clouds: {
    layerAltitude: 8500,
    layerHeight: 200,
  },
}

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

const initialClockTime = new Date()
initialClockTime.setUTCHours(initialDaytimeHourUTC, 0, 0, 0)

const viewer = new tellux.Viewer(container, {
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
      longitude: dujiangyanView.longitude,
      latitude: dujiangyanView.latitude,
      height: dujiangyanView.height,
    },
    orientation: {
      heading: dujiangyanView.heading,
      pitch: dujiangyanView.pitch,
      roll: dujiangyanView.roll,
    },
    projection: {
      far: 8000000,
    },
  },
  scene: {
    atmosphere: {
      show: true,
      lighting: {
        mode: "post-process",
      },
    },
    clouds: {
      show: true,
      coverage: 0.35,
    },
  },
  widgets: {
    timeline: {
      linkCloudSpeed: true,
    },
  },
  renderer: {
    resolutionScale: 1,
  },
})

viewer.scene.clouds.layer.altitude = dujiangyanView.clouds.layerAltitude
viewer.scene.clouds.layer.height = dujiangyanView.clouds.layerHeight
;(window as any).viewer = viewer

let panel: TelluxPanel<ReturnType<typeof atmosphereSchema>> | null = null

function applyLocationView(view: typeof dujiangyanView | typeof himalayaView) {
  viewer.scene.clouds.layer.altitude = view.clouds.layerAltitude
  viewer.scene.clouds.layer.height = view.clouds.layerHeight
  if (panel) {
    panel.controls.clouds.layerAltitude = view.clouds.layerAltitude
    panel.controls.clouds.layerHeight = view.clouds.layerHeight
  }
  viewer.camera.flyTo({
    destination: {
      latitude: view.latitude,
      longitude: view.longitude,
      height: view.height,
    },
    orientation: {
      heading: view.heading,
      pitch: view.pitch,
      roll: view.roll,
    },
  })
}

const atmosphereSchema = () =>
  ({
    place: {
      $: { label: t({ zh: "地点", en: "Places" }) },
      dujiangyan: {
        onClick: () => applyLocationView(dujiangyanView),
        label: t({ zh: "紫坪铺水库", en: "Zipingpu Reservoir" }),
      },
      himalaya: {
        onClick: () => applyLocationView(himalayaView),
        label: t({ zh: "喜马拉雅", en: "Himalaya" }),
      },
    },
    atmosphere: {
      $: {
        label: t({ zh: "大气", en: "Atmosphere" }),
        collapsed: true,
      },
      show: {
        value: viewer.scene.atmosphere.show,
        label: t({ zh: "启用大气", en: "Atmosphere" }),
      },
      lightingMode: {
        value: viewer.scene.atmosphere.lighting.mode,
        options: {
          [t({ zh: "后处理", en: "Post-process" })]: "post-process",
          [t({ zh: "光源", en: "Light source" })]: "light-source",
        },
        label: t({ zh: "光照模式", en: "Lighting mode" }),
      },
      sun: {
        value: viewer.scene.atmosphere.sky.sun,
        label: t({ zh: "太阳盘", en: "Sun disc" }),
      },
      moon: {
        value: viewer.scene.atmosphere.sky.moon,
        label: t({ zh: "月亮", en: "Moon" }),
      },
      stars: {
        value: viewer.scene.atmosphere.sky.stars.show,
        label: t({ zh: "星空", en: "Stars" }),
      },
      starsIntensity: {
        value: viewer.scene.atmosphere.sky.stars.intensity,
        min: 0,
        max: 8,
        step: 0.05,
        label: t({ zh: "星空亮度", en: "Stars intensity" }),
      },
      scatteringIntensity: {
        value: viewer.scene.atmosphere.scattering.intensity,
        min: 0,
        max: 1,
        step: 0.01,
        label: t({ zh: "空气散射", en: "Inscatter intensity" }),
      },
      transmittance: {
        value: viewer.scene.atmosphere.scattering.transmittance,
        label: t({ zh: "透射衰减", en: "Transmittance" }),
      },
      inscatter: {
        value: viewer.scene.atmosphere.scattering.inscatter,
        label: t({ zh: "原生散射", en: "Inscatter" }),
      },
      sunLightIntensity: {
        value: viewer.scene.atmosphere.lighting.sunLightIntensity,
        min: 0,
        max: 8,
        step: 0.05,
        label: t({ zh: "太阳光强", en: "Sun light intensity" }),
      },
      skyLightIntensity: {
        value: viewer.scene.atmosphere.lighting.skyLightIntensity,
        min: 0,
        max: 8,
        step: 0.05,
        label: t({ zh: "天空光强", en: "Sky light intensity" }),
      },
      albedoScale: {
        value: viewer.scene.atmosphere.lighting.albedoScale,
        min: 0,
        max: 4,
        step: 0.01,
        label: t({ zh: "反照率缩放", en: "Albedo scale" }),
      },
      rayleigh: {
        value: viewer.scene.atmosphere.scattering.rayleighScatteringScale,
        min: 0,
        max: 4,
        step: 0.01,
        label: t({ zh: "瑞利散射", en: "Rayleigh scale" }),
      },
      mie: {
        value: viewer.scene.atmosphere.scattering.mieScatteringScale,
        min: 0,
        max: 4,
        step: 0.01,
        label: t({ zh: "米氏散射", en: "Mie scale" }),
      },
    },
    clouds: {
      $: { label: t({ zh: "体积云", en: "Volumetric clouds" }) },
      show: {
        value: viewer.scene.clouds.show,
        label: t({ zh: "启用体积云", en: "Clouds" }),
      },
      coverage: {
        value: viewer.scene.clouds.coverage,
        min: 0,
        max: 1,
        step: 0.01,
        label: t({ zh: "云覆盖率", en: "Coverage" }),
      },
      quality: {
        value: viewer.scene.clouds.quality,
        options: {
          [t({ zh: "低", en: "Low" })]: "low",
          [t({ zh: "中", en: "Medium" })]: "medium",
          [t({ zh: "高", en: "High" })]: "high",
          Ultra: "ultra",
        },
        label: t({ zh: "质量", en: "Quality" }),
      },
      speed: {
        value: viewer.scene.clouds.speed,
        min: 0,
        max: 0.02,
        step: 0.0001,
        label: t({ zh: "云速", en: "Speed" }),
      },
      layerAltitude: {
        value: viewer.scene.clouds.layer.altitude,
        min: 200,
        max: 12000,
        step: 50,
        label: t({ zh: "低云云底 (m)", en: "Cloud base (m)" }),
      },
      layerHeight: {
        value: viewer.scene.clouds.layer.height,
        min: 100,
        max: 3000,
        step: 50,
        label: t({ zh: "低云厚度 (m)", en: "Cloud thickness (m)" }),
      },
      lightShafts: {
        value: viewer.scene.clouds.lightShafts,
        label: t({ zh: "云缝光柱", en: "Light shafts" }),
      },
      detail: {
        value: viewer.scene.clouds.look.detail,
        label: t({ zh: "细节", en: "Detail" }),
      },
      turbulence: {
        value: viewer.scene.clouds.look.turbulence,
        label: t({ zh: "湍流", en: "Turbulence" }),
      },
      haze: {
        value: viewer.scene.clouds.look.haze,
        label: t({ zh: "霾", en: "Haze" }),
      },
      shadowRadius: {
        value: viewer.scene.atmosphere.shadow.radius,
        min: 0,
        max: 16,
        step: 0.25,
        label: t({ zh: "云影柔化", en: "Shadow soft radius" }),
      },
    },
    postProcess: {
      $: {
        label: t({ zh: "后处理", en: "Post-process" }),
        collapsed: true,
      },
      exposure: {
        value: viewer.postProcess.toneMapping.exposure,
        min: 2,
        max: 14,
        step: 0.1,
        label: t({ zh: "曝光", en: "Exposure" }),
      },
      lensFlare: {
        value: viewer.postProcess.lensFlare.enabled,
        label: t({ zh: "镜头光晕", en: "Lens flare" }),
      },
      smaa: {
        value: viewer.postProcess.smaa.enabled,
        label: "SMAA",
      },
    },
  }) as const

function bindPanelInteractions(
  currentPanel: TelluxPanel<ReturnType<typeof atmosphereSchema>>
) {
  const { controls } = currentPanel
  return controls.effect(() => {
    viewer.scene.atmosphere.show = controls.atmosphere.show
    viewer.scene.atmosphere.lighting.mode = controls.atmosphere
      .lightingMode as "post-process" | "light-source"
    viewer.scene.atmosphere.sky.sun = controls.atmosphere.sun
    viewer.scene.atmosphere.sky.moon = controls.atmosphere.moon
    viewer.scene.atmosphere.sky.stars.show = controls.atmosphere.stars
    viewer.scene.atmosphere.sky.stars.intensity =
      controls.atmosphere.starsIntensity
    viewer.scene.atmosphere.scattering.intensity =
      controls.atmosphere.scatteringIntensity
    viewer.scene.atmosphere.scattering.transmittance =
      controls.atmosphere.transmittance
    viewer.scene.atmosphere.scattering.inscatter =
      controls.atmosphere.inscatter
    viewer.scene.atmosphere.lighting.sunLightIntensity =
      controls.atmosphere.sunLightIntensity
    viewer.scene.atmosphere.lighting.skyLightIntensity =
      controls.atmosphere.skyLightIntensity
    viewer.scene.atmosphere.lighting.albedoScale =
      controls.atmosphere.albedoScale
    viewer.scene.atmosphere.scattering.rayleighScatteringScale =
      controls.atmosphere.rayleigh
    viewer.scene.atmosphere.scattering.mieScatteringScale =
      controls.atmosphere.mie

    viewer.scene.clouds.show = controls.clouds.show
    viewer.scene.clouds.coverage = controls.clouds.coverage
    viewer.scene.clouds.quality = controls.clouds.quality as
      | "low"
      | "medium"
      | "high"
      | "ultra"
    viewer.scene.clouds.speed = controls.clouds.speed
    viewer.scene.clouds.layer.altitude = controls.clouds.layerAltitude
    viewer.scene.clouds.layer.height = controls.clouds.layerHeight
    viewer.scene.clouds.lightShafts = controls.clouds.lightShafts
    viewer.scene.clouds.look.detail = controls.clouds.detail
    viewer.scene.clouds.look.turbulence = controls.clouds.turbulence
    viewer.scene.clouds.look.haze = controls.clouds.haze
    viewer.scene.atmosphere.shadow.radius = controls.clouds.shadowRadius

    viewer.postProcess.toneMapping.exposure = controls.postProcess.exposure
    viewer.postProcess.lensFlare.enabled = controls.postProcess.lensFlare
    viewer.postProcess.smaa.enabled = controls.postProcess.smaa
  })
}

panel = createTelluxPanel(atmosphereSchema, {
  id: "atmosphere-panel",
  title: () => t({ zh: "体积云与大气", en: "Volumetric clouds & atmosphere" }),
  onRebuild: bindPanelInteractions,
})

window.addEventListener("beforeunload", () => {
  panel?.dispose()
  viewer.destroy()
})
