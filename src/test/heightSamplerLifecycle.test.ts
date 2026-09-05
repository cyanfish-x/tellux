import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEG2RAD } from '../constants'
import { HeightSampler } from '../sampling/HeightSampler'
import { TilesetSamplingAdapter } from '../tiles/TilesetSamplingAdapter'

function createEllipsoid() {
  return {
    getCartographicToPosition(
      _latitude: number,
      _longitude: number,
      _height: number,
      target: THREE.Vector3
    ) {
      return target.set(1, 0, 0)
    },
    getCartographicToNormal(
      _latitude: number,
      _longitude: number,
      target: THREE.Vector3
    ) {
      return target.set(1, 0, 0)
    }
  }
}

function createTilesets(overrides: Record<string, unknown> = {}) {
  const ellipsoid = createEllipsoid()
  const surfaceTileset = {
    ellipsoid,
    group: {
      visible: false
    }
  }
  return {
    terrainOptions: undefined,
    terrainTileset: null,
    loadedSceneTilesets: [],
    loadedSceneTilesetEntries: [],
    tileset: surfaceTileset,
    surfaceTileset,
    createSceneRegionHeightSamplingTilesets: vi.fn(() => []),
    createHeightSamplingTilesets: vi.fn(() => []),
    disposeHeightSamplingTilesets: vi.fn(),
    ...overrides
  }
}

describe('HeightSampler lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('location', new URL('https://app.test/'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rejects with AbortError when disposed while waiting for browser paint', async () => {
    const sampler = new HeightSampler(createTilesets() as never)
    const result = sampler.sampleHeightMostDetailed([[120, 30]])
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' })

    sampler.dispose()
    await vi.runAllTimersAsync()

    await rejection
  })

  it('does not start new most-detailed work after disposal', async () => {
    const sampler = new HeightSampler(createTilesets() as never)
    sampler.dispose()

    await expect(
      sampler.sampleHeightMostDetailed([[120, 30]])
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects queued tileset jobs instead of resolving partial results', async () => {
    const samplingTileset = {
      ellipsoid: createEllipsoid(),
      group: {
        visible: true
      }
    }
    const tilesets = createTilesets({
      createSceneRegionHeightSamplingTilesets: vi.fn(() => [{
        source: samplingTileset,
        tileset: samplingTileset,
        useSamplingCamera: false,
        regionMask: false
      }])
    })
    const sampler = new HeightSampler(tilesets as never)
    const result = sampler.sampleHeightMostDetailed([[120, 30]])
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' })

    await vi.runAllTimersAsync()
    expect(sampler.hasPendingMostDetailedSampling).toBe(true)
    sampler.cancelMostDetailedSampling()

    await rejection
    expect(tilesets.disposeHeightSamplingTilesets).toHaveBeenCalledOnce()
  })

  it('aborts an in-flight direct terrain request when terrain changes', async () => {
    let requestSignal: AbortSignal | undefined
    let rejectRequest: ((reason: unknown) => void) | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined
      return new Promise<Response>((_resolve, reject) => {
        rejectRequest = reject
        requestSignal?.addEventListener('abort', () => {
          reject(requestSignal?.reason)
        }, { once: true })
      })
    }))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const terrainTileset = {
      ellipsoid: createEllipsoid(),
      group: {
        visible: true
      }
    }
    const sampler = new HeightSampler(createTilesets({
      terrainOptions: {
        type: 'url',
        url: 'https://terrain.test/'
      },
      terrainTileset,
      tileset: terrainTileset
    }) as never)
    const result = sampler.sampleHeightMostDetailed([[120, 30]], { source: 'terrain' })
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' })

    await vi.runAllTimersAsync()
    await Promise.resolve()
    expect(requestSignal).toBeDefined()

    sampler.resetForTerrainChange()
    if (!requestSignal?.aborted) {
      rejectRequest?.(new DOMException('cancelled', 'AbortError'))
    }

    expect(requestSignal?.aborted).toBe(true)
    await rejection
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('cancels hybrid terrain and tileset branches as one session', async () => {
    let requestSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined
      return new Promise<Response>(() => {})
    }))
    const terrainTileset = {
      ellipsoid: createEllipsoid(),
      group: {
        visible: true
      }
    }
    const samplingTileset = {
      ellipsoid: createEllipsoid(),
      group: {
        visible: true
      }
    }
    const tilesets = createTilesets({
      terrainOptions: {
        type: 'url',
        url: 'https://terrain.test/'
      },
      terrainTileset,
      tileset: terrainTileset,
      createHeightSamplingTilesets: vi.fn((source) => source === 'tileset'
        ? [{
            source: samplingTileset,
            tileset: samplingTileset,
            useSamplingCamera: true,
            regionMask: true
          }]
        : [])
    })
    const sampler = new HeightSampler(tilesets as never)
    const result = sampler.sampleHeightMostDetailed([[120, 30]], { source: 'all' })
    const outcome = result.then(
      (value) => ({ status: 'fulfilled' as const, value }),
      (reason) => ({ status: 'rejected' as const, reason })
    )

    await vi.runAllTimersAsync()
    await Promise.resolve()
    expect(sampler.hasPendingMostDetailedSampling).toBe(true)

    sampler.cancelMostDetailedSampling()

    await expect(outcome).resolves.toMatchObject({
      status: 'rejected',
      reason: { name: 'AbortError' }
    })
    expect(requestSignal?.aborted).toBe(true)
    expect(tilesets.disposeHeightSamplingTilesets).toHaveBeenCalledOnce()
  })

  it('matches per-point sampleHeight for a batch, including height 0 and misses', () => {
    const group = new THREE.Group()
    const updateMatrixWorld = vi.spyOn(group, 'updateMatrixWorld')
    const tileset = {
      ellipsoid: {
        getCartographicToPosition(
          _latitude: number,
          longitude: number,
          _height: number,
          target: THREE.Vector3
        ) {
          return target.set(longitude / DEG2RAD, 0, 0)
        },
        getCartographicToNormal(
          _latitude: number,
          _longitude: number,
          target: THREE.Vector3
        ) {
          return target.set(0, 0, 1)
        }
      },
      group
    }
    const sampler = new HeightSampler(createTilesets({
      loadedSceneTilesets: [],
      terrainTileset: null,
      tileset,
      surfaceTileset: tileset
    }) as never)

    vi.spyOn(TilesetSamplingAdapter.prototype, 'sampleHeight').mockImplementation(
      (_tileset, raycaster) => {
        const longitude = Math.round(raycaster.ray.origin.x)
        if (longitude === 121) return null
        if (longitude === 122) {
          return { height: 0, distance: 1, depth: 0, isTerrain: false }
        }
        return { height: longitude, distance: 1, depth: 0, isTerrain: false }
      }
    )

    const points = [
      [120, 30],
      [121, 31],
      { longitude: 122, latitude: 32 }
    ] as const

    const perPoint = points.map((point) => sampler.sampleHeight(point))
    expect(perPoint).toEqual([120, undefined, 0])
    expect(updateMatrixWorld).toHaveBeenCalledTimes(3)

    updateMatrixWorld.mockClear()
    expect(sampler.sampleHeight(points)).toEqual(perPoint)
    expect(updateMatrixWorld).toHaveBeenCalledTimes(1)
    expect(sampler.sampleHeight([])).toEqual([])
  })
})
