import { Buffer } from 'node:buffer'
import { gzipSync } from 'node:zlib'
import type { Plugin, Rollup } from 'vite'

type OutputBundle = Rollup.OutputBundle
type OutputChunk = Rollup.OutputChunk
type OutputAsset = Rollup.OutputAsset

export type BundleOutputSelector = (bundle: OutputBundle) => string[]

export interface BundleSizeBudget {
  name: string
  select: BundleOutputSelector
  maxBytes?: number
  maxGzipBytes?: number
}

export interface BundleSizeBudgetResult {
  name: string
  files: string[]
  bytes: number
  gzipBytes: number
  missing: boolean
  exceededBytes: boolean
  exceededGzipBytes: boolean
  exceeded: boolean
}

export function selectInitialEntryGraph(entryName: string): BundleOutputSelector {
  return (bundle) => {
    const entry = Object.values(bundle).find(
      (output): output is OutputChunk =>
        output.type === 'chunk' && output.isEntry && output.name === entryName
    )
    if (!entry) return []

    const files: string[] = []
    const visited = new Set<string>()
    const visit = (fileName: string) => {
      if (visited.has(fileName)) return
      visited.add(fileName)
      const output = bundle[fileName]
      if (!output || output.type !== 'chunk') return

      files.push(fileName)
      output.imports.forEach(visit)
    }
    visit(entry.fileName)
    return files
  }
}

export function selectFilesMatching(pattern: RegExp): BundleOutputSelector {
  return (bundle) => Object.keys(bundle).filter((fileName) => {
    pattern.lastIndex = 0
    return pattern.test(fileName)
  })
}

export function selectChunksContainingModules(
  moduleFragments: string[]
): BundleOutputSelector {
  return (bundle) => Object.values(bundle)
    .filter((output): output is OutputChunk => output.type === 'chunk')
    .filter((chunk) => Object.keys(chunk.modules).some((moduleId) => {
      const normalizedId = moduleId.replace(/\\/g, '/')
      return moduleFragments.some((fragment) => normalizedId.includes(fragment))
    }))
    .map((chunk) => chunk.fileName)
}

export function evaluateBundleSizeBudgets(
  bundle: OutputBundle,
  budgets: BundleSizeBudget[]
): BundleSizeBudgetResult[] {
  return budgets.map((budget) => {
    const files = [...new Set(budget.select(bundle))]
    let bytes = 0
    let gzipBytes = 0

    for (const fileName of files) {
      const output = bundle[fileName]
      if (!output) continue
      const content = outputContent(output)
      bytes += content.byteLength
      gzipBytes += gzipSync(content).byteLength
    }

    const missing = files.length === 0
    const exceededBytes = budget.maxBytes !== undefined && bytes > budget.maxBytes
    const exceededGzipBytes =
      budget.maxGzipBytes !== undefined && gzipBytes > budget.maxGzipBytes
    return {
      name: budget.name,
      files,
      bytes,
      gzipBytes,
      missing,
      exceededBytes,
      exceededGzipBytes,
      exceeded: missing || exceededBytes || exceededGzipBytes
    }
  })
}

export function assertBundleSizeBudgets(
  budgets: BundleSizeBudget[],
  pluginName = 'tellux-assert-bundle-size-budgets'
): Plugin {
  return {
    name: pluginName,
    generateBundle(_options, bundle) {
      const failures = evaluateBundleSizeBudgets(bundle, budgets)
        .filter((result) => result.exceeded)
      if (failures.length === 0) return

      this.error([
        'Bundle size budget exceeded:',
        ...failures.map((result) => {
          const budget = budgets.find((item) => item.name === result.name)!
          const actual = `${formatBytes(result.bytes)} raw / ${formatBytes(result.gzipBytes)} gzip`
          const limits = [
            budget.maxBytes === undefined ? null : `${formatBytes(budget.maxBytes)} raw`,
            budget.maxGzipBytes === undefined ? null : `${formatBytes(budget.maxGzipBytes)} gzip`
          ].filter(Boolean).join(' / ')
          const files = result.files.length === 0 ? 'no matching output' : result.files.join(', ')
          return `- ${result.name}: ${actual}; limit ${limits}; files: ${files}`
        })
      ].join('\n'))
    }
  }
}

function outputContent(output: OutputChunk | OutputAsset) {
  if (output.type === 'chunk') return Buffer.from(output.code)
  return typeof output.source === 'string'
    ? Buffer.from(output.source)
    : Buffer.from(output.source)
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024).toFixed(2)} KiB`
}
