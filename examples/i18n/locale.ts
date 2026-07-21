import type { Locale } from "./types"

export const LOCALE_STORAGE_KEY = "tellux.locale"

const listeners = new Set<(locale: Locale) => void>()

let currentLocale: Locale | null = null

function isLocale(value: string | null | undefined): value is Locale {
  return value === "zh" || value === "en"
}

function normalizeBrowserLanguage(value: string | undefined): Locale | null {
  if (!value) return null
  const normalized = value.toLowerCase()
  if (normalized.startsWith("zh")) return "zh"
  if (normalized.startsWith("en")) return "en"
  return null
}

function readStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    return isLocale(stored) ? stored : null
  } catch {
    return null
  }
}

function writeStoredLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function readQueryLocale(): Locale | null {
  try {
    const lang = new URLSearchParams(window.location.search).get("lang")
    return isLocale(lang) ? lang : null
  } catch {
    return null
  }
}

function detectBrowserLocale(): Locale | null {
  const languages =
    typeof navigator !== "undefined"
      ? navigator.languages?.length
        ? navigator.languages
        : [navigator.language]
      : []
  for (const language of languages) {
    const matched = normalizeBrowserLanguage(language)
    if (matched) return matched
  }
  return null
}

function syncDocumentLang(locale: Locale) {
  if (typeof document === "undefined") return
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"
}

function syncUrlLang(locale: Locale) {
  try {
    const url = new URL(window.location.href)
    url.searchParams.set("lang", locale)
    window.history.replaceState(window.history.state, "", url)
  } catch {
    // Ignore non-browser environments.
  }
}

/**
 * 解析当前语言：?lang → localStorage → navigator → en
 * Resolve locale: ?lang → localStorage → navigator → en
 */
export function resolveLocale(): Locale {
  const fromQuery = readQueryLocale()
  if (fromQuery) {
    writeStoredLocale(fromQuery)
    currentLocale = fromQuery
    syncDocumentLang(fromQuery)
    return fromQuery
  }

  const fromStorage = readStoredLocale()
  if (fromStorage) {
    currentLocale = fromStorage
    syncDocumentLang(fromStorage)
    return fromStorage
  }

  const fromBrowser = detectBrowserLocale() ?? "en"
  currentLocale = fromBrowser
  syncDocumentLang(fromBrowser)
  return fromBrowser
}

export function getLocale(): Locale {
  return currentLocale ?? resolveLocale()
}

export function setLocale(
  locale: Locale,
  options: { persist?: boolean; syncUrl?: boolean } = {}
) {
  const { persist = true, syncUrl = true } = options
  currentLocale = locale
  if (persist) writeStoredLocale(locale)
  if (syncUrl) syncUrlLang(locale)
  syncDocumentLang(locale)
  listeners.forEach((listener) => listener(locale))
}

export function onLocaleChange(listener: (locale: Locale) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function pickLocalized<T>(value: { zh: T; en: T }, locale = getLocale()): T {
  return value[locale]
}
