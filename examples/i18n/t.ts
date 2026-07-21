import { getLocale } from "./locale"
import { messages } from "./messages"
import type { TranslateParams } from "./types"

const warnedKeys = new Set<string>()

function formatMessage(template: string, params?: TranslateParams) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key]
    return value === undefined || value === null ? `{${key}}` : String(value)
  })
}

/**
 * 按当前语言翻译 key；缺 key 时开发态告警并回退到 key 本身。
 * Translate by key for the active locale; warn in DEV and fall back to the key.
 */
export function t(key: string, params?: TranslateParams): string {
  const locale = getLocale()
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
