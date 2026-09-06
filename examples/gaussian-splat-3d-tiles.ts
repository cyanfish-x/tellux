import tellux from "../src"
import * as THREE from "three"
import { TilesRenderer } from "3d-tiles-renderer"
import { GaussianSplatPlugin, SparkRenderer, SplatMesh, CesiumIonAuthPlugin, ImplicitTilingPlugin, CESIUM_ION_EVALUATION_TOKEN } from "./gaussian-splat/sandcastleBindings"
import { bootExampleI18n, t } from "./i18n"
import { createTelluxPanel, type TelluxPanel } from "./example-panel-leva"
import { ExampleMessage } from "./example-message"
import { exampleMapServiceConfig } from "./shared"

bootExampleI18n()

// 固定提交，避免上游重命名 main 中的数据目录导致案例失效。
// Pin the dataset revision so upstream directory changes do not break the demo.
const SAMPLE_BASE = "https://raw.githubusercontent.com/WilliamLiu-1997/3D-Tiles-RendererJS-3DGS-Plugin/e5abce2422ff72eae8576c814babbec20ed8fe34/data"
const SOURCES = {
  svirnas: { label: "SvirnasAlyt · 3D Tiles", url: SAMPLE_BASE + "/SvirnasAlyt-3dtiles/tileset.json" },
  elevator: { label: "Elevator · 3D Tiles", url: SAMPLE_BASE + "/Elevator-3dtiles/tileset.json" },
  ion: { label: "Cesium ion · Redmond", url: "" },
  butterfly: { label: "Spark · Butterfly", url: "https://sparkjs.dev/assets/splats/butterfly.spz" },
  custom: { label: "", url: import.meta.env.VITE_GAUSSIAN_SPLAT_3D_TILESET_URL ?? "" },
}
type SourceId = keyof typeof SOURCES
const INITIAL_SOURCE: SourceId = SOURCES.custom.url ? "custom" : "svirnas"
const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""
const SAMPLE_VIEW = { latitude: -38.5, longitude: 142.8, height: 600, heading: 35, pitch: -26, roll: 0 }
// 单文件资源没有真实地理参考，此处仅为展示锚点（椭球高度，米）。
// The single-file asset has no georeference; this is a display anchor in ellipsoid meters.
const BUTTERFLY_ANCHOR = { longitude: 142.8343, latitude: -38.5822, height: 120 }

const container = document.querySelector("#viewer")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

const initialClockTime = new Date()
initialClockTime.setUTCHours(2, 0, 0, 0)

const viewer = new tellux.Viewer(container, {
  clock: {
    currentTime: initialClockTime,
  },
  useDefaultRenderLoop: false,
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  camera: {
    destination: {
      longitude: SAMPLE_VIEW.longitude,
      latitude: SAMPLE_VIEW.latitude,
      height: SAMPLE_VIEW.height,
    },
    orientation: {
      heading: SAMPLE_VIEW.heading,
      pitch: SAMPLE_VIEW.pitch,
      roll: SAMPLE_VIEW.roll,
    },
  },
  overlays: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  scene: {
    atmosphere: {
      lighting: {
        mode: "light-source",
      },
      scattering: {
        intensity: 0.35,
      },
    },
    clouds: {
      show: false,
    },
    surface: {
      materialMode: "standard",
    },
  },
})

;(window as any).viewer = viewer

const rawRenderer = viewer.renderer.raw
if (!(rawRenderer instanceof THREE.WebGLRenderer)) {
  throw new Error("This Gaussian splat example requires WebGLRenderer.")
}
const renderer: THREE.WebGLRenderer = rawRenderer


let panel: TelluxPanel<ReturnType<typeof splatSchema>> | undefined
let activeTileset: TilesRenderer | null = null
let activeSplat: SplatMesh | null = null
let splatRoot: THREE.Group | null = null
let sparkRenderer: SparkRenderer | null = null
let requestController: AbortController | null = null
let generation = 0
let animationFrame = 0
let previousVisibleCount = -1

function setStatus(message: string) { panel?.setStatus(message) }

function clearSource() {
  generation++
  requestController?.abort()
  requestController = null
  const tileset = activeTileset
  activeTileset = null
  tileset?.group.removeFromParent()
  tileset?.dispose()
  splatRoot?.removeFromParent()
  splatRoot = null
  activeSplat?.dispose()
  activeSplat = null
  sparkRenderer?.removeFromParent()
  sparkRenderer?.dispose()
  sparkRenderer = null
  previousVisibleCount = -1
}

function fail(error: unknown, request: number) {
  if (request !== generation) return
  clearSource()
  // 不把带 token 的请求 URL 放到页面提示中。
  // Keep token-bearing request URLs out of the UI.
  const message = error instanceof Error ? error.message : String(error)
  const status = message.match(/(?:status|code|HTTP)\s*[:=]?\s*(\d{3})/i)?.[1]
  const detail = status
    ? t({ zh: "请求失败（HTTP {code}），请检查资源地址和访问权限。", en: "Request failed (HTTP {code}). Check the source and access permissions." }, { code: status })
    : t({ zh: "加载或解码失败，请检查网络、访问权限及高斯数据格式。", en: "Loading or decoding failed. Check the network, permissions and splat format." })
  setStatus(detail)
  ExampleMessage.error(detail, { id: "gaussian-splat-load-error", showClose: true })
}

function flyToSource() {
  if (activeTileset) {
    const sphere = new THREE.Sphere()
    if (!activeTileset.getBoundingSphere(sphere)) return
    viewer.flyToTarget(activeTileset, {
      offset: { heading: 35, pitch: -26, distance: Math.max(20, sphere.radius * 2.5) },
      duration: 1.2,
    })
  } else if (splatRoot) {
    viewer.flyToTarget(BUTTERFLY_ANCHOR, {
      offset: { heading: 0, pitch: -15, distance: 25 }, duration: 1.2,
    })
  }
}

function syncDisplay() {
  if (!panel) return
  const { visible, globe, detail } = panel.controls.display
  if (activeTileset) {
    activeTileset.group.visible = visible
    activeTileset.errorTarget = detail
  }
  if (splatRoot) splatRoot.visible = visible
  if (sparkRenderer) sparkRenderer.visible = visible
  viewer.globe.show = globe
}

async function loadSource() {
  if (!panel) return
  const source = panel.controls.source.kind as SourceId
  const url = source === "ion" ? "" : panel.controls.connection.url.trim()
  const assetId = Number(panel.controls.connection.assetId)
  const apiToken = panel.controls.connection.token.trim()
    || (assetId === 4547222 ? CESIUM_ION_EVALUATION_TOKEN : DEFAULT_ION_TOKEN)
  clearSource()
  if (source === "ion" && (!Number.isSafeInteger(assetId) || assetId <= 0 || !apiToken)) {
    setStatus(t({ zh: "请输入有效 Asset ID 和 ion token，或配置 VITE_CESIUM_ION_TOKEN。", en: "Enter a valid asset ID and ion token, or set VITE_CESIUM_ION_TOKEN." }))
    return
  }
  if (source !== "ion" && !url) {
    setStatus(t({ zh: "请填写资源 URL。", en: "Enter a resource URL." }))
    return
  }
  const request = generation
  setStatus(t({ zh: "正在请求资源…", en: "Requesting the source…" }))
  try {
    if (source === "butterfly") {
      const controller = new AbortController()
      requestController = controller
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const fileBytes = await response.arrayBuffer()
      if (request !== generation) return
      // 解码完成前不挂入场景；切源后只释放本次产生的对象。
      // Do not attach until decoded; stale loads dispose only their own objects.
      const mesh = new SplatMesh({ fileBytes, fileName: new URL(url, window.location.href).pathname })
      try { await mesh.initialized } catch (error) { mesh.dispose(); throw error }
      if (request !== generation) { mesh.dispose(); return }
      activeSplat = mesh
      const bounds = mesh.getBoundingBox()
      const center = bounds.getCenter(new THREE.Vector3())
      const size = bounds.getSize(new THREE.Vector3()).length()
      const scale = size > 0 ? 12 / size : 1
      mesh.scale.setScalar(scale)
      mesh.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
      mesh.position.copy(center).multiplyScalar(-scale).applyQuaternion(mesh.quaternion)
      splatRoot = new THREE.Group()
      splatRoot.matrixAutoUpdate = false
      splatRoot.matrix.copy(viewer.cartographicToMatrix4(BUTTERFLY_ANCHOR))
      splatRoot.add(mesh)
      sparkRenderer = new SparkRenderer({ renderer, focalAdjustment: 2, depthTest: true, depthWrite: false })
      viewer.scene.raw.add(splatRoot, sparkRenderer)
      requestController = null
      syncDisplay()
      flyToSource()
      setStatus(t({ zh: "Butterfly 已就绪 · 展示锚点，无真实地理参考。", en: "Butterfly ready · Display anchor, no real georeference." }))
      return
    }
    const tileset = new TilesRenderer(url)
    activeTileset = tileset
    tileset.setCamera(viewer.camera.raw)
    tileset.setResolutionFromRenderer(viewer.camera.raw, renderer)
    if (source === "ion") {
      tileset.registerPlugin(new CesiumIonAuthPlugin({ assetId: String(assetId), apiToken, autoRefreshToken: true }))
    }
    tileset.registerPlugin(new ImplicitTilingPlugin())
    tileset.registerPlugin(new GaussianSplatPlugin({
      renderer, scene: viewer.scene.raw, minRaycastOpacity: 0.08,
      sparkRendererOptions: { focalAdjustment: 2, depthTest: true, depthWrite: false },
    }))
    tileset.addEventListener("load-error", event => fail(event.error, request))
    tileset.addEventListener("load-root-tileset", () => {
      if (request !== generation) return
      if (source === "ion" && panel) {
        const credits = tileset.getAttributions().map(credit => {
          const value = String(credit.value)
          return credit.type === "html"
            ? new DOMParser().parseFromString(value, "text/html").body.textContent ?? ""
            : value
        }).filter(Boolean).join(" · ")
        if (credits) panel.controls.status.credit = credits
      }
      flyToSource()
      setStatus(t({ zh: "目录已加载，正在加载可见瓦片…", en: "Tileset ready; loading visible tiles…" }))
    })
    viewer.scene.raw.add(tileset.group)
    syncDisplay()
  } catch (error) { fail(error, request) }
}

function frame(time: number) {
  const tileset = activeTileset
  if (tileset?.group.visible) {
    const request = generation
    try {
      tileset.setResolutionFromRenderer(viewer.camera.raw, renderer)
      tileset.update()
      if (request === generation && tileset.visibleTiles.size !== previousVisibleCount) {
        previousVisibleCount = tileset.visibleTiles.size
        if (previousVisibleCount > 0) {
          setStatus(t({ zh: "可见瓦片：{n} · 移动相机可细化。", en: "Visible tiles: {n} · Move the camera to refine." }, { n: previousVisibleCount }))
        }
      }
    } catch (error) { fail(error, request) }
  }
  viewer.render(time)
  animationFrame = window.requestAnimationFrame(frame)
}

function sourceDescription(source: SourceId) {
  if (source === "svirnas") return t({ zh: "分层 3D Tiles · 整套约 100 MiB，按需加载。", en: "Hierarchical 3D Tiles · About 100 MiB total, streamed on demand." })
  if (source === "elevator") return t({ zh: "分层 3D Tiles · 整套约 269 MiB，按需加载。", en: "Hierarchical 3D Tiles · About 269 MiB total, streamed on demand." })
  if (source === "ion") return t({ zh: "官方 Redmond 园区 · 留空使用 CesiumJS 公开评估 token，无需填写自己的 token。仅供评估；其他资产需自行授权。", en: "Official Redmond campus · Leave token empty to use the public CesiumJS evaluation token. Evaluation only; other assets require your own access." })
  if (source === "butterfly") return t({ zh: "Spark 官方蝴蝶 · 单文件约 4 MB。放置于展示锚点，缩放至约 12 米。", en: "Official Spark butterfly · About 4 MB. Placed at a display anchor and scaled to about 12 meters." })
  return t({ zh: "支持高斯扩展的 tileset.json；普通 PLY/SPZ 请使用 Spark 单文件入口。", en: "Use a tileset.json with Gaussian extensions; use the Spark source for single files." })
}

const splatSchema = () => ({
  source: {
    $: { label: t({ zh: "数据源", en: "Source" }) },
    kind: { value: INITIAL_SOURCE, label: t({ zh: "选择案例", en: "Preset" }), options: {
      [SOURCES.svirnas.label]: "svirnas", [SOURCES.elevator.label]: "elevator",
      [SOURCES.ion.label]: "ion", [SOURCES.butterfly.label]: "butterfly",
      [t({ zh: "自定义 3D Tiles", en: "Custom 3D Tiles" })]: "custom",
    } },
    description: { type: "hint" as const, value: sourceDescription(INITIAL_SOURCE) },
  },
  connection: {
    $: { label: t({ zh: "连接配置", en: "Connection" }) },
    url: { value: SOURCES[INITIAL_SOURCE].url, label: "URL" },
    assetId: { value: "4547222", label: "Asset ID" },
    token: { value: "", label: "Ion token" },
    load: { label: t({ zh: "加载 / 重试", en: "Load / Retry" }), onClick: () => { void loadSource() } },
    locate: { label: t({ zh: "定位资源", en: "Fly to source" }), onClick: flyToSource },
    remove: { label: t({ zh: "移除资源", en: "Remove" }), onClick: () => {
      clearSource(); setStatus(t({ zh: "资源已移除。", en: "Source removed." }))
    } },
  },
  display: {
    $: { label: t({ zh: "显示控制", en: "Display" }) },
    visible: { value: true, label: t({ zh: "显示高斯", en: "Show splats" }) },
    globe: { value: true, label: t({ zh: "显示地球", en: "Show globe" }) },
    detail: { value: 8, min: 1, max: 32, step: 1, label: t({ zh: "细节误差", en: "Detail error" }) },
  },
  status: {
    $: { label: t({ zh: "状态", en: "Status" }) },
    message: { type: "hint" as const, value: t({ zh: "请选择数据源。", en: "Choose a source." }) },
    credit: { type: "hint" as const, value: "WilliamLiu-1997 · 3DGS samples" },
  },
})

function bindPanel(currentPanel: TelluxPanel<ReturnType<typeof splatSchema>>) {
  const { controls } = currentPanel
  const token = currentPanel.getFieldElement("connection.token")
  if (token instanceof HTMLInputElement) {
    token.type = "password"
    token.placeholder = t({ zh: "官方样例可留空", en: "Optional for the official sample" })
  }
  let previousSource = controls.source.kind
  const sourceEffect = controls.effect(() => {
    const source = controls.source.kind as SourceId
    controls.visibility("connection.url", source !== "ion")
    controls.visibility("connection.assetId", source === "ion")
    controls.visibility("connection.token", source === "ion")
    controls.visibility("display.detail", source !== "butterfly")
    controls.source.description = sourceDescription(source)
    controls.status.credit = source === "ion" ? "Cesium ion · Bentley Systems"
      : source === "butterfly" ? "Spark · sparkjs.dev"
      : source === "custom" ? "" : "WilliamLiu-1997 · 3DGS samples"
    if (source !== previousSource) {
      previousSource = source
      controls.connection.url = SOURCES[source].url
      queueMicrotask(() => { void loadSource() })
    }
  })
  const displayEffect = controls.effect(() => {
    void controls.display.visible; void controls.display.globe; void controls.display.detail
    syncDisplay()
  })
  return () => { sourceEffect(); displayEffect() }
}

panel = createTelluxPanel(splatSchema, {
  id: "gaussian-splat-panel",
  title: () => t({ zh: "高斯泼溅 · 数据源浏览", en: "Gaussian splats · Sources" }),
  statusPath: "status.message", onRebuild: bindPanel,
})
void loadSource()
animationFrame = window.requestAnimationFrame(frame)
window.addEventListener("beforeunload", () => {
  window.cancelAnimationFrame(animationFrame)
  clearSource()
  panel?.dispose()
  viewer.destroy()
})
