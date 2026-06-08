import * as monaco from "monaco-editor"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"
import { getSandcastleExample, sandcastleExamples } from "./registry"
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
        <span data-current-description></span>
      </div>
      <div class="sandcastle-actions" aria-label="示例操作">
        <button class="sandcastle-button sandcastle-button--primary" data-action="run" type="button">Run</button>
        <button class="sandcastle-button" data-action="reset" type="button">Reset</button>
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
    </nav>
    <aside class="sandcastle-sidebar" data-panel="examples" aria-label="示例列表">
      <div class="sandcastle-sidebar__search">
        <input class="sandcastle-search" type="search" placeholder="搜索示例或标签" aria-label="搜索示例或标签" />
      </div>
      <div class="sandcastle-gallery__list"></div>
    </aside>
    <section class="sandcastle-editor-panel" data-panel="code" aria-label="代码编辑">
      <div class="sandcastle-editor-tabs" role="tablist" aria-label="代码类型">
        <button class="sandcastle-editor-tab" data-pane="javascript" type="button" role="tab">Javascript</button>
        <button class="sandcastle-editor-tab" data-pane="html" type="button" role="tab">HTML/CSS</button>
      </div>
      <div class="sandcastle-editor" id="sandcastle-editor"></div>
    </section>
    <div class="sandcastle-splitter" role="separator" aria-orientation="vertical" aria-label="调整代码与预览区域宽度" tabindex="0"></div>
    <section class="sandcastle-stage" aria-label="预览与控制台">
      <div class="sandcastle-preview-panel">
        <iframe class="sandcastle-preview" title="Tellux Sandcastle preview" sandbox="allow-scripts allow-same-origin"></iframe>
      </div>
      <section class="sandcastle-console" aria-label="Console">
        <div class="sandcastle-console-resizer" role="separator" aria-orientation="horizontal" aria-label="调整 Console 高度" tabindex="0"></div>
        <header>
          <span>Console</span>
          <div class="sandcastle-console__actions">
            <button class="sandcastle-console__toggle" data-action="toggle-console" type="button" aria-expanded="true" aria-label="折叠 Console" title="折叠 Console">⌄</button>
            <button data-action="clear-console" type="button">Clear</button>
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
const consoleResizer = queryRequired(".sandcastle-console-resizer", HTMLElement)
const previewFrame = queryRequired(".sandcastle-preview", HTMLIFrameElement)
const consoleBody = queryRequired(".sandcastle-console__body", HTMLElement)
const currentTitle = queryRequired("[data-current-title]", HTMLElement)
const currentDescription = queryRequired("[data-current-description]", HTMLElement)
const runButton = queryRequired('[data-action="run"]', HTMLButtonElement)
const resetButton = queryRequired('[data-action="reset"]', HTMLButtonElement)
const standaloneLink = queryRequired('[data-action="standalone"]', HTMLAnchorElement)
const clearConsoleButton = queryRequired('[data-action="clear-console"]', HTMLButtonElement)
const toggleConsoleButton = queryRequired('[data-action="toggle-console"]', HTMLButtonElement)
const paneButtons = Array.from(
  sandcastleRoot.querySelectorAll<HTMLButtonElement>(".sandcastle-editor-tab")
)

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
let activeView: "examples" | "code" = "code"
let isConsoleCollapsed = false
let isDraggingSplitter = false
let isDraggingConsole = false
let consoleHeight = 150

function createRunKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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
  localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(payload))
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
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
  try {
    const url = createRunnerUrl(await getCurrentPayload())
    previewFrame.src = url
    standaloneLink.href = url
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    appendConsoleLine("error", [message])
  }
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
  currentDescription.textContent = example.description
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

function renderGallery(examples: SandcastleExample[]) {
  galleryList.innerHTML = ""
  for (const example of examples) {
    const button = document.createElement("button")
    button.className = "sandcastle-card"
    button.type = "button"
    button.toggleAttribute("data-active", example.id === activeExample.id)
    button.innerHTML = `
      <span class="sandcastle-card__thumb" aria-hidden="true"></span>
      <span class="sandcastle-card__body">
        <span class="sandcastle-card__category">${example.category}</span>
        <strong>${example.title}</strong>
        <span class="sandcastle-card__description">${example.description}</span>
        <span class="sandcastle-card__tags">${example.tags.map((tag) => `<em>${tag}</em>`).join("")}</span>
      </span>
    `
    if (example.thumbnail) {
      const thumb = button.querySelector<HTMLElement>(".sandcastle-card__thumb")
      if (thumb) {
        thumb.style.backgroundImage = `url("${example.thumbnail}")`
      }
    }
    button.addEventListener("click", () => selectExample(example))
    galleryList.appendChild(button)
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
resetButton.addEventListener("click", () => selectExample(activeExample))
clearConsoleButton.addEventListener("click", clearConsole)
toggleConsoleButton.addEventListener("click", () => setConsoleCollapsed(!isConsoleCollapsed))
searchInput.addEventListener("input", () => filterExamples(searchInput.value))

splitter.addEventListener("pointerdown", (event) => {
  if (window.matchMedia("(max-width: 1080px)").matches) {
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
selectExample(activeExample)
