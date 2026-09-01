import tellux, { type TerrainOptions } from "../src"
import {
  buildTiandituTerrainUrls,
  defaultTiandituToken,
  defaultTiandituTokens,
  exampleMapServiceConfig,
  tiandituTerrainServiceTemplate,
} from "./shared"
import { bootExampleI18n, t } from "./i18n"
import { createTelluxPanel, type TelluxPanel } from "./example-panel-leva"

bootExampleI18n()

type TerrainSource = "tianditu" | "cesium-ion"

const DEFAULT_ION_TERRAIN_ASSET_ID =
  import.meta.env.VITE_CESIUM_ION_TERRAIN_ASSET_ID ?? "1"
const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""

const container = document.querySelector("#viewer")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

const defaultTerrain = exampleMapServiceConfig.createTerrainOptions()

const viewer = new tellux.Viewer(container, {
  terrain: defaultTerrain,
  layers: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  camera: {
    latitude: 30.755465691598996,
    longitude: 103.51293447705049,
    height: 1946.2165657669584,
    heading: -93.06516054169673,
    pitch: -9.028828445592675,
    roll: 0.00005229266806157685,
  },
  scene: {
    clouds: {
      show: false,
    },
  },
})

viewer.clock.hourUTC = 11
;(window as any).viewer = viewer

const initialSource: TerrainSource =
  defaultTerrain?.type === "cesium-ion" || defaultTerrain?.type === "url"
    ? "cesium-ion"
    : "tianditu"
const initialEnabled = Boolean(defaultTerrain)

let panel: TelluxPanel<ReturnType<typeof terrainSchema>> | undefined

function setStatus(message: string) {
  panel?.setStatus(message)
}

function getTiandituTerrainUrls(token: string) {
  return buildTiandituTerrainUrls(token)
}

function getSelectedTerrainSource(): TerrainSource {
  return panel?.controls.source.kind === "cesium-ion" ? "cesium-ion" : "tianditu"
}

function createTiandituTerrainOptions(): TerrainOptions | null {
  const userInput = panel?.controls.source.tiandituToken.trim() ?? ""
  // 用户输入了就用输入的单 key；否则用 .env 解析出的多 key 数组做负载均衡。
  // A user-entered key takes precedence; otherwise the multi-key array parsed
  // from .env is used for load balancing.
  const token: string | string[] = userInput || defaultTiandituTokens
  const firstToken = userInput || defaultTiandituTokens[0] || ""
  const urls = firstToken ? getTiandituTerrainUrls(firstToken) : []

  if (!firstToken || urls.length === 0) {
    setStatus(
      t({
        zh: "请先输入天地图 tk，或在 .env 中配置 VITE_TIANDITU_TOKEN。",
        en: "Enter Tianditu tk or set VITE_TIANDITU_TOKEN.",
      })
    )
    return null
  }

  return {
    type: "tianditu",
    token,
    urls,
    tileLoading: {
      enableTileSplitting: true,
    },
  }
}

function createIonTerrainOptions(): TerrainOptions | null {
  const assetId = panel?.controls.source.ionAssetId.trim() ?? ""
  const apiToken =
    (panel?.controls.source.ionToken.trim() || DEFAULT_ION_TOKEN) ?? ""

  if (!assetId || !apiToken) {
    setStatus(
      t({
        zh: "请先输入 Cesium Ion terrain asset id 和 token，或在 .env 中配置默认值。",
        en: "Enter Ion terrain asset id and token, or set defaults.",
      })
    )
    return null
  }

  return {
    type: "cesium-ion",
    assetId,
    apiToken,
    tileLoading: {
      enableTileSplitting: true,
    },
  }
}

function createSelectedTerrainOptions(): TerrainOptions | null {
  return getSelectedTerrainSource() === "tianditu"
    ? createTiandituTerrainOptions()
    : createIonTerrainOptions()
}

function syncTerrainSourceFields(
  currentPanel: TelluxPanel<ReturnType<typeof terrainSchema>>
) {
  const isTianditu = currentPanel.controls.source.kind === "tianditu"
  currentPanel.controls.visibility("source.tiandituToken", isTianditu)
  currentPanel.controls.visibility("source.tiandituHint", isTianditu)
  currentPanel.controls.visibility("source.ionAssetId", !isTianditu)
  currentPanel.controls.visibility("source.ionToken", !isTianditu)
}

function enableSelectedTerrain() {
  const terrain = createSelectedTerrainOptions()
  if (!terrain) {
    if (panel) panel.controls.toggle.enabled = false
    return
  }

  viewer.setTerrain(terrain)
  setStatus(
    getSelectedTerrainSource() === "tianditu"
      ? t({
          zh: "天地图 swdx 地形已通过 viewer.setTerrain 加载。",
          en: "Tianditu swdx terrain loaded via viewer.setTerrain.",
        })
      : t({
          zh: "Cesium Ion 地形已通过 viewer.setTerrain 加载。",
          en: "Cesium Ion terrain loaded via viewer.setTerrain.",
        })
  )
}

function disableTerrain() {
  viewer.setTerrain(null)
  setStatus(
    t({
      zh: "地形已关闭，Viewer 已切回无地形模式。",
      en: "Terrain off; Viewer is in no-terrain mode.",
    })
  )
}

function syncTerrainEnabledState() {
  if (panel?.controls.toggle.enabled) {
    enableSelectedTerrain()
  } else {
    disableTerrain()
  }
}

function getInitialStatus() {
  if (defaultTerrain?.type === "tianditu") {
    return t({
      zh: "已从天地图 swdx 默认配置自动加载地形；也可以切换到 Cesium Ion 地形。",
      en: "Auto-loaded Tianditu swdx; you can switch to Cesium Ion.",
    })
  }
  if (defaultTerrain?.type === "url") {
    return t({
      zh: "已按其他示例的开发默认加载 Cesium 地形；也可以切换到天地图 swdx。",
      en: "Loaded the shared Cesium terrain default; you can switch to Tianditu swdx.",
    })
  }
  if (defaultTerrain?.type === "cesium-ion") {
    return t({
      zh: "已从 Cesium Ion 默认配置自动加载地形；也可以切换到天地图 swdx。",
      en: "Auto-loaded Cesium Ion terrain; you can switch to Tianditu swdx.",
    })
  }
  return t({
    zh: "请配置 VITE_TIANDITU_TOKEN，或输入天地图 tk / Cesium Ion 凭据后加载。",
    en: "Set VITE_TIANDITU_TOKEN, or enter Tianditu tk / Ion credentials.",
  })
}

const terrainSchema = () =>
  ({
    source: {
      $: { label: t({ zh: "数据源", en: "Source" }) },
      kind: {
        value: initialSource,
        options: {
          [t({ zh: "天地图 swdx", en: "Tianditu swdx" })]: "tianditu",
          "Cesium Ion terrain": "cesium-ion",
        },
        label: t({ zh: "地形来源", en: "Terrain source" }),
      },
      tiandituToken: {
        value: "",
        label: t({ zh: "天地图 tk", en: "Tianditu tk" }),
      },
      tiandituHint: {
        type: "hint" as const,
        value: t(
          { zh: "服务模板：{url}", en: "Service template: {url}" },
          { url: tiandituTerrainServiceTemplate }
        ),
      },
      ionAssetId: {
        value: DEFAULT_ION_TERRAIN_ASSET_ID,
        label: t({
          zh: "Cesium Ion terrain asset id",
          en: "Cesium Ion terrain asset id",
        }),
      },
      ionToken: {
        value: "",
        label: t({ zh: "Cesium Ion token", en: "Cesium Ion token" }),
      },
    },
    toggle: {
      $: { label: t({ zh: "开关", en: "Toggle" }) },
      enabled: {
        value: initialEnabled,
        label: t({ zh: "启用地形", en: "Enable terrain" }),
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

function bindTokenField(
  currentPanel: TelluxPanel<ReturnType<typeof terrainSchema>>,
  path: string,
  options: { password?: boolean; placeholder?: string }
) {
  const field = currentPanel.getFieldElement(path)
  if (!(field instanceof HTMLInputElement)) return () => {}

  if (options.password) field.type = "password"
  if (options.placeholder) field.placeholder = options.placeholder

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return
    currentPanel.controls.toggle.enabled = true
    syncTerrainEnabledState()
  }
  field.addEventListener("keydown", onKeydown)
  return () => field.removeEventListener("keydown", onKeydown)
}

function bindPanelInteractions(
  currentPanel: TelluxPanel<ReturnType<typeof terrainSchema>>
) {
  const { controls } = currentPanel
  const cleanups: Array<() => void> = []
  let ready = false

  syncTerrainSourceFields(currentPanel)

  cleanups.push(
    bindTokenField(currentPanel, "source.tiandituToken", {
      password: true,
      placeholder: defaultTiandituToken
        ? t({
            zh: "留空使用 VITE_TIANDITU_TOKEN",
            en: "Leave empty to use VITE_TIANDITU_TOKEN",
          })
        : t({ zh: "输入天地图 tk", en: "Enter Tianditu tk" }),
    })
  )
  cleanups.push(bindTokenField(currentPanel, "source.ionAssetId", {}))
  cleanups.push(
    bindTokenField(currentPanel, "source.ionToken", {
      password: true,
      placeholder: DEFAULT_ION_TOKEN
        ? t({
            zh: "留空使用 VITE_CESIUM_ION_TOKEN",
            en: "Leave empty to use VITE_CESIUM_ION_TOKEN",
          })
        : t({ zh: "输入 Cesium Ion token", en: "Enter Cesium Ion token" }),
    })
  )

  cleanups.push(
    controls.effect(() => {
      void controls.source.kind
      syncTerrainSourceFields(currentPanel)
      if (!ready) return
      if (controls.toggle.enabled) {
        enableSelectedTerrain()
        return
      }
      setStatus(
        getSelectedTerrainSource() === "tianditu"
          ? t({
              zh: "已选择天地图 swdx 地形，勾选后加载 elv_c 高程瓦片。",
              en: "Tianditu swdx selected; enable to load elv_c elevation tiles.",
            })
          : t({
              zh: "已选择 Cesium Ion 地形来源，勾选后加载 terrain asset。",
              en: "Cesium Ion selected; enable to load terrain asset.",
            })
      )
    })
  )

  cleanups.push(
    controls.effect(() => {
      void controls.toggle.enabled
      if (!ready) return
      syncTerrainEnabledState()
    })
  )

  ready = true

  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}

panel = createTelluxPanel(terrainSchema, {
  id: "terrain-panel",
  title: () => t({ zh: "地形热切换", en: "Terrain hot-swap" }),
  statusPath: "status.message",
  onRebuild: bindPanelInteractions,
})

window.addEventListener("beforeunload", () => {
  panel?.dispose()
  viewer.destroy()
})
