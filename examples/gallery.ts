import { applyTranslations, mountLanguageToggle, resolveLocale } from "./i18n"
import { mountDocsLink } from "./docs-link"
import { mountGallery } from "./showcase"

resolveLocale()
applyTranslations(document)
mountLanguageToggle({
  mount: document.querySelector("[data-lang-toggle]"),
  applyDocument: true,
})
mountDocsLink()
mountGallery()
