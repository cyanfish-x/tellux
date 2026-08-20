import { describe, expect, it } from 'vitest'

import { TerrainFieldClipmap } from './TerrainFieldClipmap'

function page(
  id: string,
  depth: number,
  height: number,
  options: { parentId?: string | null, loadedAt?: number } = {}
) {
  return {
    id,
    parentId: options.parentId ?? null,
    sourceRevision: 1,
    depth,
    rectangle: { west: 0, south: 0, east: 1, north: 1 },
    size: 2,
    heights: new Float32Array([height, height, height, height]),
    validity: new Uint8Array([1, 1, 1, 1]),
    loadedAt: options.loadedAt ?? 0
  }
}

describe('TerrainFieldClipmap', () => {
  it('uses the highest complete page and blends it from its parent', () => {
    const clipmap = new TerrainFieldClipmap({ maxBytes: 1024, blendSeconds: 2 })
    clipmap.upsert(page('parent', 1, 10))
    clipmap.upsert(page('child', 2, 20, { parentId: 'parent', loadedAt: 1 }))

    expect(clipmap.sample(0.5, 0.5, 1)?.height).toBe(10)
    expect(clipmap.sample(0.5, 0.5, 2)?.height).toBe(15)
    expect(clipmap.sample(0.5, 0.5, 3)?.height).toBe(20)
  })

  it('keeps the parent fallback when a child page is incomplete', () => {
    const clipmap = new TerrainFieldClipmap({ maxBytes: 1024, blendSeconds: 1 })
    clipmap.upsert(page('parent', 1, 10))
    const child = page('child', 2, 20, { parentId: 'parent' })
    child.validity[3] = 0
    clipmap.upsert(child)

    expect(clipmap.sample(1, 1, 5)?.height).toBe(10)
  })

  it('evicts least-recently-used pages within the byte budget', () => {
    const clipmap = new TerrainFieldClipmap({ maxBytes: 24, blendSeconds: 0 })
    clipmap.upsert(page('a', 1, 1))
    clipmap.upsert({ ...page('b', 1, 2), rectangle: { west: 2, south: 0, east: 3, north: 1 } })

    expect(clipmap.pageCount).toBe(1)
    expect(clipmap.sample(0.5, 0.5, 0)).toBeNull()
    expect(clipmap.sample(2.5, 0.5, 0)?.height).toBe(2)
  })
})
