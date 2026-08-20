import * as THREE from 'three'
import type { Tile } from '3d-tiles-renderer/core'
import type { TilesRenderer } from '3d-tiles-renderer'
import type {
  TerrainMaterialDecoration,
  TerrainMaterialDecorator,
  TerrainTileEvent,
  TerrainTileListener,
  TerrainTileObserverOptions,
  TerrainTileObserverRectangle,
  TerrainTileRectangle,
  TerrainTileSnapshot
} from '../types'

type TerrainTileWithRegion = Tile & {
  boundingVolume: Tile['boundingVolume'] & {
    region?: [number, number, number, number, number?, number?]
  }
}

type Observer = {
  listener: TerrainTileListener
  rectangle?: TerrainTileObserverRectangle
}

type DecoratorEntry = {
  id: number
  decorate: TerrainMaterialDecorator
}

type AppliedDecoration = TerrainMaterialDecoration & {
  decoratorId: number
}

type MeshDecorationState = {
  mesh: THREE.Mesh
  baseMaterial: THREE.Material | THREE.Material[]
  applied: AppliedDecoration[]
}

type LoadedTile = {
  tile: Tile
  snapshot: TerrainTileSnapshot
  meshStates: MeshDecorationState[]
}

export interface TerrainTileLifecycleManagerOptions {
  reportError?: (error: unknown) => void
}

const RAD2DEG = 180 / Math.PI

export class TerrainTileLifecycleManager {
  private readonly observers = new Set<Observer>()
  private readonly decorators: DecoratorEntry[] = []
  private readonly loadedTiles = new Map<Tile, LoadedTile>()
  private readonly tileIds = new WeakMap<Tile, string>()
  private readonly reportError: (error: unknown) => void
  private tileset: TilesRenderer | null = null
  private nextTileId = 0
  private nextDecoratorId = 0
  private currentSourceRevision = 0
  private isDisposed = false

  constructor(options: TerrainTileLifecycleManagerOptions = {}) {
    this.reportError = options.reportError ?? ((error) => console.error('Terrain material decorator failed.', error))
  }

  get sourceRevision() {
    return this.currentSourceRevision
  }

  setTileset(tileset: TilesRenderer | null, reason: 'source-change' | 'destroy' = 'source-change') {
    if (this.isDisposed || tileset === this.tileset) return

    const hadSourceState = this.tileset !== null || this.currentSourceRevision > 0
    this.detachTileset()
    this.releaseLoadedTiles()
    this.currentSourceRevision += 1
    if (hadSourceState || this.observers.size > 0) {
      this.dispatchReset(reason)
    }

    this.tileset = tileset
    if (tileset) {
      tileset.addEventListener('load-model', this.handleLoadModel)
      tileset.addEventListener('dispose-model', this.handleDisposeModel)
    }
  }

  observeTiles(listener: TerrainTileListener, options: TerrainTileObserverOptions = {}) {
    if (this.isDisposed) return () => undefined

    const observer: Observer = { listener, rectangle: options.rectangle }
    this.observers.add(observer)
    if (options.replay !== false) {
      const records = [...this.loadedTiles.values()].sort((a, b) => {
        return a.snapshot.depth - b.snapshot.depth || a.snapshot.id.localeCompare(b.snapshot.id)
      })
      for (const record of records) {
        if (this.matchesObserver(observer, record.snapshot.rectangle)) {
          listener({ type: 'load', tile: record.snapshot })
        }
      }
    }

    let isSubscribed = true
    return () => {
      if (!isSubscribed) return
      isSubscribed = false
      this.observers.delete(observer)
    }
  }

  addMaterialDecorator(decorate: TerrainMaterialDecorator) {
    if (this.isDisposed) return () => undefined

    const entry = { id: ++this.nextDecoratorId, decorate }
    this.decorators.push(entry)
    for (const record of this.loadedTiles.values()) {
      this.applyDecorator(record, entry)
    }

    let isRegistered = true
    return () => {
      if (!isRegistered) return
      isRegistered = false
      const index = this.decorators.indexOf(entry)
      if (index === -1) return
      this.decorators.splice(index, 1)
      for (const record of this.loadedTiles.values()) {
        this.rebuildDecorations(record)
      }
    }
  }

  dispose() {
    if (this.isDisposed) return
    this.setTileset(null, 'destroy')
    this.isDisposed = true
    this.observers.clear()
    this.decorators.length = 0
  }

  private readonly handleLoadModel = (event: { scene: THREE.Object3D, tile: Tile }) => {
    const rectangle = this.resolveRectangle(event.tile)
    if (!rectangle) return

    const previous = this.loadedTiles.get(event.tile)
    if (previous) {
      this.releaseDecorations(previous)
    }

    const snapshot = Object.freeze({
      id: this.getTileId(event.tile),
      parentId: event.tile.parent ? this.getTileId(event.tile.parent) : null,
      sourceRevision: this.currentSourceRevision,
      depth: event.tile.internal.depth,
      geometricError: event.tile.geometricError,
      isVirtual: event.tile.internal.isVirtual,
      rectangle: Object.freeze(rectangle),
      model: event.scene
    }) satisfies TerrainTileSnapshot
    const record: LoadedTile = {
      tile: event.tile,
      snapshot,
      meshStates: this.collectMeshStates(event.scene)
    }
    this.loadedTiles.set(event.tile, record)
    for (const decorator of this.decorators) {
      this.applyDecorator(record, decorator)
    }
    this.dispatchTileEvent({ type: 'load', tile: snapshot })
  }

  private readonly handleDisposeModel = (event: { scene: THREE.Object3D, tile: Tile }) => {
    const record = this.loadedTiles.get(event.tile)
    if (!record) return

    this.dispatchTileEvent({ type: 'unload', tile: record.snapshot })
    this.releaseDecorations(record)
    this.loadedTiles.delete(event.tile)
  }

  private resolveRectangle(tile: Tile): TerrainTileRectangle | null {
    const region = (tile as TerrainTileWithRegion).boundingVolume.region
    if (!region || region.length < 4) return null

    const [west, south, east, north, minHeight = 0, maxHeight = 0] = region
    if (![west, south, east, north, minHeight, maxHeight].every(Number.isFinite)) return null
    return {
      west: west * RAD2DEG,
      south: south * RAD2DEG,
      east: east * RAD2DEG,
      north: north * RAD2DEG,
      minHeight,
      maxHeight
    }
  }

  private getTileId(tile: Tile) {
    let id = this.tileIds.get(tile)
    if (!id) {
      id = `${this.currentSourceRevision}:${++this.nextTileId}`
      this.tileIds.set(tile, id)
    }
    return id
  }

  private collectMeshStates(model: THREE.Object3D) {
    const states: MeshDecorationState[] = []
    model.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return
      const mesh = object as THREE.Mesh
      states.push({ mesh, baseMaterial: mesh.material, applied: [] })
    })
    return states
  }

  private applyDecorator(record: LoadedTile, decorator: DecoratorEntry) {
    for (const state of record.meshStates) {
      const material = state.mesh.material
      try {
        const result = decorator.decorate({
          tile: record.snapshot,
          mesh: state.mesh,
          material
        })
        if (!result) continue
        state.mesh.material = result.material
        state.applied.push({ ...result, decoratorId: decorator.id })
      } catch (error) {
        this.reportError(error)
      }
    }
  }

  private rebuildDecorations(record: LoadedTile) {
    this.releaseDecorations(record)
    for (const decorator of this.decorators) {
      this.applyDecorator(record, decorator)
    }
  }

  private releaseDecorations(record: LoadedTile) {
    for (const state of record.meshStates) {
      state.mesh.material = state.baseMaterial
      for (let index = state.applied.length - 1; index >= 0; index -= 1) {
        try {
          state.applied[index].dispose()
        } catch (error) {
          this.reportError(error)
        }
      }
      state.applied.length = 0
    }
  }

  private releaseLoadedTiles() {
    for (const record of this.loadedTiles.values()) {
      this.releaseDecorations(record)
    }
    this.loadedTiles.clear()
  }

  private dispatchTileEvent(event: Exclude<TerrainTileEvent, { type: 'reset' }>) {
    for (const observer of [...this.observers]) {
      if (this.matchesObserver(observer, event.tile.rectangle)) {
        observer.listener(event)
      }
    }
  }

  private dispatchReset(reason: 'source-change' | 'destroy') {
    const event: TerrainTileEvent = {
      type: 'reset',
      sourceRevision: this.currentSourceRevision,
      reason
    }
    for (const observer of [...this.observers]) {
      observer.listener(event)
    }
  }

  private matchesObserver(observer: Observer, tile: TerrainTileRectangle) {
    const filter = observer.rectangle
    if (!filter) return true
    return longitudeRangesIntersect(tile.west, tile.east, filter.west, filter.east) &&
      tile.south <= filter.north && tile.north >= filter.south
  }

  private detachTileset() {
    if (!this.tileset) return
    this.tileset.removeEventListener('load-model', this.handleLoadModel)
    this.tileset.removeEventListener('dispose-model', this.handleDisposeModel)
    this.tileset = null
  }
}

function longitudeRangesIntersect(westA: number, eastA: number, westB: number, eastB: number) {
  const rangesA = splitLongitudeRange(westA, eastA)
  const rangesB = splitLongitudeRange(westB, eastB)
  return rangesA.some(([west1, east1]) =>
    rangesB.some(([west2, east2]) => west1 <= east2 && east1 >= west2)
  )
}

function splitLongitudeRange(west: number, east: number): Array<[number, number]> {
  return west <= east ? [[west, east]] : [[west, 180], [-180, east]]
}
