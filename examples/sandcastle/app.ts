import * as monaco from "monaco-editor"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"
import { getSandcastleExample, sandcastleExamples } from "./registry"
import type { SandcastleExample, SandboxMessage } from "./types"

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "typescript" || label === "javascript") {
      return new tsWorker()
    }
    return new editorWorker()
  },
}

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
        <strong>Sandcastle</strong>
        <span>交互式示例</span>
      </div>
      <div class="sandcastle-actions" aria-label="示例操作">
        <button class="sandcastle-button sandcastle-button--primary" data-action="run" type="button">Run</button>
        <button class="sandcastle-button" data-action="reset" type="button">Reset</button>
        <a class="sandcastle-button" data-action="standalone" href="./sandcastle/runner.html" target="_blank" rel="noreferrer">Standalone</a>
      </div>
    </header>
    <aside class="sandcastle-gallery" aria-label="示例列表">
      <div class="sandcastle-gallery__search">
        <input class="sandcastle-search" type="search" placeholder="搜索示例或标签" aria-label="搜索示例或标签" />
      </div>
      <div class="sandcastle-gallery__list"></div>
    </aside>
    <section class="sandcastle-workspace" aria-label="代码与预览">
      <div class="sandcastle-editor-panel">
        <div class="sandcastle-panel-header">
          <div>
            <strong data-current-title></strong>
            <span data-current-description></span>
          </div>
        </div>
        <div class="sandcastle-editor" id="sandcastle-editor"></div>
      </div>
      <div class="sandcastle-preview-panel">
        <iframe class="sandcastle-preview" title="Tellux Sandcastle preview" sandbox="allow-scripts allow-same-origin"></iframe>
      </div>
      <section class="sandcastle-console" aria-label="Console">
        <header>
          <span>Console</span>
          <button data-action="clear-console" type="button">Clear</button>
        </header>
        <div class="sandcastle-console__body" aria-live="polite"></div>
      </section>
    </section>
  </main>
`

const galleryList = queryRequired(".sandcastle-gallery__list", HTMLElement)
const searchInput = queryRequired(".sandcastle-search", HTMLInputElement)
const editorElement = queryRequired("#sandcastle-editor", HTMLElement)
const previewFrame = queryRequired(".sandcastle-preview", HTMLIFrameElement)
const consoleBody = queryRequired(".sandcastle-console__body", HTMLElement)
const currentTitle = queryRequired("[data-current-title]", HTMLElement)
const currentDescription = queryRequired("[data-current-description]", HTMLElement)
const runButton = queryRequired('[data-action="run"]', HTMLButtonElement)
const resetButton = queryRequired('[data-action="reset"]', HTMLButtonElement)
const standaloneLink = queryRequired('[data-action="standalone"]', HTMLAnchorElement)
const clearConsoleButton = queryRequired('[data-action="clear-console"]', HTMLButtonElement)

monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
  allowNonTsExtensions: true,
  checkJs: true,
  target: monaco.languages.typescript.ScriptTarget.Latest,
})

const editor = monaco.editor.create(editorElement, {
  value: "",
  language: "javascript",
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

function createRunnerUrl(code: string) {
  return `./sandcastle/runner.html?code=${encodeURIComponent(code)}`
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

function runCurrentCode() {
  const code = editor.getValue()
  clearConsole()
  appendConsoleLine("info", ["Running example..."])
  previewFrame.src = createRunnerUrl(code)
  standaloneLink.href = createRunnerUrl(code)
}

function selectExample(example: SandcastleExample, shouldRun = true) {
  activeExample = example
  editor.setValue(example.code)
  currentTitle.textContent = example.title
  currentDescription.textContent = example.description
  const url = new URL(window.location.href)
  url.searchParams.set("example", example.id)
  window.history.replaceState(null, "", url)
  renderGallery(displayedExamples)
  if (shouldRun) {
    runCurrentCode()
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
          ...example.tags,
        ]
          .join(" ")
          .toLowerCase()
        return haystack.includes(text)
      })
    : sandcastleExamples
  renderGallery(displayedExamples)
}

runButton.addEventListener("click", runCurrentCode)
resetButton.addEventListener("click", () => selectExample(activeExample))
clearConsoleButton.addEventListener("click", clearConsole)
searchInput.addEventListener("input", () => filterExamples(searchInput.value))

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
selectExample(activeExample)
