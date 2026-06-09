import * as monaco from "monaco-editor"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"
import { defaultSandcastleExample, getSandcastleExample, sandcastleExamples } from "./registry"
import type {
  SandcastleEditorPane,
  SandcastleExample,
  SandcastleRunPayload,
  SandboxMessage,
} from "./types"

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "typescript" || label === "javascript") {
      return new tsWorker()
    }
    return new editorWorker()
  },
}

const STORAGE_PREFIX = "tellux:sandcastle-run:"
const MAX_STORED_RUNS = 6
const root = document.querySelector("#sandcastle-root")

if (!(root instanceof HTMLElement)) {
  throw new Error("Sandcastle root not found.")
}

const sandcastleRoot = root

function queryRequired<T extends Element>(
  selector: string,
  elementConstructor: { new (...args: any[]): T }
) {
  const element = sandcastleRoot.querySelector(selector)
  if (!(element instanceof elementConstructor)) {
    throw new Error(`Sandcastle UI element not found: ${selector}`)
  }
  return element
}

root.innerHTML = `
  <main class="sandcastle">
    <header class="sandcastle-topbar">
      <a class="portal-brand" href="./index.html" aria-label="Tellux 首页">
        <span class="portal-brand__mark" aria-hidden="true">T</span>
        <span>Tellux</span>
      </a>
      <div class="sandcastle-title">
        <strong data-current-title></strong>
      </div>
      <div class="sandcastle-actions" aria-label="示例操作">
        <a class="sandcastle-button" data-action="standalone" href="./sandcastle/runner.html" target="_blank" rel="noreferrer">Standalone</a>
      </div>
    </header>
    <nav class="sandcastle-rail" aria-label="Sandcastle views">
      <button class="sandcastle-rail__button" data-view="examples" type="button" aria-label="案例">
        <span aria-hidden="true">▧</span>
      </button>
      <button class="sandcastle-rail__button" data-view="code" type="button" aria-label="代码">
        <span aria-hidden="true">&lt;/&gt;</span>
      </button>
      <a class="sandcastle-rail__button sandcastle-rail__link" data-action="open-docs" href="./docs/" target="_blank" rel="noreferrer" aria-label="文档" title="文档">
        <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
        </svg>
      </a>
    </nav>
    <aside class="sandcastle-sidebar" data-panel="examples" aria-label="示例列表">
      <div class="sandcastle-sidebar__search">
        <label class="sandcastle-search-field">
          <svg class="sandcastle-search-field__icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <circle cx="11" cy="11" r="7" />
            <path d="m16 16 4 4" />
          </svg>
          <input class="sandcastle-search" type="search" placeholder="搜索示例或标签" aria-label="搜索示例或标签" />
        </label>
        <button class="sandcastle-side-toggle" data-action="toggle-side-panel" type="button" aria-expanded="true" aria-label="收起侧边栏" title="收起侧边栏"></button>
      </div>
      <div class="sandcastle-gallery__list"></div>
    </aside>
    <section class="sandcastle-editor-panel" data-panel="code" aria-label="代码编辑">
      <div class="sandcastle-editor-tabs" role="tablist" aria-label="代码类型">
        <button class="sandcastle-editor-tab" data-pane="javascript" type="button" role="tab">Javascript</button>
        <button class="sandcastle-editor-tab" data-pane="html" type="button" role="tab">HTML/CSS</button>
        <div class="sandcastle-editor-actions" aria-label="代码操作">
          <button class="sandcastle-button sandcastle-button--primary" data-action="run" type="button">Run</button>
        </div>
        <button class="sandcastle-side-toggle" data-action="toggle-side-panel" type="button" aria-expanded="true" aria-label="收起侧边栏" title="收起侧边栏"></button>
      </div>
      <div class="sandcastle-editor" id="sandcastle-editor"></div>
    </section>
    <div class="sandcastle-splitter" role="separator" aria-orientation="vertical" aria-label="调整代码与预览区域宽度" tabindex="0"></div>
    <section class="sandcastle-stage" aria-label="预览与控制台">
      <div class="sandcastle-preview-panel">
        <iframe class="sandcastle-preview" title="Tellux Sandcastle preview" sandbox="allow-scripts allow-same-origin"></iframe>
        <button class="sandcastle-preview-fullscreen" data-action="toggle-preview-fullscreen" type="button" aria-label="全屏预览" title="全屏预览">
          <svg class="sandcastle-preview-fullscreen__enter" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M8 3H3v5" />
            <path d="M3 3l7 7" />
            <path d="M16 3h5v5" />
            <path d="M21 3l-7 7" />
            <path d="M8 21H3v-5" />
            <path d="M3 21l7-7" />
            <path d="M16 21h5v-5" />
            <path d="M21 21l-7-7" />
          </svg>
          <svg class="sandcastle-preview-fullscreen__exit" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M10 4v6H4" />
            <path d="M4 10l7-7" />
            <path d="M14 4v6h6" />
            <path d="M20 10l-7-7" />
            <path d="M10 20v-6H4" />
            <path d="M4 14l7 7" />
            <path d="M14 20v-6h6" />
            <path d="M20 14l-7 7" />
          </svg>
        </button>
      </div>
      <section class="sandcastle-console" aria-label="Console">
        <div class="sandcastle-console-resizer" role="separator" aria-orientation="horizontal" aria-label="调整 Console 高度" tabindex="0"></div>
        <header>
          <div class="sandcastle-console__title">
            <button class="sandcastle-console__toggle" data-action="toggle-console" type="button" aria-expanded="true" aria-label="折叠 Console" title="折叠 Console"></button>
            <span>Console</span>
          </div>
          <div class="sandcastle-console__actions">
            <button class="sandcastle-console__clear" data-action="clear-console" type="button">
              <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v5" />
                <path d="M14 11v5" />
              </svg>
              <span>Clear</span>
            </button>
          </div>
        </header>
        <div class="sandcastle-console__body" aria-live="polite"></div>
      </section>
    </section>
  </main>
`

const railButtons = Array.from(
  sandcastleRoot.querySelectorAll<HTMLButtonElement>(".sandcastle-rail__button")
)
const galleryList = queryRequired(".sandcastle-gallery__list", HTMLElement)
const searchInput = queryRequired(".sandcastle-search", HTMLInputElement)
const editorElement = queryRequired("#sandcastle-editor", HTMLElement)
const layoutElement = queryRequired(".sandcastle", HTMLElement)
const splitter = queryRequired(".sandcastle-splitter", HTMLElement)
const stageElement = queryRequired(".sandcastle-stage", HTMLElement)
const previewPanel = queryRequired(".sandcastle-preview-panel", HTMLElement)
const consoleResizer = queryRequired(".sandcastle-console-resizer", HTMLElement)
const previewFrame = queryRequired(".sandcastle-preview", HTMLIFrameElement)
const consoleBody = queryRequired(".sandcastle-console__body", HTMLElement)
const currentTitle = queryRequired("[data-current-title]", HTMLElement)
const runButton = queryRequired('[data-action="run"]', HTMLButtonElement)
const standaloneLink = queryRequired('[data-action="standalone"]', HTMLAnchorElement)
const docsLink = queryRequired('[data-action="open-docs"]', HTMLAnchorElement)
const clearConsoleButton = queryRequired('[data-action="clear-console"]', HTMLButtonElement)
const toggleConsoleButton = queryRequired('[data-action="toggle-console"]', HTMLButtonElement)
const togglePreviewFullscreenButton = queryRequired(
  '[data-action="toggle-preview-fullscreen"]',
  HTMLButtonElement
)
const toggleSidePanelButtons = Array.from(
  sandcastleRoot.querySelectorAll<HTMLButtonElement>('[data-action="toggle-side-panel"]')
)
const paneButtons = Array.from(
  sandcastleRoot.querySelectorAll<HTMLButtonElement>(".sandcastle-editor-tab")
)

if (toggleSidePanelButtons.length === 0) {
  throw new Error("Sandcastle UI element not found: [data-action=\"toggle-side-panel\"]")
}

monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
  allowNonTsExtensions: true,
  checkJs: true,
  module: monaco.languages.typescript.ModuleKind.ESNext,
  noEmitOnError: false,
  target: monaco.languages.typescript.ScriptTarget.Latest,
})

monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
  allowNonTsExtensions: true,
  module: monaco.languages.typescript.ModuleKind.ESNext,
  noEmitOnError: false,
  target: monaco.languages.typescript.ScriptTarget.Latest,
})

const models: Record<SandcastleEditorPane, monaco.editor.ITextModel> = {
  javascript: monaco.editor.createModel("", "typescript"),
  html: monaco.editor.createModel("", "html"),
}

const editor = monaco.editor.create(editorElement, {
  model: models.javascript,
  theme: "vs-dark",
  minimap: { enabled: false },
  fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  fontSize: 13,
  lineHeight: 21,
  automaticLayout: true,
  scrollBeyondLastLine: false,
  tabSize: 2,
  wordWrap: "on",
})

let activeExample = getSandcastleExample(new URLSearchParams(window.location.search).get("example"))
let displayedExamples = sandcastleExamples
let activePane: SandcastleEditorPane = "javascript"
let activeView: "examples" | "code" = activeExample ? "code" : "examples"
let isSidePanelCollapsed = false
let isConsoleCollapsed = false
let isDraggingSplitter = false
let isDraggingConsole = false
let consoleHeight = 150

function getDocsUrl() {
  const isLocalExamplesServer =
    window.location.port === "5173" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "::1")

  if (isLocalExamplesServer) {
    return "http://127.0.0.1:5174/docs/"
  }

  return new URL("./docs/", window.location.href).toString()
}

function createRunKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function getStoredRunEntries() {
  const entries: Array<{ key: string; createdAt: number }> = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const storageKey = localStorage.key(index)
    if (!storageKey?.startsWith(STORAGE_PREFIX)) {
      continue
    }
    const runKey = storageKey.slice(STORAGE_PREFIX.length)
    const timestamp = Number.parseInt(runKey.split("-")[0] ?? "", 36)
    entries.push({
      key: storageKey,
      createdAt: Number.isFinite(timestamp) ? timestamp : 0,
    })
  }
  return entries.sort((left, right) => left.createdAt - right.createdAt)
}

function pruneStoredRuns(maxRuns: number) {
  const entries = getStoredRunEntries()
  const removeCount = Math.max(0, entries.length - maxRuns)
  for (const entry of entries.slice(0, removeCount)) {
    localStorage.removeItem(entry.key)
  }
}

function clearStoredRuns() {
  for (const entry of getStoredRunEntries()) {
    localStorage.removeItem(entry.key)
  }
}

function isStorageQuotaExceeded(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  )
}

function saveRunPayload(key: string, payload: SandcastleRunPayload) {
  const storageKey = `${STORAGE_PREFIX}${key}`
  const serializedPayload = JSON.stringify(payload)

  pruneStoredRuns(MAX_STORED_RUNS - 1)
  try {
    localStorage.setItem(storageKey, serializedPayload)
  } catch (error) {
    if (!isStorageQuotaExceeded(error)) {
      throw error
    }
    clearStoredRuns()
    localStorage.setItem(storageKey, serializedPayload)
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function getRegisteredTypeScriptWorker() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await monaco.languages.typescript.getTypeScriptWorker()
    } catch (error) {
      if (String(error) !== "TypeScript not registered!" || attempt === 19) {
        throw error
      }
      await sleep(25)
    }
  }
  return monaco.languages.typescript.getTypeScriptWorker()
}

async function getCompiledJavascript() {
  const worker = await getRegisteredTypeScriptWorker()
  const client = await worker(models.javascript.uri)
  const output = await client.getEmitOutput(models.javascript.uri.toString())
  return output.outputFiles[0]?.text ?? models.javascript.getValue()
}

async function getCurrentPayload(): Promise<SandcastleRunPayload> {
  return {
    html: models.html.getValue(),
    javascript: models.javascript.getValue(),
    compiledJavascript: await getCompiledJavascript(),
  }
}

function createRunnerUrl(payload: SandcastleRunPayload) {
  const key = createRunKey()
  saveRunPayload(key, payload)
  return `./sandcastle/runner.html?run=${encodeURIComponent(key)}`
}

function appendConsoleLine(level: string, values: string[]) {
  const line = document.createElement("div")
  line.className = `sandcastle-console__line sandcastle-console__line--${level}`
  const prefix = document.createElement("span")
  prefix.textContent = level
  const message = document.createElement("pre")
  message.textContent = values.join(" ")
  line.append(prefix, message)
  consoleBody.appendChild(line)
  consoleBody.scrollTop = consoleBody.scrollHeight
}

function clearConsole() {
  consoleBody.innerHTML = ""
}

function setConsoleCollapsed(isCollapsed: boolean) {
  isConsoleCollapsed = isCollapsed
  stageElement.toggleAttribute("data-console-collapsed", isConsoleCollapsed)
  stageElement.style.setProperty(
    "--sandcastle-console-height",
    isConsoleCollapsed ? "36px" : `${consoleHeight}px`
  )
  toggleConsoleButton.setAttribute("aria-expanded", String(!isConsoleCollapsed))
  toggleConsoleButton.setAttribute(
    "aria-label",
    isConsoleCollapsed ? "展开 Console" : "折叠 Console"
  )
  toggleConsoleButton.title = isConsoleCollapsed ? "展开 Console" : "折叠 Console"
}

function updatePreviewFullscreenState() {
  const isFullscreen = document.fullscreenElement === previewPanel
  previewPanel.toggleAttribute("data-preview-fullscreen", isFullscreen)
  togglePreviewFullscreenButton.setAttribute("aria-pressed", String(isFullscreen))
  togglePreviewFullscreenButton.setAttribute(
    "aria-label",
    isFullscreen ? "退出全屏预览" : "全屏预览"
  )
  togglePreviewFullscreenButton.title = isFullscreen ? "退出全屏预览" : "全屏预览"
}

async function togglePreviewFullscreen() {
  try {
    if (document.fullscreenElement === previewPanel) {
      await document.exitFullscreen()
    } else {
      await previewPanel.requestFullscreen()
    }
    updatePreviewFullscreenState()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    appendConsoleLine("error", [`Unable to toggle fullscreen: ${message}`])
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function setSidePanelCollapsed(isCollapsed: boolean) {
  isSidePanelCollapsed = isCollapsed
  layoutElement.toggleAttribute("data-side-collapsed", isSidePanelCollapsed)
  toggleSidePanelButtons.forEach((button) => {
    button.setAttribute("aria-expanded", String(!isSidePanelCollapsed))
    button.setAttribute("aria-label", "收起侧边栏")
    button.title = "收起侧边栏"
  })
  if (isSidePanelCollapsed) {
    layoutElement.toggleAttribute("data-resizing", false)
    sandcastleRoot.querySelectorAll<HTMLElement>("[data-panel]").forEach((panel) => {
      panel.toggleAttribute("data-active", false)
    })
    railButtons.forEach((button) => {
      button.toggleAttribute("data-active", false)
      button.setAttribute("aria-current", "false")
    })
    requestAnimationFrame(() => editor.layout())
  } else if (activeView === "code") {
    requestAnimationFrame(() => editor.layout())
  }
}

function updateSplitterPosition(clientX: number) {
  const layoutRect = layoutElement.getBoundingClientRect()
  const railWidth =
    sandcastleRoot.querySelector(".sandcastle-rail")?.getBoundingClientRect().width ?? 52
  const splitterWidth = splitter.getBoundingClientRect().width
  const availableWidth = layoutRect.width - railWidth - splitterWidth
  const minPanelWidth = 320
  const maxLeftWidth = Math.max(minPanelWidth, availableWidth - minPanelWidth)
  const nextLeftWidth = clamp(
    clientX - layoutRect.left - railWidth - splitterWidth / 2,
    minPanelWidth,
    maxLeftWidth
  )
  layoutElement.style.setProperty("--sandcastle-left-width", `${nextLeftWidth}px`)
  editor.layout()
}

function updateConsoleHeight(clientY: number) {
  const stageRect = stageElement.getBoundingClientRect()
  const headerHeight = 40
  const minPreviewHeight = 220
  const maxConsoleHeight = Math.max(headerHeight, stageRect.height - minPreviewHeight)
  const nextConsoleHeight = clamp(stageRect.bottom - clientY, headerHeight, maxConsoleHeight)
  consoleHeight = nextConsoleHeight
  stageElement.style.setProperty("--sandcastle-console-height", `${nextConsoleHeight}px`)
}

async function runCurrentCode() {
  clearConsole()
  appendConsoleLine("info", ["Running example..."])
  setStandaloneEnabled(false)
  try {
    const url = createRunnerUrl(await getCurrentPayload())
    previewFrame.src = url
    standaloneLink.href = url
    setStandaloneEnabled(true)
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    appendConsoleLine("error", [message])
  }
}

function setStandaloneEnabled(isEnabled: boolean) {
  standaloneLink.toggleAttribute("aria-disabled", !isEnabled)
  standaloneLink.tabIndex = isEnabled ? 0 : -1
}

function selectPane(pane: SandcastleEditorPane) {
  activePane = pane
  editor.setModel(models[pane])
  paneButtons.forEach((button) => {
    const isActive = button.dataset.pane === pane
    button.toggleAttribute("data-active", isActive)
    button.setAttribute("aria-selected", String(isActive))
  })
  editor.focus()
}

function selectView(view: "examples" | "code") {
  activeView = view
  setSidePanelCollapsed(false)
  sandcastleRoot.querySelectorAll<HTMLElement>("[data-panel]").forEach((panel) => {
    panel.toggleAttribute("data-active", panel.dataset.panel === view)
  })
  railButtons.forEach((button) => {
    const isActive = button.dataset.view === view
    button.toggleAttribute("data-active", isActive)
    button.setAttribute("aria-current", isActive ? "page" : "false")
  })
  if (view === "code") {
    requestAnimationFrame(() => editor.layout())
  }
}

function selectExample(example: SandcastleExample, shouldRun = true) {
  activeExample = example
  models.javascript.setValue(example.javascript)
  models.html.setValue(example.html)
  currentTitle.textContent = example.title
  const url = new URL(window.location.href)
  url.searchParams.set("example", example.id)
  window.history.replaceState(null, "", url)
  renderGallery(displayedExamples)
  selectPane(activePane)
  selectView("code")
  if (shouldRun) {
    void runCurrentCode()
  }
}

function loadDefaultExample() {
  activeExample = null
  models.javascript.setValue(defaultSandcastleExample.javascript)
  models.html.setValue(defaultSandcastleExample.html)
  currentTitle.textContent = "Examples"
  renderGallery(displayedExamples)
  selectPane(activePane)
  selectView("examples")
  void runCurrentCode()
}

function updateDescriptionTitle(description: HTMLElement, fullText: string) {
  const isClamped =
    description.scrollHeight > description.clientHeight + 1 ||
    description.scrollWidth > description.clientWidth + 1

  if (isClamped) {
    description.title = fullText
  } else {
    description.removeAttribute("title")
  }
}

function renderGallery(examples: SandcastleExample[]) {
  galleryList.innerHTML = ""
  for (const example of examples) {
    const button = document.createElement("button")
    button.className = "sandcastle-card"
    button.type = "button"
    button.toggleAttribute("data-active", example.id === activeExample?.id)
    button.innerHTML = `
      <span class="sandcastle-card__thumb" aria-hidden="true"></span>
      <span class="sandcastle-card__body">
        <span class="sandcastle-card__category">${example.category}</span>
        <strong>${example.title}</strong>
        <span class="sandcastle-card__description">${example.description}</span>
        <span class="sandcastle-card__tags">${example.tags.map((tag) => `<em>${tag}</em>`).join("")}</span>
      </span>
    `
    const description = button.querySelector<HTMLElement>(".sandcastle-card__description")
    if (description) {
      description.addEventListener("pointerenter", () => {
        updateDescriptionTitle(description, example.description)
      })
    }
    if (example.thumbnail) {
      const thumb = button.querySelector<HTMLElement>(".sandcastle-card__thumb")
      if (thumb) {
        thumb.style.backgroundImage = `url("${example.thumbnail}")`
      }
    }
    button.addEventListener("click", () => selectExample(example))
    galleryList.appendChild(button)
    if (description) {
      updateDescriptionTitle(description, example.description)
    }
  }
}

function filterExamples(query: string) {
  const text = query.trim().toLowerCase()
  displayedExamples = text
    ? sandcastleExamples.filter((example) => {
        const haystack = [
          example.title,
          example.category,
          example.description,
          example.sourceHtmlPath,
          example.sourceScriptPath,
          ...example.tags,
        ]
          .join(" ")
          .toLowerCase()
        return haystack.includes(text)
      })
    : sandcastleExamples
  renderGallery(displayedExamples)
}

runButton.addEventListener("click", () => {
  void runCurrentCode()
})
docsLink.href = getDocsUrl()
docsLink.addEventListener("click", (event) => {
  event.preventDefault()
  window.open(docsLink.href, "_blank", "noopener")?.focus()
})
standaloneLink.addEventListener("click", (event) => {
  if (standaloneLink.getAttribute("aria-disabled") === "true") {
    event.preventDefault()
  }
})
clearConsoleButton.addEventListener("click", clearConsole)
toggleConsoleButton.addEventListener("click", () => setConsoleCollapsed(!isConsoleCollapsed))
togglePreviewFullscreenButton.addEventListener("click", () => {
  void togglePreviewFullscreen()
})
toggleSidePanelButtons.forEach((button) => {
  button.addEventListener("click", () => setSidePanelCollapsed(!isSidePanelCollapsed))
})
searchInput.addEventListener("input", () => filterExamples(searchInput.value))
document.addEventListener("fullscreenchange", updatePreviewFullscreenState)

splitter.addEventListener("pointerdown", (event) => {
  if (isSidePanelCollapsed || window.matchMedia("(max-width: 1080px)").matches) {
    return
  }
  isDraggingSplitter = true
  splitter.setPointerCapture(event.pointerId)
  layoutElement.toggleAttribute("data-resizing", true)
  updateSplitterPosition(event.clientX)
})

splitter.addEventListener("pointermove", (event) => {
  if (!isDraggingSplitter) {
    return
  }
  updateSplitterPosition(event.clientX)
})

splitter.addEventListener("pointerup", (event) => {
  isDraggingSplitter = false
  if (splitter.hasPointerCapture(event.pointerId)) {
    splitter.releasePointerCapture(event.pointerId)
  }
  layoutElement.toggleAttribute("data-resizing", false)
})

splitter.addEventListener("pointercancel", () => {
  isDraggingSplitter = false
  layoutElement.toggleAttribute("data-resizing", false)
})

splitter.addEventListener("keydown", (event) => {
  if (isSidePanelCollapsed) {
    return
  }
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return
  }
  const currentWidth =
    Number.parseFloat(getComputedStyle(layoutElement).getPropertyValue("--sandcastle-left-width")) ||
    layoutElement.getBoundingClientRect().width * 0.48
  const direction = event.key === "ArrowLeft" ? -1 : 1
  const layoutRect = layoutElement.getBoundingClientRect()
  const railWidth =
    sandcastleRoot.querySelector(".sandcastle-rail")?.getBoundingClientRect().width ?? 52
  const splitterWidth = splitter.getBoundingClientRect().width
  const availableWidth = layoutRect.width - railWidth - splitterWidth
  const nextWidth = clamp(currentWidth + direction * 24, 320, Math.max(320, availableWidth - 320))
  layoutElement.style.setProperty("--sandcastle-left-width", `${nextWidth}px`)
  editor.layout()
  event.preventDefault()
})

consoleResizer.addEventListener("pointerdown", (event) => {
  isDraggingConsole = true
  setConsoleCollapsed(false)
  consoleResizer.setPointerCapture(event.pointerId)
  stageElement.toggleAttribute("data-console-resizing", true)
  updateConsoleHeight(event.clientY)
})

consoleResizer.addEventListener("pointermove", (event) => {
  if (!isDraggingConsole) {
    return
  }
  updateConsoleHeight(event.clientY)
})

consoleResizer.addEventListener("pointerup", (event) => {
  isDraggingConsole = false
  if (consoleResizer.hasPointerCapture(event.pointerId)) {
    consoleResizer.releasePointerCapture(event.pointerId)
  }
  stageElement.toggleAttribute("data-console-resizing", false)
})

consoleResizer.addEventListener("pointercancel", () => {
  isDraggingConsole = false
  stageElement.toggleAttribute("data-console-resizing", false)
})

consoleResizer.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
    return
  }
  setConsoleCollapsed(false)
  const currentHeight =
    Number.parseFloat(getComputedStyle(stageElement).getPropertyValue("--sandcastle-console-height")) ||
    150
  const stageRect = stageElement.getBoundingClientRect()
  const direction = event.key === "ArrowUp" ? 1 : -1
  const nextHeight = clamp(currentHeight + direction * 20, 40, Math.max(40, stageRect.height - 220))
  consoleHeight = nextHeight
  stageElement.style.setProperty("--sandcastle-console-height", `${nextHeight}px`)
  event.preventDefault()
})

railButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.view === "examples" || button.dataset.view === "code") {
      selectView(button.dataset.view)
    }
  })
})

paneButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.pane === "javascript" || button.dataset.pane === "html") {
      selectPane(button.dataset.pane)
    }
  })
})

window.addEventListener("message", (event: MessageEvent<SandboxMessage>) => {
  if (event.origin !== window.location.origin) {
    return
  }
  const message = event.data
  if (message.type === "sandbox-log") {
    appendConsoleLine(message.level, message.values)
  } else if (message.type === "sandbox-error") {
    appendConsoleLine("error", [message.message])
  }
})

renderGallery(displayedExamples)
selectPane(activePane)
selectView(activeView)
if (activeExample) {
  selectExample(activeExample)
} else {
  loadDefaultExample()
}
