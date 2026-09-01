/**
 * 示例页全局 Message 提示（Element UI Message 风格）：顶部居中、可堆叠、自动关闭。
 *
 * Example-site global Message toasts (Element UI Message style): top-center, stackable, auto-dismiss.
 */

export type ExampleMessageType = "success" | "warning" | "error" | "info"

export type ExampleMessageOptions = {
  /** 主文案。Primary message text. */
  message: string
  /** 补充说明（较长错误详情等）。Optional detail line. */
  description?: string
  type?: ExampleMessageType
  /** 自动关闭毫秒；`0` 表示不自动关闭。Auto-close ms; `0` keeps the toast open. */
  duration?: number
  showClose?: boolean
  /** 同 id 的新消息会替换旧消息。Replacing an existing toast with the same id. */
  id?: string
  /** 距视口顶部的偏移（px）。Top offset from the viewport in px. */
  offset?: number
}

const DEFAULT_DURATION = 2000
const MESSAGE_ICONS: Record<ExampleMessageType, string> = {
  success: "✓",
  warning: "!",
  error: "×",
  info: "i",
}

const activeMessages = new Map<string, { element: HTMLElement; close: () => void }>()

function normalizeOptions(input: ExampleMessageOptions | string): ExampleMessageOptions {
  return typeof input === "string" ? { message: input } : input
}

function getStackContainer(offset: number) {
  let stack = document.querySelector<HTMLElement>(".example-message-stack")
  if (!stack) {
    stack = document.createElement("div")
    stack.className = "example-message-stack"
    stack.setAttribute("role", "region")
    stack.setAttribute("aria-label", "Example messages")
    document.body.append(stack)
  }
  stack.style.setProperty("--example-message-offset", `${offset}px`)
  return stack
}

function createCloseButton(onClose: () => void) {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "example-message__close"
  button.setAttribute("aria-label", "Close")
  button.textContent = "×"
  button.addEventListener("click", onClose)
  return button
}

export function showExampleMessage(input: ExampleMessageOptions | string): () => void {
  const options = normalizeOptions(input)
  const type = options.type ?? "info"
  const duration = options.duration ?? DEFAULT_DURATION
  const offset = options.offset ?? 16
  const stack = getStackContainer(offset)

  if (options.id) {
    activeMessages.get(options.id)?.close()
  }

  const element = document.createElement("div")
  element.className = `example-message example-message--${type}`
  if (options.id) {
    element.dataset.messageId = options.id
  }

  const icon = document.createElement("span")
  icon.className = "example-message__icon"
  icon.setAttribute("aria-hidden", "true")
  icon.textContent = MESSAGE_ICONS[type]

  const body = document.createElement("div")
  body.className = "example-message__body"

  const title = document.createElement("div")
  title.className = "example-message__title"
  title.textContent = options.message
  body.append(title)

  if (options.description) {
    const description = document.createElement("div")
    description.className = "example-message__description"
    description.textContent = options.description
    body.append(description)
  }

  element.append(icon, body)

  let timer = 0
  const close = () => {
    if (timer) {
      window.clearTimeout(timer)
      timer = 0
    }
    if (!element.isConnected) return
    element.classList.add("example-message--leave")
    window.setTimeout(() => {
      element.remove()
      if (options.id) {
        activeMessages.delete(options.id)
      }
    }, 180)
  }

  if (options.showClose ?? type === "error") {
    element.append(createCloseButton(close))
  }

  stack.append(element)
  window.requestAnimationFrame(() => {
    element.classList.add("example-message--enter")
  })

  if (duration > 0) {
    timer = window.setTimeout(close, duration)
  }

  if (options.id) {
    activeMessages.set(options.id, { element, close })
  }

  return close
}

export const ExampleMessage = {
  show: showExampleMessage,
  success(message: string, options: Omit<ExampleMessageOptions, "message" | "type"> = {}) {
    return showExampleMessage({ ...options, message, type: "success" })
  },
  warning(message: string, options: Omit<ExampleMessageOptions, "message" | "type"> = {}) {
    return showExampleMessage({ ...options, message, type: "warning" })
  },
  error(message: string, options: Omit<ExampleMessageOptions, "message" | "type"> = {}) {
    return showExampleMessage({ ...options, message, type: "error" })
  },
  info(message: string, options: Omit<ExampleMessageOptions, "message" | "type"> = {}) {
    return showExampleMessage({ ...options, message, type: "info" })
  },
  closeAll() {
    for (const { close } of activeMessages.values()) {
      close()
    }
    activeMessages.clear()
    document.querySelector(".example-message-stack")?.remove()
  },
}
