import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { QuantizedMeshTerrainSampler } from '../sampling/QuantizedMeshTerrainSampler'

const emptyLayer = {
  projection: 'EPSG:4326',
  maxzoom: 0,
  available: [[]],
  tiles: ['{z}/{x}/{y}.terrain']
}

function createTriangleTerrainBuffer() {
  const buffer = new ArrayBuffer(136)
  const view = new DataView(buffer)
  let offset = 0
  const writeFloat64 = (value: number) => {
    view.setFloat64(offset, value, true)
    offset += 8
  }
  const writeFloat32 = (value: number) => {
    view.setFloat32(offset, value, true)
    offset += 4
  }
  const writeUint32 = (value: number) => {
    view.setUint32(offset, value, true)
    offset += 4
  }
  const writeUint16 = (value: number) => {
    view.setUint16(offset, value, true)
    offset += 2
  }

  for (let index = 0; index < 3; index += 1) writeFloat64(0)
  writeFloat32(25)
  writeFloat32(25)
  for (let index = 0; index < 7; index += 1) writeFloat64(0)

  writeUint32(3)
  ;[0, 65534, 65533].forEach(writeUint16)
  ;[0, 0, 65534].forEach(writeUint16)
  ;[0, 0, 0].forEach(writeUint16)

  writeUint32(1)
  ;[0, 0, 0].forEach(writeUint16)
  for (let index = 0; index < 4; index += 1) writeUint32(0)

  expect(offset).toBe(buffer.byteLength)
  return buffer
}

describe('QuantizedMeshTerrainSampler cache lifecycle', () => {
  beforeEach(() => {
    vi.stubGlobal('location', new URL('https://app.test/'))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('deduplicates concurrent layer requests and evicts failed promises for retry', async () => {
    let resolveLayer: ((response: Response) => void) | undefined
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        resolveLayer = resolve
      }))
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(new Response(JSON.stringify(emptyLayer), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }))
    vi.stubGlobal('fetch', fetchMock)

    const sampler = new QuantizedMeshTerrainSampler()
    const terrain = { type: 'url' as const, url: 'https://terrain.test/' }
    const first = sampler.sampleMostDetailed(terrain, [[0, 0]])
    const second = sampler.sampleMostDetailed(terrain, [[1, 1]])
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce()
    })

    resolveLayer?.(new Response(JSON.stringify(emptyLayer), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
    await expect(Promise.all([first, second])).resolves.toEqual([[undefined], [undefined]])

    sampler.clear()
    await expect(sampler.sampleMostDetailed(terrain, [[0, 0]])).rejects.toThrow('temporary failure')
    await expect(sampler.sampleMostDetailed(terrain, [[0, 0]])).resolves.toEqual([undefined])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('bounds layer metadata with least-recently-used eviction', async () => {
    const fetchMock = vi.fn((_url: string | URL | Request) => Promise.resolve(new Response(JSON.stringify(emptyLayer), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })))
    vi.stubGlobal('fetch', fetchMock)
    const sampler = new QuantizedMeshTerrainSampler({
      maxLayerCacheEntries: 2,
      maxTileCacheEntries: 2
    })
    const sample = (name: string) => sampler.sampleMostDetailed(
      { type: 'url', url: `https://${name}.terrain.test/` },
      [[0, 0]]
    )

    await sample('a')
    await sample('b')
    await sample('a')
    await sample('c')
    await sample('b')

    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).host)).toEqual([
      'a.terrain.test',
      'b.terrain.test',
      'c.terrain.test',
      'b.terrain.test'
    ])
  })

  it('bounds decoded terrain tiles with least-recently-used eviction', async () => {
    const layer = {
      projection: 'EPSG:4326',
      maxzoom: 1,
      available: [
        [{ startX: 0, startY: 0, endX: 1, endY: 0 }],
        [{ startX: 0, startY: 0, endX: 3, endY: 1 }]
      ],
      tiles: ['{z}/{x}/{y}.terrain']
    }
    const terrainRequests: string[] = []
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/layer.json')) {
        return Promise.resolve(new Response(JSON.stringify(layer), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }))
      }

      terrainRequests.push(new URL(url).pathname)
      return Promise.resolve(new Response(createTriangleTerrainBuffer(), {
        status: 200
      }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const sampler = new QuantizedMeshTerrainSampler({
      maxLayerCacheEntries: 1,
      maxTileCacheEntries: 2
    })
    const terrain = { type: 'url' as const, url: 'https://terrain.test/' }
    const sample = (longitude: number) => sampler.sampleMostDetailed(
      terrain,
      [[longitude, -45]]
    )

    await expect(sample(-135)).resolves.toEqual([[-135, -45, 25]])
    await expect(sample(-45)).resolves.toEqual([[-45, -45, 25]])
    await sample(-135)
    await expect(sample(45)).resolves.toEqual([[45, -45, 25]])
    await sample(-45)

    expect(terrainRequests).toEqual([
      '/1/0/0.terrain',
      '/1/1/0.terrain',
      '/1/2/0.terrain',
      '/1/1/0.terrain'
    ])
  })
})
