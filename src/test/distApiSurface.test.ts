import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  PUBLIC_TYPE_EXPORTS,
  PUBLIC_VALUE_EXPORTS,
  assertPackageExportContract,
  findBannedApiSurfaceHits,
  parseBarrelExports
} from '../build/publicApiSurface'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const distIndex = resolve(root, 'dist/index.d.ts')
const distAssets = resolve(root, 'dist/assets.d.ts')
const distAvailable = existsSync(distIndex) && existsSync(distAssets)

describe.skipIf(!distAvailable)('1.0 dist API surface', () => {
  it('keeps package exports and types on the frozen mapping', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      types?: string
      exports?: unknown
    }
    expect(assertPackageExportContract(pkg)).toEqual([])
  })

  it('emits the frozen barrel in dist/index.d.ts', () => {
    const parsed = parseBarrelExports(readFileSync(distIndex, 'utf8'))
    expect(parsed.values).toEqual([...PUBLIC_VALUE_EXPORTS])
    expect(parsed.types).toEqual([...PUBLIC_TYPE_EXPORTS])
  })

  it('does not leak banned internal members into declaration files', () => {
    const files = listDeclarationFiles(resolve(root, 'dist')).map((file) => ({
      file,
      source: readFileSync(file, 'utf8')
    }))
    expect(findBannedApiSurfaceHits(files)).toEqual([])
  })
})

function listDeclarationFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listDeclarationFiles(fullPath))
      continue
    }
    if (entry.name.endsWith('.d.ts')) files.push(fullPath)
  }
  return files
}
