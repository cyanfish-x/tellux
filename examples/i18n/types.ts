export type Locale = "zh" | "en"

export type MessageTable = Record<string, string>

export type LocalizedText = {
  zh: string
  en: string
}

export type TranslateParams = Record<string, string | number | boolean>
