import { TilesRenderer } from '3d-tiles-renderer'

export type HeightSamplingTilesetPoolEntry = {
  tileset: TilesRenderer
  poolKey?: string
  poolRevision?: number
}

export type HeightSamplingTilesetPoolOptions = {
  isReusable: (tileset: TilesRenderer) => boolean
}

export class HeightSamplingTilesetPool {
  private readonly pool = new Map<string, TilesRenderer[]>()
  private poolRevision = 0

  constructor(private readonly options: HeightSamplingTilesetPoolOptions) {}

  get revision() {
    return this.poolRevision
  }

  acquire(poolKey: string, createTileset: () => TilesRenderer) {
    const pool = this.pool.get(poolKey)
    const tileset = pool?.pop() ?? createTileset()
    this.configureTileset(tileset)
    return tileset
  }

  release(entry: HeightSamplingTilesetPoolEntry) {
    if (!entry.poolKey || entry.poolRevision === undefined) {
      return
    }

    if (
      entry.poolRevision !== this.poolRevision ||
      !this.options.isReusable(entry.tileset)
    ) {
      entry.tileset.dispose()
      return
    }

    let pool = this.pool.get(entry.poolKey)
    if (!pool) {
      pool = []
      this.pool.set(entry.poolKey, pool)
    }
    pool.push(entry.tileset)
  }

  invalidate() {
    this.poolRevision += 1
    this.pool.forEach((pool) => {
      pool.forEach((tileset) => {
        tileset.dispose()
      })
    })
    this.pool.clear()
  }

  private configureTileset(tileset: TilesRenderer) {
    tileset.displayActiveTiles = true
    tileset.loadAncestors = true
    tileset.loadSiblings = false
    tileset.errorTarget = 0
    tileset.maxTilesProcessed = 8
    tileset.downloadQueue.maxJobs = Math.min(tileset.downloadQueue.maxJobs, 4)
    tileset.parseQueue.maxJobs = Math.min(tileset.parseQueue.maxJobs, 1)
    tileset.processNodeQueue.maxJobs = Math.min(tileset.processNodeQueue.maxJobs, 2)
  }
}
