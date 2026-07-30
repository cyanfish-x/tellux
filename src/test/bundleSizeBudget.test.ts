import { describe, expect, it } from 'vitest'
import type { Rollup } from 'vite'

import {
  evaluateBundleSizeBudgets,
  selectChunksContainingModules,
  selectFilesMatching,
  selectInitialEntryGraph
} from '../build/bundleSizeBudget'

type OutputBundle = Rollup.OutputBundle
type OutputChunk = Rollup.OutputChunk

function chunk(
  fileName: string,
  options: {
    name?: string
    code?: string
    imports?: string[]
    dynamicImports?: string[]
    isEntry?: boolean
    modules?: string[]
  } = {}
): OutputChunk {
  return {
    type: 'chunk',
    fileName,
    name: options.name ?? fileName,
    code: options.code ?? '',
    imports: options.imports ?? [],
    dynamicImports: options.dynamicImports ?? [],
    isEntry: options.isEntry ?? false,
    modules: Object.fromEntries(
      (options.modules ?? []).map((id) => [id, {
        code: null,
        originalLength: 0,
        removedExports: [],
        renderedExports: [],
        renderedLength: 0
      }])
    )
  } as unknown as OutputChunk
}

describe('bundle size budgets', () => {
  it('measures an entry static graph without charging lazy chunks', () => {
    const bundle = {
      'entry.js': chunk('entry.js', {
        name: 'app',
        code: 'entry',
        imports: ['shared.js'],
        dynamicImports: ['optional.js'],
        isEntry: true
      }),
      'shared.js': chunk('shared.js', { code: 'shared' }),
      'optional.js': chunk('optional.js', { code: 'optional' })
    } as OutputBundle

    const [result] = evaluateBundleSizeBudgets(bundle, [{
      name: 'app initial JS',
      select: selectInitialEntryGraph('app'),
      maxBytes: 1024
    }])

    expect(result.files).toEqual(['entry.js', 'shared.js'])
    expect(result.bytes).toBe(11)
    expect(result.exceeded).toBe(false)
  })

  it('supports file and module selectors for dedicated capability budgets', () => {
    const bundle = {
      'worker.js': chunk('worker.js', { code: 'worker' }),
      'tree.js': chunk('tree.js', {
        code: 'tree',
        modules: ['D:/repo/node_modules/@dgreenheck/ez-tree/dist/index.js']
      })
    } as OutputBundle

    const results = evaluateBundleSizeBudgets(bundle, [
      {
        name: 'worker',
        select: selectFilesMatching(/^worker\.js$/),
        maxBytes: 6
      },
      {
        name: 'tree',
        select: selectChunksContainingModules(['/@dgreenheck/ez-tree/']),
        maxBytes: 4
      }
    ])

    expect(results[0]).toMatchObject({
      files: ['worker.js'],
      bytes: 6,
      exceeded: false
    })
    expect(results[1]).toMatchObject({
      files: ['tree.js'],
      bytes: 4,
      exceeded: false
    })
  })

  it('reports missing outputs and exceeded raw or gzip limits', () => {
    const bundle = {
      'large.js': chunk('large.js', { code: '0123456789' })
    } as OutputBundle

    const results = evaluateBundleSizeBudgets(bundle, [
      {
        name: 'large',
        select: selectFilesMatching(/^large\.js$/),
        maxBytes: 9,
        maxGzipBytes: 1
      },
      {
        name: 'missing',
        select: selectFilesMatching(/^missing\.js$/),
        maxBytes: 1
      }
    ])

    expect(results[0]).toMatchObject({
      missing: false,
      exceeded: true
    })
    expect(results[1]).toMatchObject({
      missing: true,
      exceeded: true
    })
  })
})
