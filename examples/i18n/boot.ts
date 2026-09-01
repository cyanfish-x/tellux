import { applyTranslations } from "./apply"
import { LOCALE_STORAGE_KEY, getLocale, resolveLocale, setLocale } from "./locale"
import type { Locale } from "./types"
import { mountLanguageToggle } from "./toggle"

let crossFrameLocaleSyncInstalled = false

function isLocale(value: string | null): value is Locale {
  return value === "zh" || value === "en"
}

/** Sandcastle iframe 等子页面：监听父页写入的 `localStorage` locale。 */
function installCrossFrameLocaleSync() {
  if (crossFrameLocaleSyncInstalled || typeof window === "undefined") return
  crossFrameLocaleSyncInstalled = true

  window.addEventListener("storage", (event) => {
    if (event.key !== LOCALE_STORAGE_KEY || !isLocale(event.newValue)) return
    if (getLocale() === event.newValue) return
    setLocale(event.newValue, { persist: false, syncUrl: true })
    applyTranslations(document)
  })
}

export interface BootExampleI18nOptions {
  /** 是否挂载切换器；默认 true（独立示例页右上角） */
  toggle?: boolean
  /** 切换器挂载点；默认 body + example 浮动样式 */
  toggleMount?: HTMLElement | null
  toggleClassName?: string
}

/**
 * 独立示例页 / runner 内统一启动 i18n。
 * Boot i18n for standalone examples and the Sandcastle runner.
 */
export function bootExampleI18n(options: BootExampleI18nOptions = {}) {
  resolveLocale()
  applyTranslations(document)
  installCrossFrameLocaleSync()

  if (options.toggle === false) return

  mountLanguageToggle({
    mount: options.toggleMount ?? null,
    className: options.toggleClassName ?? "lang-toggle--example",
    applyDocument: true,
  })
}
