import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'

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

describe.skipIf(!distAvailable)('stable dist API surface', () => {
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

  it('checks reachable facade contracts from a package consumer', () => {
    const file = resolve(root, 'dist/__consumer_contract__.ts')
    const source = `
      import { Globe, Terrain, SceneTilesetCollection, ViewerRenderer, ModelManager } from './index'
      import type { Viewer, ViewerOptions, CameraState, PointGraphics, PolygonGraphics, TextGraphics } from './index'
      type Assert<T extends true> = T
      type Equal<A, B> = [A, B] extends [B, A] ? true : false
      type PublicConstructor<T> = T extends abstract new (...args: any[]) => any ? true : false
      type Models = Assert<Equal<keyof ModelManager, 'add' | 'get' | 'list' | 'remove'>>
      type HostedConstructors = Assert<Equal<PublicConstructor<
        typeof Globe | typeof Terrain | typeof SceneTilesetCollection | typeof ViewerRenderer | typeof ModelManager
      >, false>>
      declare const viewer: Viewer
      const state: CameraState = viewer.camera.getState()
      const longitude: number = state.destination.longitude
      const height: number = state.destination.height
      const heading: number = state.orientation.heading
      const options: ViewerOptions = { camera: state }
      declare const point: PointGraphics
      declare const polygon: PolygonGraphics
      declare const text: TextGraphics
      if (point.outline) { point.outline.color = '#ffffff'; point.outline.width = 3 }
      if (polygon.outline) { polygon.outline.color = '#ffffff' }
      if (text.outline) { text.outline.color = '#ffffff'; text.outline.width = 3 }
      type NoFlatOutline = Assert<Equal<Extract<keyof PointGraphics | keyof PolygonGraphics | keyof TextGraphics, 'outlineColor' | 'outlineWidth'>, never>>
    `
    const options: ts.CompilerOptions = {
      strict: true, noEmit: true, skipLibCheck: true,
      target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler
    }
    const host = ts.createCompilerHost(options)
    const read = host.readFile.bind(host)
    host.readFile = path => resolve(path) === file ? source : read(path)
    const exists = host.fileExists.bind(host)
    host.fileExists = path => resolve(path) === file || exists(path)
    const program = ts.createProgram([file], options, host)
    expect(ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([])
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
