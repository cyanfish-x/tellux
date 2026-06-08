import tellux, { type ViewerOptions } from "../../src"
import {
  applyInitialSettings,
  loadStoredExampleSettings,
  mountExampleSettingsPanel,
  type ExampleSettingsPanelOptions,
} from "../settings-panel/index"
import { arcgisWorldImageryUrl } from "../shared"
import type { SandboxLogLevel } from "./types"

type ExampleCleanup = void | (() => void) | Promise<void | (() => void)>

const DEFAULT_TERRAIN_URL = import.meta.env.VITE_CESIUM_TERRAIN_URL ?? ""

tellux.baseUrl = "/tellux/"

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

function createTelluxViewer(
  container: HTMLElement,
  options: ViewerOptions = {},
  settingsPanel: ExampleSettingsPanelOptions = {}
) {
  const layers = options.layers ?? [
    {
      source: {
        type: "xyz",
        url: arcgisWorldImageryUrl,
        levels: 19,
      },
    },
  ]
  const viewer = new tellux.Viewer(container, {
    dracoDecoderPath: "/draco/gltf/",
    terrain: DEFAULT_TERRAIN_URL
      ? {
          url: DEFAULT_TERRAIN_URL,
        }
      : undefined,
    ...options,
    layers,
  })
  const panelSettings = {
    ...settingsPanel,
    ...loadStoredExampleSettings(),
  }
  applyInitialSettings(viewer, panelSettings)
  mountExampleSettingsPanel(viewer, panelSettings)
  ;(window as any).viewer = viewer
  return viewer
}

function createViewerShell() {
  document.body.innerHTML = `
    <main class="viewer-shell sandcastle-preview-shell">
      <div id="viewer"></div>
    </main>
  `
  const container = document.querySelector("#viewer")
  if (!(container instanceof HTMLElement)) {
    throw new Error("Viewer container not found.")
  }
  return container
}

async function runExample(code: string) {
  const container = createViewerShell()
  const execute = new Function(
    "container",
    "tellux",
    "createTelluxViewer",
    `"use strict";\nreturn (async () => {\n${code}\n})()`
  ) as (
    container: HTMLElement,
    telluxModule: typeof tellux,
    viewerFactory: typeof createTelluxViewer
  ) => ExampleCleanup

  const cleanup = await execute(container, tellux, createTelluxViewer)
  if (typeof cleanup === "function") {
    window.addEventListener("beforeunload", cleanup, { once: true })
  }
}

installConsoleBridge()
window.parent.postMessage({ type: "sandbox-ready" }, window.location.origin)

void main()

async function main() {
  const params = new URLSearchParams(window.location.search)
  const encodedCode = params.get("code")

  if (encodedCode) {
    try {
      await runExample(decodeURIComponent(encodedCode))
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
}
