import { t } from "./t"

function applyAttributes(element: Element) {
  const raw = element.getAttribute("data-i18n-attr")
  if (!raw) return

  raw.split(",").forEach((part) => {
    const trimmed = part.trim()
    if (!trimmed) return
    const separator = trimmed.indexOf(":")
    if (separator <= 0) return
    const attr = trimmed.slice(0, separator).trim()
    const key = trimmed.slice(separator + 1).trim()
    if (!attr || !key) return
    element.setAttribute(attr, t(key))
  })
}

/**
 * 扫描 root 内 data-i18n / data-i18n-html / data-i18n-attr 并写入文案。
 * Apply translations for data-i18n* markers under root.
 */
export function applyTranslations(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    const key = element.getAttribute("data-i18n")
    if (!key) return
    element.textContent = t(key)
  })

  root.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((element) => {
    const key = element.getAttribute("data-i18n-html")
    if (!key) return
    element.innerHTML = t(key)
  })

  root.querySelectorAll("[data-i18n-attr]").forEach((element) => {
    applyAttributes(element)
  })
}
