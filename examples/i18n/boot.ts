import { applyTranslations } from "./apply"
import { resolveLocale } from "./locale"
import { mountLanguageToggle } from "./toggle"

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

  if (options.toggle === false) return

  mountLanguageToggle({
    mount: options.toggleMount ?? null,
    className: options.toggleClassName ?? "lang-toggle--example",
    applyDocument: true,
  })
}
