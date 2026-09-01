import type { TilesetLayer } from "../src"

import tellux from "../src"

import { bootExampleI18n, t } from "./i18n"

import { createTelluxPanel, type TelluxPanel } from "./example-panel-leva"

import { exampleMapServiceConfig } from "./shared"



bootExampleI18n()



type TilesetSource = "url" | "cesium-ion"



const PROD_TILESET_URL = "https://data.cyanfish.site/3dtiles/hk/tileset.json"

const DEV_TILESET_URL = "/3dtiles/hk/tileset.json"

const DEFAULT_TILESET_URL =

  import.meta.env.VITE_3D_TILESET_URL ??

  (import.meta.env.DEV ? DEV_TILESET_URL : PROD_TILESET_URL)

const DEFAULT_ION_ASSET_ID =

  import.meta.env.VITE_CESIUM_ION_3D_TILESET_ASSET_ID ?? "354307"

const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""



const container = document.querySelector("#viewer")



if (!(container instanceof HTMLElement)) {

  throw new Error("Viewer container not found.")

}



const defaultLoadMode: TilesetSource =

  DEFAULT_TILESET_URL

    ? "url"

    : DEFAULT_ION_ASSET_ID && DEFAULT_ION_TOKEN

      ? "cesium-ion"

      : "url"



const initialClockTime = new Date()

initialClockTime.setUTCHours(10, 0, 0, 0)



const viewer = new tellux.Viewer(container, {

  clock: {

    currentTime: initialClockTime,

  },

  terrain: exampleMapServiceConfig.createTerrainOptions(),

  layers: [

    {

      source: exampleMapServiceConfig.createImagerySource(),

    },

  ],

  scene: {

    atmosphere: {

      lighting: {

        mode: "post-process",

      },

    },

    clouds: {

      show: false,

    },

  },

  widgets: {

    timeline: true,

  },

})



;(window as any).viewer = viewer




let panel: TelluxPanel | undefined

let activeLayer: TilesetLayer | null = null



function setStatus(message: string) {

  panel?.setStatus(message)

}



function clearActiveLayer() {

  activeLayer?.remove()

  activeLayer = null

}



function syncLayerVisibility(currentPanel: TelluxPanel<ReturnType<typeof tilesetSchema>>) {

  if (activeLayer) {

    activeLayer.show = currentPanel.controls.options.visible

  }

}



function activateLayer(layer: TilesetLayer, description: string) {

  if (!panel) return

  activeLayer = layer

  syncLayerVisibility(panel)

  if (panel.controls.options.flyTo) {

    viewer.flyToTarget(layer.tileset, {

      heading: 30,

      pitch: -30,

    })

  }

  setStatus(

    t(

      { zh: "{description} 已加入场景。图层 id：{id}", en: "{description} added. Layer id: {id}" },

      { description, id: layer.id }

    )

  )

}



function loadUrlTileset() {

  if (!panel) return

  const url = panel.controls.source.tilesetUrl.trim()

  if (!url) {

    setStatus(

      t({

        zh: "请先输入 tileset.json URL，或在 .env 中配置 VITE_3D_TILESET_URL。",

        en: "Enter a tileset.json URL, or set VITE_3D_TILESET_URL in .env.",

      })

    )

    return

  }



  clearActiveLayer()

  activateLayer(

    viewer.load3DTileset({

      type: "url",

      id: "example-3d-tiles",

      url,

      creasedNormals: true,

    }),

    "URL 3D Tiles"

  )

}



function loadIonTileset() {

  if (!panel) return

  const assetId = panel.controls.source.ionAssetId.trim()

  const apiToken = panel.controls.source.ionToken.trim() || DEFAULT_ION_TOKEN



  if (!assetId || !apiToken) {

    setStatus(

      t({

        zh: "请先输入 Cesium Ion asset id 和 token，或在 .env 中配置默认值。",

        en: "Enter Cesium Ion asset id and token, or configure defaults in .env.",

      })

    )

    return

  }



  clearActiveLayer()

  activateLayer(

    viewer.load3DTileset({

      type: "cesium-ion",

      id: "example-3d-tiles",

      assetId,

      apiToken,

      creasedNormals: true,

    }),

    "Cesium Ion 3D Tiles"

  )

}



function loadSelectedTileset() {

  if (!panel) return

  if (panel.controls.source.loadMode === "url") {

    loadUrlTileset()

    return

  }

  loadIonTileset()

}



function syncSourceFieldState(currentPanel: TelluxPanel<ReturnType<typeof tilesetSchema>>) {

  const isUrl = currentPanel.controls.source.loadMode === "url"

  currentPanel.setFieldDisabled("source.tilesetUrl", !isUrl)

  currentPanel.setFieldDisabled("source.ionAssetId", isUrl)

  currentPanel.setFieldDisabled("source.ionToken", isUrl)

}



function getInitialStatus() {

  if (DEFAULT_TILESET_URL && defaultLoadMode === "url") {

    return t({

      zh: "已自动加载默认 3D Tiles；也可以替换 URL 后重新加载。",

      en: "Default 3D Tiles auto-loaded; replace the URL and reload if needed.",

    })

  }

  if (

    DEFAULT_ION_ASSET_ID &&

    DEFAULT_ION_TOKEN &&

    defaultLoadMode === "cesium-ion"

  ) {

    return t({

      zh: "已读取 Cesium Ion 默认配置，可点击“加载”。",

      en: "Cesium Ion defaults loaded; click Load.",

    })

  }

  return defaultLoadMode === "url"

    ? t({

        zh: "输入 tileset.json URL 后点击“加载”。",

        en: "Enter tileset.json URL then click Load.",

      })

    : t({

        zh: "输入 Cesium Ion asset id 和 token 后点击“加载”。",

        en: "Enter Cesium Ion asset id and token then click Load.",

      })

}



const tilesetSchema = () =>

  ({

    source: {

      $: { label: t({ zh: "数据源", en: "Source" }) },

      loadMode: {

        value: defaultLoadMode,

        options: {

          [t({ zh: "tileset.json URL", en: "tileset.json URL" })]: "url",

          "Cesium Ion": "cesium-ion",

        },

        label: t({ zh: "加载方式", en: "Load mode" }),

      },

      tilesetUrl: {

        value: DEFAULT_TILESET_URL,

        label: t({ zh: "tileset.json URL", en: "tileset.json URL" }),

      },

      ionAssetId: {

        value: DEFAULT_ION_ASSET_ID,

        label: t({ zh: "Cesium Ion asset id", en: "Cesium Ion asset id" }),

      },

      ionToken: {

        value: "",

        label: t({ zh: "Cesium Ion token", en: "Cesium Ion token" }),

      },

    },

    options: {

      $: { label: t({ zh: "选项", en: "Options" }) },

      visible: {

        value: true,

        label: t({ zh: "显示 3D Tiles", en: "Show 3D Tiles" }),

      },

      flyTo: {

        value: true,

        label: t({ zh: "加载后飞行到 3D Tiles", en: "Fly to 3D Tiles after load" }),

      },

    },

    actions: {

      $: { label: t({ zh: "操作", en: "Actions" }) },

      load: {

        onClick: () => loadSelectedTileset(),

        label: t({ zh: "加载", en: "Load" }),

      },

      remove: {

        onClick: () => {

          clearActiveLayer()

          setStatus(t({ zh: "3D Tiles 已移除。", en: "3D Tiles removed." }))

        },

        label: t({ zh: "移除", en: "Remove" }),

      },

    },

    status: {

      $: { label: t({ zh: "状态", en: "Status" }) },

      message: {

        type: "hint" as const,

        value: getInitialStatus(),

      },

    },

  }) as const



function bindPanelInteractions(

  currentPanel: TelluxPanel<ReturnType<typeof tilesetSchema>>

) {

  const { controls } = currentPanel

  const cleanups: Array<() => void> = []



  syncSourceFieldState(currentPanel)



  cleanups.push(

    controls.effect(() => {

      void controls.source.loadMode

      syncSourceFieldState(currentPanel)

    })

  )



  cleanups.push(

    controls.effect(() => {

      void controls.options.visible

      syncLayerVisibility(currentPanel)

      setStatus(

        activeLayer

          ? t(

              { zh: "3D Tiles 已{state}。", en: "3D Tiles is {state}." },

              {

                state: controls.options.visible

                  ? t({ zh: "显示", en: "shown" })

                  : t({ zh: "隐藏", en: "hidden" }),

              }

            )

          : t({ zh: "还没有加载 3D Tiles。", en: "No 3D Tiles loaded yet." })

      )

    })

  )



  return () => {

    for (const cleanup of cleanups) cleanup()

  }

}



panel = createTelluxPanel(tilesetSchema, {

  id: "3d-tiles-panel",

  title: () => t({ zh: "3D Tiles 加载", en: "3D Tiles loading" }),

  statusPath: "status.message",

  onRebuild: bindPanelInteractions,

})



if (DEFAULT_TILESET_URL && defaultLoadMode === "url") {

  loadUrlTileset()

}



window.addEventListener("beforeunload", () => {

  panel?.dispose()

  viewer.destroy()

})

