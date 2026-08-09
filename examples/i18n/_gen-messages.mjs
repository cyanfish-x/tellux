import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const dir = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(dir, "messages")
fs.mkdirSync(outDir, { recursive: true })

/** @type {Record<string, [string, string]>} */
const pairs = JSON.parse(
  fs.readFileSync(path.join(dir, "_messages.json"), "utf8")
)

function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")
}

function writeLocale(locale, index) {
  const lines = [
    `import type { MessageTable } from "../types"`,
    ``,
    `export const ${locale}: MessageTable = {`,
  ]
  for (const [key, vals] of Object.entries(pairs)) {
    lines.push(`  '${key}': '${esc(vals[index])}',`)
  }
  lines.push(`}`, ``)
  fs.writeFileSync(path.join(outDir, `${locale}.ts`), lines.join("\n"), "utf8")
}

writeLocale("zh", 0)
writeLocale("en", 1)
fs.writeFileSync(
  path.join(outDir, "index.ts"),
  `import type { Locale, MessageTable } from "../types"
import { en } from "./en"
import { zh } from "./zh"

export const messages: Record<Locale, MessageTable> = {
  zh,
  en,
}
`,
  "utf8"
)
console.log("wrote", Object.keys(pairs).length, "keys")
