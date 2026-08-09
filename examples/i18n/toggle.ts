import { applyTranslations } from "./apply"
import { getLocale, onLocaleChange, resolveLocale, setLocale } from "./locale"
import type { Locale } from "./types"

export interface MountLanguageToggleOptions {
  /** 挂载点；默认创建并插入 document.body */
  mount?: HTMLElement | null
  /** 追加到切换器的 class（如 portal / sandcastle / example 布局） */
  className?: string
  /** locale 变更后的额外回调（例如重渲 gallery） */
  onChange?: (locale: Locale) => void
  /** 是否在 setLocale 后自动 applyTranslations(document) */
  applyDocument?: boolean
}

function syncToggleState(root: HTMLElement, locale: Locale) {
  root.querySelectorAll<HTMLButtonElement>("[data-locale]").forEach((button) => {
    const isActive = button.dataset.locale === locale
    button.setAttribute("aria-pressed", String(isActive))
    button.classList.toggle("is-active", isActive)
  })
}

/**
 * 挂载 中文 | EN 切换器。
 * Mount a 中文 | EN language toggle.
 */
export function mountLanguageToggle(
  options: MountLanguageToggleOptions = {}
): HTMLElement {
  resolveLocale()

  const {
    mount = null,
    className = "",
    onChange,
    applyDocument = true,
  } = options

  let root =
    mount?.querySelector<HTMLElement>(".lang-toggle") ??
    document.createElement("div")

  if (!root.classList.contains("lang-toggle")) {
    root = document.createElement("div")
  }

  root.className = ["lang-toggle", className].filter(Boolean).join(" ")
  root.setAttribute("role", "group")
  root.setAttribute("aria-label", "Language")
  root.innerHTML = `
    <button type="button" class="lang-toggle__button" data-locale="zh" aria-pressed="false">中文</button>
    <button type="button" class="lang-toggle__button" data-locale="en" aria-pressed="false">EN</button>
  `

  const applyLocale = (locale: Locale) => {
    setLocale(locale)
    if (applyDocument) applyTranslations(document)
    syncToggleState(root, locale)
    onChange?.(locale)
  }

  root.querySelectorAll<HTMLButtonElement>("[data-locale]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.locale
      if (next === "zh" || next === "en") {
        applyLocale(next)
      }
    })
  })

  syncToggleState(root, getLocale())

  if (mount) {
    if (!mount.contains(root)) mount.append(root)
  } else if (!root.isConnected) {
    document.body.append(root)
  }

  onLocaleChange((locale) => {
    syncToggleState(root, locale)
  })

  return root
}
