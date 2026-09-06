import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import * as Tellux from '../index'
import {
  PUBLIC_TYPE_EXPORTS,
  PUBLIC_VALUE_EXPORTS,
  findBannedApiSurfaceHits,
  parseBarrelExports
} from '../build/publicApiSurface'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const indexSource = readFileSync(resolve(root, 'src/index.ts'), 'utf8')

describe('stable public export baseline', () => {
  it('freezes named value and type exports from src/index.ts', () => {
    const parsed = parseBarrelExports(indexSource)
    expect(parsed.values).toEqual([...PUBLIC_VALUE_EXPORTS])
    expect(parsed.types).toEqual([...PUBLIC_TYPE_EXPORTS])
  })

  it('freezes runtime module keys', () => {
    expect(Object.keys(Tellux).sort()).toEqual([...PUBLIC_VALUE_EXPORTS])
    expect(Tellux.default).toBe(Tellux.tellux)
  })

  it('detects banned internal members in declaration text', () => {
    const hits = findBannedApiSurfaceHits([
      {
        file: 'HighlightManager.d.ts',
        source: 'export declare class HighlightManager { private syncStyleFromSettings(): void }'
      },
      {
        file: 'AtmosphereSettings.d.ts',
        source: 'export declare class AtmosphereSettings { private apply(): void }'
      }
    ])
    expect(hits.map((hit) => hit.pattern).sort()).toEqual([
      'Settings.apply',
      'syncStyleFromSettings'
    ])
  })
})
