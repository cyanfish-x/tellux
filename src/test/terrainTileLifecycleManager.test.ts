import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import { TerrainTileLifecycleManager } from '../tiles/TerrainTileLifecycleManager'
import type { TerrainTileEvent } from '../types'

type Listener = (event: Record<string, unknown>) => void

type FakeTile = {
  parent: FakeTile | null
  geometricError: number
  boundingVolume: { region: [number, number, number, number, number, number] }
  internal: { depth: number, isVirtual: boolean }
}

class FakeTilesRenderer {
  private readonly listeners = new Map<string, Set<Listener>>()

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener)
  }

  dispatch(type: string, event: Record<string, unknown>) {
    this.listeners.get(type)?.forEach((listener) => listener({ ...event, type }))
  }
}

function createTile(
  depth: number,
  region: [number, number, number, number, number, number],
  parent: FakeTile | null = null,
  isVirtual = false
): FakeTile {
  return {
    parent,
    geometricError: 32 / (depth + 1),
    boundingVolume: { region },
    internal: { depth, isVirtual }
  }
}

function load(renderer: FakeTilesRenderer, tile: FakeTile, scene = new THREE.Group()) {
  renderer.dispatch('load-model', { tile, scene, url: `tile-${tile.internal.depth}` })
  return scene
}

describe('TerrainTileLifecycleManager observation', () => {
  it('replays loaded tiles synchronously in parent-first order', () => {
    const manager = new TerrainTileLifecycleManager()
    const renderer = new FakeTilesRenderer()
    manager.setTileset(renderer as never)
    const parent = createTile(2, [1, 0.2, 1.2, 0.4, -5, 20])
    const child = createTile(3, [1.1, 0.3, 1.2, 0.4, -2, 15], parent, true)
    load(renderer, child)
    load(renderer, parent)

    const events: TerrainTileEvent[] = []
    manager.observeTiles((event) => events.push(event))

    expect(events.map((event) => event.type)).toEqual(['load', 'load'])
    const snapshots = events.flatMap((event) => event.type === 'load' ? [event.tile] : [])
    expect(snapshots.map((tile) => tile.depth)).toEqual([2, 3])
    expect(snapshots[1].parentId).toBe(snapshots[0].id)
    expect(snapshots[1].isVirtual).toBe(true)
    expect(snapshots[0].rectangle.west).toBeCloseTo(180 / Math.PI)
    expect(snapshots[0].rectangle.minHeight).toBe(-5)
  })

  it('filters load and unload events by rectangle while always delivering reset', () => {
    const manager = new TerrainTileLifecycleManager()
    const renderer = new FakeTilesRenderer()
    manager.setTileset(renderer as never)
    const inside = createTile(1, [1, 0.2, 1.2, 0.4, 0, 10])
    const outside = createTile(1, [2, 0.2, 2.2, 0.4, 0, 10])
    const events: TerrainTileEvent[] = []
    manager.observeTiles((event) => events.push(event), {
      replay: false,
      rectangle: { west: 55, south: 10, east: 75, north: 30 }
    })

    const insideScene = load(renderer, inside)
    load(renderer, outside)
    renderer.dispatch('dispose-model', { tile: inside, scene: insideScene })
    manager.setTileset(new FakeTilesRenderer() as never)

    expect(events.map((event) => event.type)).toEqual(['load', 'unload', 'reset'])
    expect(events[2]).toMatchObject({ type: 'reset', reason: 'source-change', sourceRevision: 2 })
  })

  it('uses reset instead of per-tile unload when the source changes', () => {
    const manager = new TerrainTileLifecycleManager()
    const first = new FakeTilesRenderer()
    manager.setTileset(first as never)
    load(first, createTile(1, [1, 0.2, 1.2, 0.4, 0, 10]))
    const events: TerrainTileEvent[] = []
    manager.observeTiles((event) => events.push(event), { replay: false })

    manager.setTileset(new FakeTilesRenderer() as never)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'reset', sourceRevision: 2 })
  })

  it('returns an idempotent unsubscribe function', () => {
    const manager = new TerrainTileLifecycleManager()
    const renderer = new FakeTilesRenderer()
    manager.setTileset(renderer as never)
    const listener = vi.fn()
    const unsubscribe = manager.observeTiles(listener)

    unsubscribe()
    unsubscribe()
    load(renderer, createTile(1, [1, 0.2, 1.2, 0.4, 0, 10]))

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('TerrainTileLifecycleManager material decorators', () => {
  it('composes decorators in order and restores the base material on unsubscribe', () => {
    const manager = new TerrainTileLifecycleManager()
    const renderer = new FakeTilesRenderer()
    manager.setTileset(renderer as never)
    const base = new THREE.MeshBasicMaterial({ name: 'base' })
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), base)
    const scene = new THREE.Group().add(mesh)
    load(renderer, createTile(1, [1, 0.2, 1.2, 0.4, 0, 10]), scene)
    const disposeFirst = vi.fn()
    const disposeSecond = vi.fn()
    const firstMaterial = new THREE.MeshBasicMaterial({ name: 'first' })
    const secondMaterial = new THREE.MeshBasicMaterial({ name: 'second' })
    const secondInputs: Array<THREE.Material | THREE.Material[]> = []

    const removeFirst = manager.addMaterialDecorator(({ material }) => {
      expect(material).toBe(base)
      return { material: firstMaterial, dispose: disposeFirst }
    })
    const removeSecond = manager.addMaterialDecorator(({ material }) => {
      secondInputs.push(material)
      return { material: secondMaterial, dispose: disposeSecond }
    })

    expect(mesh.material).toBe(secondMaterial)
    expect(secondInputs).toEqual([firstMaterial])
    removeFirst()
    expect(mesh.material).toBe(secondMaterial)
    expect(secondInputs).toEqual([firstMaterial, base])
    expect(disposeFirst).toHaveBeenCalledOnce()
    expect(disposeSecond).toHaveBeenCalledOnce()

    removeSecond()
    expect(mesh.material).toBe(base)
    expect(disposeSecond).toHaveBeenCalledTimes(2)
  })

  it('keeps the last valid material when a decorator fails and releases on unload', () => {
    const reportError = vi.fn()
    const manager = new TerrainTileLifecycleManager({ reportError })
    const renderer = new FakeTilesRenderer()
    manager.setTileset(renderer as never)
    const base = new THREE.MeshBasicMaterial({ name: 'base' })
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), base)
    const scene = new THREE.Group().add(mesh)
    const tile = createTile(1, [1, 0.2, 1.2, 0.4, 0, 10])
    const decorated = new THREE.MeshBasicMaterial({ name: 'decorated' })
    const dispose = vi.fn()
    manager.addMaterialDecorator(() => ({ material: decorated, dispose }))
    manager.addMaterialDecorator(() => {
      throw new Error('decorator failed')
    })

    load(renderer, tile, scene)
    expect(mesh.material).toBe(decorated)
    expect(reportError).toHaveBeenCalledOnce()

    renderer.dispatch('dispose-model', { tile, scene })
    expect(mesh.material).toBe(base)
    expect(dispose).toHaveBeenCalledOnce()
  })
})
