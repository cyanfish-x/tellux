import { describe, expect, it } from 'vitest'

import { resolveGltfModelLighting, shouldPreserveGltfModelMaterial } from '../models/resolveGltfModelLighting'

describe('resolveGltfModelLighting', () => {
  it('defaults preserve materials to local lighting and auto to globe', () => {
    expect(resolveGltfModelLighting({ materialMode: 'preserve' })).toBe('local')
    expect(resolveGltfModelLighting({ materialMode: 'auto' })).toBe('globe')
    expect(resolveGltfModelLighting({})).toBe('globe')
  })

  it('honors an explicit lighting mode', () => {
    expect(resolveGltfModelLighting({ materialMode: 'preserve', lighting: 'globe' })).toBe('globe')
    expect(resolveGltfModelLighting({ materialMode: 'auto', lighting: 'local' })).toBe('local')
  })

  it('preserves glTF materials for local lighting even when materialMode is auto', () => {
    expect(shouldPreserveGltfModelMaterial({ lighting: 'local' })).toBe(true)
    expect(shouldPreserveGltfModelMaterial({ materialMode: 'auto' })).toBe(false)
    expect(shouldPreserveGltfModelMaterial({ materialMode: 'preserve' })).toBe(true)
  })
})
