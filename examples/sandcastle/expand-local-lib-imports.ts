/**
 * Sandcastle 剥离 ESM import 前，把 `./lib/*` 本地模块内联进示例源码。
 * 正式页面（Vite）仍走真实 import；仅 iframe runner 需要此展开。
 *
 * 内联体包在 IIFE 里再解构导出，避免 lib 私有常量（如 GRAVITY）与示例顶层冲突。
 * IIFE 必须放在剩余 import 之后，否则 TypeScript emit 会把后续 import 编坏。
 */
export function expandLocalLibImports(
  code: string,
  libs: Record<string, string>
): string {
  // 注意：不能用 m 模式下的 `$`，否则多行 `import {\n  a,\n} from ...` 匹配不到。
  const importRe =
    /^\s*import\s+(type\s+)?(\{[\s\S]*?\}|\*\s+as\s+[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["'];?/gm

  type ImportHit = {
    full: string
    typeOnly: boolean
    names: string[]
    path: string
    isLib: boolean
  }

  const imports: ImportHit[] = []
  for (const match of code.matchAll(importRe)) {
    const path = match[3].replace(/\.ts$/, "")
    const isLib = path.startsWith("./lib/")
    const typeOnly = Boolean(match[1])
    imports.push({
      full: match[0],
      typeOnly,
      names: typeOnly ? [] : parseImportNames(match[2]),
      path,
      isLib,
    })
  }

  const libImports = imports.filter((item) => item.isLib && !item.typeOnly && item.names.length > 0)
  if (libImports.length === 0) return code

  const resolveLib = (path: string) => {
    const base = path.replace(/^\.\//, "").replace(/\.ts$/, "")
    for (const [key, value] of Object.entries(libs)) {
      const normalized = key
        .replace(/\\/g, "/")
        .replace(/^\.\.\//, "")
        .replace(/\.ts$/, "")
      if (
        normalized === base ||
        normalized.endsWith(`/${base}`) ||
        key.replace(/\\/g, "/").includes(base)
      ) {
        return value
      }
    }
    return undefined
  }

  const seen = new Set<string>()
  const preamble: string[] = []
  for (const item of libImports) {
    if (seen.has(item.path)) continue
    seen.add(item.path)

    const raw = resolveLib(item.path)
    if (!raw) {
      throw new Error(`Sandcastle missing local lib for ${item.path}`)
    }

    const exportNames: string[] = []
    const body = raw
      .replace(/^\s*import\s+type\s+[\s\S]*?\s+from\s+["'][^"']+["'];?/gm, "")
      .replace(/^\s*import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?/gm, "")
      .replace(/^\s*import\s+["'][^"']+["'];?/gm, "")
      .replace(/^\s*export\s+type\s+[\s\S]*?;?\s*$/gm, "")
      .replace(/\bexport\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/g, (_m, asyncKw, name) => {
        exportNames.push(name)
        return `${asyncKw ?? ""}function ${name}`
      })
      .replace(/\bexport\s+class\s+([A-Za-z_$][\w$]*)/g, (_m, name) => {
        exportNames.push(name)
        return `class ${name}`
      })
      .replace(/\bexport\s+const\s+([A-Za-z_$][\w$]*)/g, (_m, name) => {
        exportNames.push(name)
        return `const ${name}`
      })
      .replace(/\bexport\s+\{([^}]*)\};?/gm, (_m, inner: string) => {
        for (const part of inner.split(",")) {
          const token = part.trim()
          if (!token) continue
          const asMatch = token.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/)
          exportNames.push(asMatch ? asMatch[2] : token)
        }
        return ""
      })

    const uniqueExports = [...new Set(exportNames)]
    const ns = `__sandcastleLib_${item.path.replace(/[^\w]/g, "_")}`
    preamble.push(
      `// ---- inlined ${item.path} ----\n` +
        `const ${ns} = (() => {\n${body}\nreturn { ${uniqueExports.join(", ")} };\n})();\n` +
        `const { ${item.names.join(", ")} } = ${ns};`
    )
  }

  const emitted = new Set<string>()
  for (const item of libImports) {
    if (!emitted.has(item.path)) {
      emitted.add(item.path)
      continue
    }
    const ns = `__sandcastleLib_${item.path.replace(/[^\w]/g, "_")}`
    preamble.push(`const { ${item.names.join(", ")} } = ${ns};`)
  }

  // 去掉 ./lib import，保留其它 import 在文件顶部，IIFE 紧随其后。
  let withoutLibImports = code
  for (const item of imports) {
    if (!item.isLib) continue
    withoutLibImports = withoutLibImports.replace(item.full, "")
  }

  const keptImportRe =
    /^\s*import\s+(type\s+)?(\{[\s\S]*?\}|\*\s+as\s+[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["'];?/gm
  const keptImports: string[] = []
  withoutLibImports = withoutLibImports.replace(keptImportRe, (full) => {
    keptImports.push(full.trim())
    return ""
  })
  // 顺带清掉只剩空白的空行堆在顶部
  withoutLibImports = withoutLibImports.replace(/^\s*\n/, "")

  return `${keptImports.join("\n")}\n\n${preamble.join("\n\n")}\n\n${withoutLibImports}`
}

function parseImportNames(clause: string): string[] {
  const trimmed = clause.trim()
  if (!trimmed || trimmed.startsWith("*")) return []
  const brace = trimmed.match(/^\{([\s\S]*)\}$/)
  if (!brace) return []
  return brace[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const asMatch = part.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/)
      return asMatch ? asMatch[2] : part.replace(/^type\s+/, "")
    })
    .filter((name) => name && name !== "type")
}
