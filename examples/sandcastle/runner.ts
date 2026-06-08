import tellux from "../../src"
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import {
  arcgisWorldImageryUrl,
  defaultTerrainUrl,
  showTokenNotice,
} from "../shared"
import { formatHeight, mountLocationReadout } from "../location-readout"
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

function postLog(level: SandboxLogLevel, values: unknown[]) {
  window.parent.postMessage(
    {
      type: "sandbox-log",
      level,
      values: values.map(serializeConsoleValue),
    },
    window.location.origin
  )
}

function installConsoleBridge() {
  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  }

  ;(["log", "info", "warn", "error"] as const).forEach((level) => {
    console[level] = (...values: unknown[]) => {
      original[level](...values)
      postLog(level, values)
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

function prepareHtml(html: string) {
  const document = new DOMParser().parseFromString(html, "text/html")
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

function executeExampleScript(source: string) {
  const sandcastleImportMeta = {
    env: { ...import.meta.env },
    url: window.location.href,
  }
  const execute = new Function(
    "tellux",
    "THREE",
    "GLTFLoader",
    "arcgisWorldImageryUrl",
    "defaultTerrainUrl",
    "showTokenNotice",
    "mountLocationReadout",
    "formatHeight",
    "__sandcastleImportMeta",
    `"use strict";\n${transformExampleScript(source)}\n//# sourceURL=tellux-sandcastle-example.js`
  )
  execute(
    tellux,
    THREE,
    GLTFLoader,
    arcgisWorldImageryUrl,
    defaultTerrainUrl,
    showTokenNotice,
    mountLocationReadout,
    formatHeight,
    sandcastleImportMeta
  )
}

async function runExample(payload: SandcastleRunPayload) {
  applyHtml(payload.html)
  installConsoleBridge()
  removeOriginalModuleScripts()
  executeExampleScript(payload.compiledJavascript)
}

void main()

async function main() {
  window.parent.postMessage({ type: "sandbox-ready" }, window.location.origin)

  try {
    const payload = loadPayload()
    if (!payload) {
      throw new Error("Sandcastle run payload not found.")
    }
    await runExample(payload)
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    console.error(error)
    window.parent.postMessage(
      {
        type: "sandbox-error",
        message,
      },
      window.location.origin
    )
  }
}
