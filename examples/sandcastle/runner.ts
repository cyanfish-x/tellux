import tellux, { createWindSwayLeavesMaterial } from "../../src"
import * as THREE from "three"
import { TilesRenderer } from "3d-tiles-renderer"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import {
  createTiandituWmtsPreprocessURL,
  createTiandituXYZImagery,
  tiandituTerrainServiceTemplate,
  buildTiandituTerrainUrls,
  defaultTerrainUrl,
  defaultTiandituToken,
  defaultTiandituTokens,
  showTokenNotice,
  getTokenNoticeMessage,
  exampleMapServiceConfig,
} from "../shared"
import { formatHeight, mountLocationReadout } from "../location-readout"
import { setupExamplePanels } from "../example-panel"
import { createTelluxPanel } from "../example-panel-leva"
import { ExampleMessage, showExampleMessage } from "../example-message"
import { setupSymbolPanel } from "../setupSymbolPanel"
import { applyTranslations, bootExampleI18n, resolveLocale, t } from "../i18n"
import type { BootExampleI18nOptions } from "../i18n"
import {
  GAUSSIAN_SPLAT_RUNTIME_BINDING_NAMES,
  HISM_RUNTIME_BINDING_NAMES,
  THREEJS_INTEROP_RUNTIME_BINDING_NAMES,
  WATER_AREA_RUNTIME_BINDING_NAMES,
  detectOptionalRuntimeBindings,
} from "./runtime-bindings"
import exampleStyles from "../styles.css?raw"
import levaStyles from "../../../leva-vanilla/src/styles/index.css?inline"
import type { SandboxLogLevel, SandcastleRunPayload } from "./types"

const STORAGE_PREFIX = "tellux:sandcastle-run:"

function serializeConsoleValue(value: unknown) {
  if (value instanceof Error) {
    return value.stack ?? value.message
  }
  if (typeof value === "string") {
    return value
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

function postLog(runId: string | undefined, level: SandboxLogLevel, values: unknown[]) {
  window.parent.postMessage(
    {
      type: "sandbox-log",
      runId,
      level,
      values: values.map(serializeConsoleValue),
    },
    window.location.origin
  )
}

function installConsoleBridge(runId?: string) {
  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  }

  ;(["log", "info", "warn", "error"] as const).forEach((level) => {
    console[level] = (...values: unknown[]) => {
      original[level](...values)
      postLog(runId, level, values)
    }
  })
}

function loadPayload() {
  const params = new URLSearchParams(window.location.search)
  const key = params.get("run")
  const encodedPayload = params.get("payload")

  if (encodedPayload) {
    return JSON.parse(decodeURIComponent(encodedPayload)) as SandcastleRunPayload
  }

  if (!key) {
    return null
  }

  const rawPayload = localStorage.getItem(`${STORAGE_PREFIX}${key}`)
  return rawPayload ? (JSON.parse(rawPayload) as SandcastleRunPayload) : null
}

function injectExampleStyles(document: Document) {
  const style = document.createElement("style")
  style.textContent = `${levaStyles}\n${exampleStyles}`
  return style
}

function prepareHtml(html: string) {
  const document = new DOMParser().parseFromString(html, "text/html")
  let injectedStyles = false
  document
    .querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]')
    .forEach((link) => {
      const href = link.getAttribute("href")?.trim()
      if (href !== "./styles.css" && href !== "styles.css" && href !== "../styles.css") {
        return
      }

      link.replaceWith(injectExampleStyles(document))
      injectedStyles = true
    })
  if (!injectedStyles) {
    document.head.append(injectExampleStyles(document))
  }
  if (!document.querySelector("base")) {
    const base = document.createElement("base")
    base.href = "../"
    document.head.prepend(base)
  }
  return `<!doctype html>\n${document.documentElement.outerHTML}`
}

function applyHtml(html: string) {
  document.open()
  document.write(prepareHtml(html))
  document.close()
}

function removeOriginalModuleScripts() {
  document
    .querySelectorAll('script[type="module"][src]')
    .forEach((script) => script.remove())
}

function stripModuleDeclarations(code: string) {
  return code
    .replace(/^\s*import\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import[\s\S]*?\s+from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*export\s+\{\s*\};?\s*$/gm, "")
}

function transformExampleScript(code: string) {
  return stripModuleDeclarations(code).replace(
    /\bimport\s*\.\s*meta\b/g,
    "__sandcastleImportMeta"
  )
}

/** Sandcastle iframe 内不挂语言切换器（父页已有）；示例里仍可调用 bootExampleI18n。 */
function bootExampleI18nInRunner(options: BootExampleI18nOptions = {}) {
  bootExampleI18n({ ...options, toggle: false })
}

async function executeExampleScript(source: string) {
  const optionalBindings = await loadOptionalRuntimeBindings(source)
  const sandcastleImportMeta = {
    env: { ...import.meta.env },
    url: window.location.href,
  }
  const execute = new Function(
    "tellux",
    "THREE",
    "TilesRenderer",
    ...GAUSSIAN_SPLAT_RUNTIME_BINDING_NAMES,
    "GLTFLoader",
    "Tree",
    "createTiandituWmtsPreprocessURL",
    "createTiandituXYZImagery",
    "tiandituTerrainServiceTemplate",
    "buildTiandituTerrainUrls",
    "defaultTerrainUrl",
    "defaultTiandituToken",
    "defaultTiandituTokens",
    "showTokenNotice",
    "getTokenNoticeMessage",
    "mountLocationReadout",
    "formatHeight",
    "setupExamplePanels",
    "createTelluxPanel",
    "setupSymbolPanel",
    "showExampleMessage",
    "ExampleMessage",
    "createWindSwayLeavesMaterial",
    "exampleMapServiceConfig",
    "HISM_DEMO_CENTER",
    "HISM_DEMO_VIEW_POSE",
    "HISM_TREE_PRESETS",
    "buildHismTreeTemplate",
    "buildLegacyTreeTemplate",
    "buildLodTreeArchetypes",
    "buildSimpleTreeArchetypes",
    "createHismDemoViewerOptions",
    "generateFastPlacements",
    "generatePoissonPlacements",
    ...WATER_AREA_RUNTIME_BINDING_NAMES,
    ...THREEJS_INTEROP_RUNTIME_BINDING_NAMES,
    "t",
    "bootExampleI18n",
    "__sandcastleImportMeta",
    `"use strict";\n${transformExampleScript(source)}\n//# sourceURL=tellux-sandcastle-example.js`
  )
  execute(
    tellux,
    THREE,
    TilesRenderer,
    ...GAUSSIAN_SPLAT_RUNTIME_BINDING_NAMES.map(name => optionalBindings.gaussianSplat[name]),
    GLTFLoader,
    optionalBindings.Tree,
    createTiandituWmtsPreprocessURL,
    createTiandituXYZImagery,
    tiandituTerrainServiceTemplate,
    buildTiandituTerrainUrls,
    defaultTerrainUrl,
    defaultTiandituToken,
    defaultTiandituTokens,
    showTokenNotice,
    getTokenNoticeMessage,
    mountLocationReadout,
    formatHeight,
    setupExamplePanels,
    createTelluxPanel,
    setupSymbolPanel,
    showExampleMessage,
    ExampleMessage,
    createWindSwayLeavesMaterial,
    exampleMapServiceConfig,
    ...HISM_RUNTIME_BINDING_NAMES.map(
      (name) => optionalBindings.hism[name]
    ),
    ...WATER_AREA_RUNTIME_BINDING_NAMES.map(
      (name) => optionalBindings.waterArea[name]
    ),
    ...THREEJS_INTEROP_RUNTIME_BINDING_NAMES.map(
      (name) => optionalBindings.threejsInterop[name]
    ),
    t,
    bootExampleI18nInRunner,
    sandcastleImportMeta
  )
}

async function loadOptionalRuntimeBindings(source: string) {
  const required = detectOptionalRuntimeBindings(source)
  const [gaussianSplatModule, treeModule, hismModule, waterAreaModule, threejsInteropModule] =
    await Promise.all([
      required.gaussianSplat
        ? import("../gaussian-splat/sandcastleBindings")
        : null,
      required.tree
        ? import("@dgreenheck/ez-tree")
        : null,
      required.hism
        ? import("../hism/shared")
        : null,
      required.waterArea
        ? import("../water-area/sandcastleBindings")
        : null,
      required.threejsInterop
        ? import("../threejs-interop/sandcastleBindings")
        : null,
    ])

  return {
    gaussianSplat: (gaussianSplatModule ?? {}) as Partial<
      Pick<typeof import("../gaussian-splat/sandcastleBindings"), (typeof GAUSSIAN_SPLAT_RUNTIME_BINDING_NAMES)[number]>
    >,
    Tree: treeModule?.Tree,
    hism: (hismModule ?? {}) as Record<
      (typeof HISM_RUNTIME_BINDING_NAMES)[number],
      unknown
    >,
    waterArea: (waterAreaModule ?? {}) as Partial<
      Pick<
        typeof import("../water-area/sandcastleBindings"),
        (typeof WATER_AREA_RUNTIME_BINDING_NAMES)[number]
      >
    >,
    threejsInterop: (threejsInteropModule ?? {}) as Partial<
      Pick<
        typeof import("../threejs-interop/sandcastleBindings"),
        (typeof THREEJS_INTEROP_RUNTIME_BINDING_NAMES)[number]
      >
    >,
  }
}

async function runExample(payload: SandcastleRunPayload) {
  applyHtml(payload.html)
  installConsoleBridge(payload.runId)
  removeOriginalModuleScripts()
  resolveLocale()
  applyTranslations(document)
  await executeExampleScript(payload.compiledJavascript)
}

void main()

async function main() {
  const params = new URLSearchParams(window.location.search)
  const runId = params.get("runId") ?? undefined
  let payload: SandcastleRunPayload | null = null
  try {
    payload = loadPayload()
    if (!payload) {
      throw new Error("Sandcastle run payload not found.")
    }
    await runExample(payload)
    window.parent.postMessage(
      { type: "sandbox-ready", runId: payload.runId },
      window.location.origin
    )
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    console.error(error)
    window.parent.postMessage(
      {
        type: "sandbox-error",
        runId: payload?.runId ?? runId,
        message,
      },
      window.location.origin
    )
  }
}
