import type { SandcastleExample } from "./types"

const htmlModules = import.meta.glob("../*.html", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>

const scriptModules = import.meta.glob("../*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>

const categoryById: Record<string, string> = {
  "3d-tiles": "Tiles",
  atmosphere: "Rendering",
  basic: "Viewer",
  click: "Interaction",
  "data-sources": "Layers",
  "fly-to": "Camera",
  "instanced-horses": "Models",
  "mixed-height-sampling-horses": "Sampling",
  terrain: "Terrain",
  "threejs-interop": "Models",
}

const tagByTerm: Array<[string, string]> = [
  ["3d tiles", "3D Tiles"],
  ["arcgis", "Imagery"],
  ["camera", "Camera"],
  ["cesium ion", "Cesium Ion"],
  ["click", "Pick"],
  ["cloud", "Clouds"],
  ["fly", "Flight"],
  ["geojson", "GeoJSON"],
  ["gltf", "glTF"],
  ["imagery", "Imagery"],
  ["layer", "Layers"],
  ["model", "Model"],
  ["morph", "Instancing"],
  ["mvt", "MVT"],
  ["sampleheight", "Sampling"],
  ["terrain", "Terrain"],
  ["three.js", "Three.js"],
  ["wms", "WMS"],
  ["xyz", "XYZ"],
  ["体积云", "Clouds"],
  ["地形", "Terrain"],
  ["图层", "Layers"],
  ["模型", "Model"],
  ["相机", "Camera"],
  ["点击", "Pick"],
  ["飞行", "Flight"],
]

const excludedHtmlFiles = new Set(["index", "sandcastle"])

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

function findScriptPath(html: string) {
  const document = parseHtmlDocument(html)
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]')
  const source = script?.getAttribute("src")
  return source ? `..${source.replace(/^\./, "")}` : null
}

function getScriptSource(scriptPath: string | null) {
  return scriptPath ? scriptModules[scriptPath] : undefined
}

function getTitle(id: string, html: string) {
  const document = parseHtmlDocument(html)
  return (
    document.querySelector("h1")?.textContent?.trim() ||
    document.querySelector("title")?.textContent?.replace(/^Tellux\s*/i, "").trim() ||
    id
  )
}

function getDescription(html: string) {
  const document = parseHtmlDocument(html)
  return (
    document.querySelector(".toolbar p, .layer-manager__status, .status")?.textContent?.trim() ||
    "完整页面示例，可编辑 JavaScript 和 HTML/CSS 后重新运行。"
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

  const scriptPath = findScriptPath(html)
  const javascript = getScriptSource(scriptPath)
  if (!scriptPath || javascript === undefined) {
    return null
  }

  const title = getTitle(id, html)
  const description = getDescription(html)
  return {
    id,
    title,
    category: categoryById[id] ?? "Example",
    description,
    tags: getTags(`${title} ${description} ${javascript}`),
    html: normalizeHtmlForEditor(html),
    javascript,
    sourceHtmlPath: path,
    sourceScriptPath: scriptPath,
  }
}

export const sandcastleExamples: SandcastleExample[] = Object.entries(htmlModules)
  .map(([path, html]) => createExample(path, html))
  .filter((example): example is SandcastleExample => example !== null)
  .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"))

export function getSandcastleExample(id: string | null) {
  return sandcastleExamples.find((example) => example.id === id) ?? sandcastleExamples[0]
}
