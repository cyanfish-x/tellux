import type { Locale, MessageTable } from "../types"
import { en } from "./en"
import { zh } from "./zh"

export const messages: Record<Locale, MessageTable> = {
  zh,
  en,
}
