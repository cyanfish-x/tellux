import { getLocale } from "./locale"
import { messages } from "./messages"
import type { LocalizedText, TranslateParams } from "./types"

const warnedKeys = new Set<string>()

function formatMessage(template: string, params?: TranslateParams) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key]
    return value === undefined || value === null ? `{${key}}` : String(value)
  })
}

function isLocalizedText(value: string | LocalizedText): value is LocalizedText {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.zh === "string" &&
    typeof value.en === "string"
  )
}

/**
 * 翻译文案。
 * - 壳 / HTML：`t("portal.nav.docs")` 查词典
 * - 示例 TS：`t({ zh: "加载", en: "Load" })` 内联双语，阅读友好
 *
 * Translate copy.
 * - Shell / HTML: lookup by catalog key
 * - Example TS: prefer inline `{ zh, en }` for readability
 */
export function t(
  message: string | LocalizedText,
  params?: TranslateParams
): string {
  const locale = getLocale()

  if (isLocalizedText(message)) {
    return formatMessage(message[locale] || message.zh || message.en, params)
  }

  const key = message
  const table = messages[locale]
  const fallback = messages.zh[key] ?? messages.en[key]
  const template = table[key] ?? fallback
  if (template === undefined) {
    if (import.meta.env.DEV && !warnedKeys.has(key)) {
      warnedKeys.add(key)
      console.warn(`[tellux i18n] Missing message key: ${key}`)
    }
    return formatMessage(key, params)
  }
  return formatMessage(template, params)
}
