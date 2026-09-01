import tellux from "../src"
import { bootExampleI18n, t } from "./i18n"
import { exampleMapServiceConfig } from "./shared"
import { mountLocationReadout } from "./location-readout"
import { setupSymbolPanel } from "./setupSymbolPanel"

bootExampleI18n()

const container = document.querySelector("#viewer")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

// 上海陆家嘴一带作为演示区域；高度抬升 50 米避免被地形压住。
// Focus on Lujiazui, Shanghai; heights raised 50m so symbols clear the terrain.
const FOCUS_LONGITUDE = 121.4737
const FOCUS_LATITUDE = 31.2304
const SURFACE_OFFSET = 50

const viewer = new tellux.Viewer(container, {
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  layers: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  camera: {
    latitude: 31.2204,
    longitude: 121.4648,
    height: 1180,
    heading: 7.58,
    pitch: -50.4,
    roll: 0,
  },
  scene: {
    atmosphere: {
      show: true,
      lighting: { mode: "light-source" },
      fallbackAmbientLight: { intensity: 0.8 },
    },
    clouds: { show: false },
  },
})

;(window as any).viewer = viewer

// 预加载 MSDF atlas（方案C：自建 MSDF + TinySDF 回退）
// 命中 atlas 的字符走预生成 MSDF（最高质量、零运行时生成开销）；
// 未命中的字符自动回退到 TinySDF 动态生成。加载失败时静默回退，不影响渲染。
//
// Preload the MSDF atlas (Plan C: self-built MSDF + TinySDF fallback). Characters
// present in the atlas use pre-generated MSDF (best quality, no runtime cost);
// misses fall back to TinySDF. A failed load silently falls back to TinySDF.
tellux
  .preloadFontMsdfAtlas("SimHei", "normal", `${import.meta.env.BASE_URL}fonts/simhei-regular`)
  .catch((error) => {
    console.warn("[symbol example] MSDF atlas 不可用，回退到 TinySDF:", error)
  })

const locationReadout = mountLocationReadout(viewer, {
  parent: container.parentElement ?? document.body,
})

// ----- 图标：从 public/icons 加载真实彩色图标（保留原色，colorize 默认 false）。
// ----- Icons loaded from public/icons as full-color PNGs (original colors preserved).
//
// icon.colorize 默认 false = 保留图标原色直接渲染；若要单色 marker，设 colorize: true
// 并用 color 染色（按 alpha 剪影）。原 30px/45px PNG 比旧的 64px canvas 小，scale
// 相应放大以保持视觉尺寸（可见尺寸 ≈ contentW × scale）。
const iconUrl = (name: string) => `${import.meta.env.BASE_URL}icons/${name}.png`
const pinIcon = iconUrl('locate')
const starIcon = iconUrl('star')
const restaurantIcon = iconUrl('餐厅')
const barIcon = iconUrl('酒吧')

// ----- 1) POI：图标 + 文字标签（icon + text 共锚点，anchor bottom）。-----
// ----- 1) POIs: icon + text sharing an anchor (anchor bottom). -----
const poiList: Array<[number, number, string, string]> = [
  [FOCUS_LONGITUDE - 0.006, FOCUS_LATITUDE + 0.004, t({ zh: "陆家嘴", en: "Lujiazui" }), pinIcon],
  [FOCUS_LONGITUDE + 0.005, FOCUS_LATITUDE + 0.005, t({ zh: "东方明珠", en: "Oriental Pearl Tower" }), starIcon],
  [FOCUS_LONGITUDE + 0.008, FOCUS_LATITUDE - 0.004, t({ zh: "上海中心", en: "Shanghai Tower" }), pinIcon],
]
const poiIds: string[] = []
poiList.forEach(([lon, lat, label, icon], index) => {
  const id = `poi-${index}`
  poiIds.push(id)
  viewer.entities.add({
    id,
    position: [lon, lat, SURFACE_OFFSET],
    symbol: {
      // 原色图标（colorize 默认 false）；30px PNG 用 scale 1.3 保持与旧 64px×0.6 相近的视觉尺寸。
      icon: { image: icon, scale: 1 },
      text: {
        text: label,
        font: "SimHei",
        fontSize: 15,
        fillColor: "#ffffff",
        outlineColor: "#0f172a",
        outlineWidth: 1.2,
      },
      anchor: "bottom",
      textRelative: "right",
      textIconSpacing: 4,
    },
    properties: { kind: "poi", label },
  })
})

// ----- 2) 纯文字标签（带 halo），用于地名标注。-----
// ----- 2) Text-only labels with halo, for place names. -----
const labelList: Array<[number, number, string]> = [
  [FOCUS_LONGITUDE - 0.01, FOCUS_LATITUDE - 0.006, t({ zh: "黄浦江", en: "Huangpu River" })],
  [FOCUS_LONGITUDE + 0.011, FOCUS_LATITUDE + 0.001, t({ zh: "浦东新区", en: "Pudong New Area" })],
  [FOCUS_LONGITUDE - 0.003, FOCUS_LATITUDE + 0.009, t({ zh: "外滩", en: "The Bund" })],
]
const labelIds: string[] = []
labelList.forEach(([lon, lat, label], index) => {
  const id = `label-${index}`
  labelIds.push(id)
  viewer.entities.add({
    id,
    position: [lon, lat, SURFACE_OFFSET],
    symbol: {
      text: {
        text: label,
        font: "SimHei",
        fontSize: 14,
        fillColor: "#fde68a",
        outlineColor: "#7c2d12",
        outlineWidth: 1.2,
      },
      anchor: "center",
    },
    properties: { kind: "label", label },
  })
})

// ----- 3) 纯图标 marker（不同彩色图标，保留原色）。-----
// ----- 3) Icon-only markers (different full-color icons). -----
// 45px 图标 scale 0.75、30px 图标 scale 1.1，统一到 ~34px 可见尺寸。
const iconList: Array<[number, number, string, number]> = [
  [FOCUS_LONGITUDE - 0.009, FOCUS_LATITUDE + 0.002, restaurantIcon, 0.75],
  [FOCUS_LONGITUDE + 0.003, FOCUS_LATITUDE - 0.008, barIcon, 0.75],
  [FOCUS_LONGITUDE + 0.013, FOCUS_LATITUDE - 0.007, starIcon, 1.1],
]
const iconIds: string[] = []
iconList.forEach(([lon, lat, icon, scale], index) => {
  const id = `icon-${index}`
  iconIds.push(id)
  viewer.entities.add({
    id,
    position: [lon, lat, SURFACE_OFFSET],
    symbol: {
      icon: { image: icon, scale },
      anchor: "center",
    },
    properties: { kind: "icon", label: `图标 ${index + 1}` },
  })
})

// ----- 4) 多行文字 + 背景框（圆角），演示 maxWidth 换行与背景。-----
// ----- 4) Multi-line text with a rounded background (maxWidth wrapping). -----
const multilineId = "multiline"
viewer.entities.add({
  id: multilineId,
  position: [FOCUS_LONGITUDE, FOCUS_LATITUDE - 0.012, SURFACE_OFFSET],
  symbol: {
    text: {
      text: "陆家嘴金融区\n东方明珠 · 上海中心",
      font: "SimHei",
      fontSize: 13,
      lineHeight: 1.3,
      maxWidth: 120,
      fillColor: "#e0f2fe",
      outlineColor: "#082f49",
      outlineWidth: 1.2,
      backgroundColor: "rgba(15, 23, 42, 0.72)",
      backgroundCornerRadius: 6,
      padding: [8, 5],
    },
    anchor: "top",
    pixelOffset: [0, -10],
  },
  properties: { kind: "multiline", label: "陆家嘴金融区" },
})

// ----- 5) 与 point 共存：同一实体既有圆点又有 symbol（§4.1）。-----
// ----- 5) Coexisting point + symbol on one entity (§4.1). -----
viewer.entities.add({
  id: "coexist",
  position: [FOCUS_LONGITUDE - 0.014, FOCUS_LATITUDE + 0.006, SURFACE_OFFSET],
  point: { pixelSize: 10, color: "#34d399", outlineColor: "#0f172a", outlineWidth: 2 },
  symbol: {
    text: {
      text: t({ zh: "圆点 + 标签", en: "Dot + label" }),
      font: "SimHei",
      fontSize: 13,
      fillColor: "#ffffff",
      outlineColor: "#064e3b",
      outlineWidth: 1.2,
    },
    anchor: "right",
    pixelOffset: [-8, 0],
  },
  properties: { kind: "coexist", label: t({ zh: "圆点 + 标签", en: "Dot + label" }) },
})

const STRESS_MAX = 20_000
const STRESS_CHUNK = 250
const STRESS_HALF_SPAN_DEG = 0.035
const STRESS_LABELS = [
  t({ zh: "陆家嘴", en: "Lujiazui" }),
  t({ zh: "东方明珠", en: "Oriental Pearl Tower" }),
  t({ zh: "上海中心", en: "Shanghai Tower" }),
  t({ zh: "外滩", en: "The Bund" }),
  t({ zh: "黄浦江", en: "Huangpu River" }),
  t({ zh: "浦东新区", en: "Pudong New Area" }),
  "金融城",
  "观景台",
]
const STRESS_ICONS = [pinIcon, starIcon, restaurantIcon, barIcon]
const stressIds: string[] = []
let stressGenerating = false
let panelHandle: ReturnType<typeof setupSymbolPanel> | undefined

const recolorPalette = ["#fde68a", "#67e8f9", "#fca5a5", "#bef264"]
let recolorIndex = 0

function getInitialStatus() {
  return t(
    {
      zh: "已绘制 {poi} 个 POI + {labels} 个文字标签 + {icons} 个图标 + 多行/背景 + 圆点共存。",
      en: "Drew {poi} POIs + {labels} text labels + {icons} icons + multiline/background + dot coexistence.",
    },
    { poi: poiList.length, labels: labelList.length, icons: iconList.length }
  )
}

function recolorFirstLabel() {
  const entity = viewer.entities.getById("label-0")
  const text = entity?.symbol?.text
  if (!text) return
  recolorIndex = (recolorIndex + 1) % recolorPalette.length
  text.fillColor = recolorPalette[recolorIndex]
  panelHandle?.setStatus(
    t(
      {
        zh: '"黄浦江" 标签填充色已改为 {color}（未重建纹理）。',
        en: '"Huangpu River" label fill changed to {color} (texture not rebuilt).',
      },
      { color: recolorPalette[recolorIndex] }
    )
  )
}

function clearStressSymbols() {
  for (const id of stressIds) {
    viewer.entities.remove(id)
  }
  stressIds.length = 0
}
async function generateStressSymbols() {
  if (stressGenerating || !panelHandle) return

  const requested = Math.floor(panelHandle.getStressCount())
  if (!Number.isFinite(requested) || requested < 1) {
    panelHandle.setStatus(
      t({ zh: "请输入有效的压测数量（≥ 1）。", en: "Enter a valid stress count (≥ 1)." })
    )
    return
  }
  const count = Math.min(requested, STRESS_MAX)

  stressGenerating = true
  panelHandle.setStressControlsDisabled(true)
  clearStressSymbols()

  const cols = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / cols)
  const startedAt = performance.now()

  panelHandle.setStatus(
    t(
      { zh: "正在生成 {count} 个压测 Symbol…", en: "Generating {count} stress symbols…" },
      { count }
    )
  )

  try {
    for (let start = 0; start < count; start += STRESS_CHUNK) {
      const end = Math.min(start + STRESS_CHUNK, count)
      for (let i = start; i < end; i++) {
        const col = i % cols
        const row = Math.floor(i / cols)
        const u = cols === 1 ? 0.5 : col / (cols - 1)
        const v = rows === 1 ? 0.5 : row / (rows - 1)
        const jitterLon = (Math.random() - 0.5) * (STRESS_HALF_SPAN_DEG / cols)
        const jitterLat = (Math.random() - 0.5) * (STRESS_HALF_SPAN_DEG / rows)
        const lon =
          FOCUS_LONGITUDE -
          STRESS_HALF_SPAN_DEG +
          u * STRESS_HALF_SPAN_DEG * 2 +
          jitterLon
        const lat =
          FOCUS_LATITUDE -
          STRESS_HALF_SPAN_DEG +
          v * STRESS_HALF_SPAN_DEG * 2 +
          jitterLat
        const label = STRESS_LABELS[i % STRESS_LABELS.length]
        const icon = STRESS_ICONS[i % STRESS_ICONS.length]
        const id = `stress-${i}`
        stressIds.push(id)
        viewer.entities.add({
          id,
          position: [lon, lat, SURFACE_OFFSET],
          symbol: {
            icon: { image: icon, scale: 0.85 },
            text: {
              text: label,
              font: "SimHei",
              fontSize: 12,
              fillColor: "#ffffff",
              outlineColor: "#0f172a",
              outlineWidth: 1,
            },
            anchor: "bottom",
            textRelative: "right",
            textIconSpacing: 3,
          },
          properties: { kind: "stress", label, index: i },
        })
      }
      panelHandle.setStatus(
        t(
          {
            zh: "正在生成压测 Symbol… {end} / {count}",
            en: "Generating stress symbols… {end} / {count}",
          },
          { end, count }
        )
      )
      await yieldToBrowser()
    }

    const elapsedMs = performance.now() - startedAt
    panelHandle.setStatus(
      t(
        {
          zh: "压测完成：{count} 个 Symbol，耗时 {ms} ms（约 {rate} 个/秒）。当前实体总数 {total}。",
          en: "Stress test done: {count} symbols in {ms} ms (~{rate}/s). Total entities: {total}.",
        },
        {
          count,
          ms: elapsedMs.toFixed(0),
          rate: (count / (elapsedMs / 1000)).toFixed(0),
          total: viewer.entities.values.length,
        }
      )
    )
  } finally {
    stressGenerating = false
    panelHandle.setStressControlsDisabled(false)
  }
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

panelHandle = setupSymbolPanel({
  viewer,
  poiIds,
  labelIds,
  iconIds,
  multilineId,
  clearStressSymbols,
  generateStressSymbols,
  recolorFirstLabel,
  clearAllSymbols: () => {
    viewer.entities.removeAll()
    stressIds.length = 0
  },
  getInitialStatus,
  isStressGenerating: () => stressGenerating,
})

viewer.on("click", (event) => {
  const picked = event.pick?.type === "entity" ? event.pick.entity : null
  if (!picked) {
    panelHandle?.setPickReadout(t({ zh: "未命中实体", en: "No entity hit" }))
    return
  }
  const { entity } = picked
  const label = (entity.properties.label as string) ?? entity.id
  const kind = (entity.properties.kind as string) ?? "unknown"
  panelHandle?.setPickReadout(
    t(
      {
        zh: "命中：{label}（类型：{kind}，id：{id}）",
        en: "Hit: {label} (type: {kind}, id: {id})",
      },
      { label, kind, id: entity.id }
    )
  )
})

window.addEventListener("beforeunload", () => {
  locationReadout.destroy()
  panelHandle?.dispose()
  viewer.destroy()
})
