import ts from 'typescript'
import type { Plugin } from 'vite'

/**
 * 仅移除解析器识别的文档注释，保留声明文件、许可证、纯调用标记及源位置。
 * Removes parsed documentation comments only, preserving declarations, licenses, pure annotations and source positions.
 */
export function stripRuntimeDocumentation(code: string, filename: string) {
  const source = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
  const ranges = new Map<number, number>()
  const visit = (node: ts.Node) => {
    const docs = (node as ts.Node & { jsDoc?: readonly ts.JSDoc[] }).jsDoc
    for (const doc of docs ?? []) {
      const comment = code.slice(doc.pos, doc.end)
      if (!/\b(?:license|copyright)\b|@preserve|[#@]__PURE__/i.test(comment)) ranges.set(doc.pos, doc.end)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!ranges.size) return null
  // Keep every offset and newline unchanged so downstream source maps still refer to original TS.
  let result = code
  for (const [start, end] of ranges) {
    result = result.slice(0, start) + code.slice(start, end).replace(/[^\r\n]/g, ' ') + result.slice(end)
  }
  return result
}

export function stripRuntimeDocumentationPlugin(): Plugin {
  return {
    name: 'tellux-strip-runtime-documentation', enforce: 'pre', apply: 'build',
    transform(code, id) {
      const path = id.replace(/\\/g, '/')
      if (!path.includes('/src/') || path.includes('/node_modules/') || !path.endsWith('.ts')) return null
      const result = stripRuntimeDocumentation(code, path)
      return result === null ? null : { code: result, map: null }
    },
  }
}
