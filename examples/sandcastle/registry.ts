import { messages } from "../i18n/messages"
import type { LocalizedText } from "../i18n"
import type { SandcastleExample } from "./types"

const htmlModules = {
  ...import.meta.glob("../*.html", {
    eager: true,
    query: "?raw",
    import: "default",
  }),
  ...import.meta.glob("../hism/*.html", {
    eager: true,
    query: "?raw",
    import: "default",
  }),
} as Record<string, string>

const scriptModules = {
  ...import.meta.glob("../*.ts", {
    eager: true,
    query: "?raw",
    import: "default",
  }),
  ...import.meta.glob("../hism/*.ts", {
    eager: true,
    query: "?raw",
    import: "default",
  }),
} as Record<string, string>

const categoryById: Record<string, string> = {
  "rendering-medium-integration": "Rendering",
  "rendering-stages": "Rendering",
  "rendering-splat-atmosphere": "Rendering",
  "rendering-cloud-transparency": "Rendering",
  "3d-tiles": "Tiles",
  atmosphere: "Rendering",
  basic: "Viewer",
  "data-sources": "Layers",
  entities: "Drawing",
  symbol: "Drawing",
  "fly-to": "Camera",
  "3d-tiles-picking": "Tiles",
  "gaussian-splat-3d-tiles": "Tiles",
  "google-photorealistic-3d-tiles": "Tiles",
  "point-cloud-3d-tiles": "Tiles",
  "instanced-horses": "Models",
  "mixed-height-sampling-horses": "Sampling",
  terrain: "Terrain",
  "threejs-interop": "Models",
  vegetation: "Vegetation",
  "hism-forest": "HISM",
  "hism-compare": "HISM",
  "webgpu-basic": "Rendering",
  "water-area": "Rendering",
}

const tagByTerm: Array<[string, string]> = [
  ["3d tiles", "3D Tiles"],
  ["point cloud", "Point Cloud"],
  ["点云", "Point Cloud"],
  ["pnts", "Point Cloud"],
  ["arcgis", "Imagery"],
  ["camera", "Camera"],
  ["cesium ion", "Cesium Ion"],
  ["click", "Pick"],
  ["cloud", "Clouds"],
  ["fly", "Flight"],
  ["entity", "Drawing"],
  ["polygon", "Drawing"],
  ["polyline", "Drawing"],
  ["geojson", "GeoJSON"],
  ["gaussian", "3DGS"],
  ["google", "Google"],
  ["gltf", "glTF"],
  ["imagery", "Imagery"],
  ["layer", "Layers"],
  ["点", "Drawing"],
  ["折线", "Drawing"],
  ["多边形", "Drawing"],
  ["实体", "Drawing"],
  ["图标", "Drawing"],
  ["标签", "Drawing"],
  ["symbol", "Drawing"],
  ["model", "Model"],
  ["morph", "Instancing"],
  ["mvt", "MVT"],
  ["sampleheight", "Sampling"],
  ["splat", "3DGS"],
  ["terrain", "Terrain"],
  ["three.js", "Three.js"],
  ["tree", "Vegetation"],
  ["vegetation", "Vegetation"],
  ["forest", "Vegetation"],
  ["ez-tree", "Vegetation"],
  ["instancedmesh", "Instancing"],
  ["wms", "WMS"],
  ["wmts", "WMTS"],
  ["天地图", "Tianditu"],
  ["xyz", "XYZ"],
  ["体积云", "Clouds"],
  ["高斯", "3DGS"],
  ["地形", "Terrain"],
  ["图层", "Layers"],
  ["模型", "Model"],
  ["相机", "Camera"],
  ["点击", "Pick"],
  ["飞行", "Flight"],
]

const excludedHtmlFiles = new Set(["index", "sandcastle", "gallery"])
const defaultExampleId = "basic"

function getFileId(path: string) {
  return path.match(/\/([^/]+)\.html$/)?.[1] ?? path
}

function parseHtmlDocument(html: string) {
  return new DOMParser().parseFromString(html, "text/html")
}

function normalizeHtmlForEditor(html: string) {
  const document = parseHtmlDocument(html)
  document
    .querySelectorAll('script[type="module"]')
    .forEach((script) => script.remove())
  document.querySelector(".icon-button--back")?.remove()
  return `<!doctype html>\n${document.documentElement.outerHTML}\n`
}

function findScriptPath(htmlPath: string, html: string) {
  const document = parseHtmlDocument(html)
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]')
  const source = script?.getAttribute("src")
  if (!source) return null

  const htmlDir = htmlPath.replace(/\/[^/]+$/, "")
  if (source.startsWith("./")) {
    return `${htmlDir}/${source.slice(2)}`
  }
  if (source.startsWith("/")) {
    return `..${source}`
  }
  return `${htmlDir}/${source}`
}

function getScriptSource(scriptPath: string | null) {
  return scriptPath ? scriptModules[scriptPath] : undefined
}

function getHtmlFallbackTitle(html: string) {
  const document = parseHtmlDocument(html)
  return (
    document.querySelector("h1")?.textContent?.trim() ||
    document.querySelector(".example-panel__title")?.textContent?.trim() ||
    document
      .querySelector("title")
      ?.textContent?.replace(/^Tellux\s*/i, "")
      .trim() ||
    ""
  )
}

function getHtmlFallbackDescription(html: string) {
  const document = parseHtmlDocument(html)
  return (
    document
      .querySelector(".toolbar p, .layer-manager__status, .status")
      ?.textContent?.trim() || ""
  )
}

function localizedFromKey(
  key: string,
  fallbackZh: string,
  fallbackEn = fallbackZh
): LocalizedText {
  return {
    zh: messages.zh[key] ?? fallbackZh,
    en: messages.en[key] ?? fallbackEn,
  }
}

function getTitle(id: string, html: string): LocalizedText {
  const fallback = getHtmlFallbackTitle(html) || id
  return localizedFromKey(`example.${id}.registry.title`, fallback)
}

function getDescription(id: string, html: string): LocalizedText {
  const fallback =
    getHtmlFallbackDescription(html) ||
    messages.zh["sandcastle.registry.defaultDescription"] ||
    "完整页面示例，可编辑 JavaScript 和 HTML/CSS 后重新运行。"
  return localizedFromKey(
    `example.${id}.registry.description`,
    fallback,
    messages.en["sandcastle.registry.defaultDescription"] ?? fallback
  )
}

function getOrder(html: string) {
  const document = parseHtmlDocument(html)
  const content = document
    .querySelector('meta[name="sandcastle-order"]')
    ?.getAttribute("content")
  const order = content ? Number.parseFloat(content) : Number.NaN
  return Number.isFinite(order) ? order : undefined
}

function getThumbnail(html: string) {
  const document = parseHtmlDocument(html)
  return (
    document
      .querySelector('meta[name="sandcastle-thumbnail"]')
      ?.getAttribute("content")
      ?.trim() || undefined
  )
}

function getTags(text: string) {
  const normalizedText = text.toLowerCase()
  const tags = tagByTerm
    .filter(([term]) => normalizedText.includes(term))
    .map(([, tag]) => tag)
  return Array.from(new Set(tags)).slice(0, 4)
}

function createExample(path: string, html: string): SandcastleExample | null {
  const id = getFileId(path)
  if (excludedHtmlFiles.has(id)) {
    return null
  }

  const scriptPath = findScriptPath(path, html)
  const javascript = getScriptSource(scriptPath)
  if (!scriptPath || javascript === undefined) {
    return null
  }

  const title = getTitle(id, html)
  const description = getDescription(id, html)
  const order = getOrder(html)
  const thumbnail = getThumbnail(html)
  return {
    id,
    title,
    ...(order === undefined ? {} : { order }),
    ...(thumbnail === undefined ? {} : { thumbnail }),
    category: categoryById[id] ?? "Example",
    description,
    tags: getTags(
      `${title.zh} ${title.en} ${description.zh} ${description.en} ${javascript}`
    ),
    html: normalizeHtmlForEditor(html),
    javascript,
    sourceHtmlPath: path,
    sourceScriptPath: scriptPath,
  }
}

const allSandcastleExamples: SandcastleExample[] = Object.entries(htmlModules)
  .map(([path, html]) => createExample(path, html))
  .filter((example): example is SandcastleExample => example !== null)
  .sort(
    (a, b) =>
      (a.order ?? Number.MAX_SAFE_INTEGER) -
        (b.order ?? Number.MAX_SAFE_INTEGER) ||
      a.title.zh.localeCompare(b.title.zh, "zh-CN")
  )

export const defaultSandcastleExample =
  allSandcastleExamples.find((example) => example.id === defaultExampleId) ??
  allSandcastleExamples[0]

export const sandcastleExamples: SandcastleExample[] = allSandcastleExamples

export function getSandcastleExample(id: string | null) {
  return allSandcastleExamples.find((example) => example.id === id) ?? null
}
