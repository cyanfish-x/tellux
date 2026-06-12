import * as THREE from 'three'
import type { TilesRenderer } from '3d-tiles-renderer'

const TILE_LOADING_STATE_FAILED = -1
const TILE_LOADING_STATE_LOADED = 4

// 统一收口 height sampling 对 3d-tiles-renderer 非公开运行时字段的读取。
// 上游字段变化时优先修改本文件，避免让 HeightSampler 和 TilesetManager 继续扩散内部结构假设。
type RaycastableTilesRenderer = TilesRenderer & {
  raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void
}

type SamplingTile = {
  geometricError: number
  parent?: SamplingTile | null
  children?: SamplingTile[]
  engineData?: {
    scene?: THREE.Object3D | null
    boundingVolume?: {
      intersectsRay(ray: THREE.Ray): boolean
    }
  }
  internal?: {
    hasContent: boolean
    hasRenderableContent: boolean
    hasUnrenderableContent: boolean
    loadingState: number
    depth: number
  }
  traversal?: {
    error: number
  }
}

type SamplingTilesRenderer = TilesRenderer & {
  root: SamplingTile | null
  errorTarget: number
  maxDepth: number
  activeTiles?: Set<SamplingTile>
  visibleTiles?: Set<SamplingTile>
  isLoading?: boolean
  stats?: {
    queued?: number
    downloading?: number
    parsing?: number
  }
  downloadQueue?: { running?: boolean }
  parseQueue?: { running?: boolean }
  processNodeQueue?: { running?: boolean }
  loadingTiles?: Set<unknown>
}

export type TilesetSamplingHit = {
  height: number
  distance: number
  depth: number
  isTerrain: boolean
}

type SamplingTileReadiness = {
  intersects: boolean
  ready: boolean
}

export type TilesetSamplingReadinessSummary = {
  ready: boolean
  intersectingRays: number
  pendingRays: number
}

export type TilesetSamplingSnapshot = {
  loading: boolean
  loadProgress: number
  queued: number
  downloading: number
  parsing: number
  activeTiles: number
  visibleTiles: number
  loadingTiles: number
  downloadQueueRunning: boolean
  parseQueueRunning: boolean
  processNodeQueueRunning: boolean
}

export class TilesetSamplingAdapter {
  private readonly samplePoint = new THREE.Vector3()
  private readonly sampleCartographicScratch = { lat: 0, lon: 0, height: 0 }
  private readonly hits: THREE.Intersection[] = []

  sampleHeight(
    tileset: TilesRenderer,
    raycaster: THREE.Raycaster,
    inverseMatrix: THREE.Matrix4,
    localRay: THREE.Ray
  ) {
    const activeTileHit = this.sampleHeightFromActiveTiles(tileset, raycaster, inverseMatrix, localRay)
    if (activeTileHit) return activeTileHit

    this.hits.length = 0
    ;(tileset as RaycastableTilesRenderer).raycast(raycaster, this.hits)
    this.hits.sort((a, b) => a.distance - b.distance)
    const hit = this.hits.find((item) => this.isSurfaceHit(item))
    if (!hit) return null

    return this.toSamplingHit(tileset, hit, 0, inverseMatrix)
  }

  hasRenderableTiles(tileset: TilesRenderer) {
    const renderer = tileset as SamplingTilesRenderer
    return (renderer.activeTiles?.size ?? 0) > 0 || (renderer.visibleTiles?.size ?? 0) > 0
  }

  isLoading(tileset: TilesRenderer) {
    return this.getLoadingSnapshot(tileset).loading
  }

  getLoadingSnapshot(tileset: TilesRenderer): TilesetSamplingSnapshot {
    const renderer = tileset as SamplingTilesRenderer
    const stats = renderer.stats
    const queued = stats?.queued ?? 0
    const downloading = stats?.downloading ?? 0
    const parsing = stats?.parsing ?? 0
    const loadingTiles = renderer.loadingTiles?.size ?? 0
    const downloadQueueRunning = Boolean(renderer.downloadQueue?.running)
    const parseQueueRunning = Boolean(renderer.parseQueue?.running)
    const processNodeQueueRunning = Boolean(renderer.processNodeQueue?.running)
    const loading = Boolean(
      !tileset.root ||
      renderer.isLoading ||
      tileset.loadProgress < 1 ||
      queued > 0 ||
      downloading > 0 ||
      parsing > 0 ||
      downloadQueueRunning ||
      parseQueueRunning ||
      processNodeQueueRunning ||
      loadingTiles > 0
    )

    return {
      loading,
      loadProgress: tileset.loadProgress,
      queued,
      downloading,
      parsing,
      activeTiles: renderer.activeTiles?.size ?? 0,
      visibleTiles: renderer.visibleTiles?.size ?? 0,
      loadingTiles,
      downloadQueueRunning,
      parseQueueRunning,
      processNodeQueueRunning
    }
  }

  isReusableForHeightSampling(tileset: TilesRenderer) {
    // 池复用只保留旧语义：确认没有后台任务仍在跑。
    // 不复用 getLoadingSnapshot()，避免 root/loadProgress 未完成时过度丢弃可复用采样 tileset。
    const renderer = tileset as SamplingTilesRenderer
    return !(
      renderer.isLoading ||
      renderer.downloadQueue?.running ||
      renderer.parseQueue?.running ||
      renderer.processNodeQueue?.running ||
      (renderer.loadingTiles?.size ?? 0) > 0
    )
  }

  getReadinessSummary<T>(
    tileset: TilesRenderer,
    items: readonly T[],
    getLocalRay: (item: T) => THREE.Ray
  ): TilesetSamplingReadinessSummary {
    const renderer = tileset as SamplingTilesRenderer
    const root = renderer.root
    if (!root) {
      return {
        ready: false,
        intersectingRays: 0,
        pendingRays: items.length
      }
    }

    let intersectingRays = 0
    let pendingRays = 0
    items.forEach((item) => {
      // getLocalRay 可能复用同一个 THREE.Ray scratch 对象；readiness 检查必须同步消费。
      const readiness = this.getTileReadiness(root, renderer, getLocalRay(item))
      if (!readiness.intersects) return

      intersectingRays += 1
      if (!readiness.ready) pendingRays += 1
    })

    return {
      ready: pendingRays === 0,
      intersectingRays,
      pendingRays
    }
  }

  private sampleHeightFromActiveTiles(
    tileset: TilesRenderer,
    raycaster: THREE.Raycaster,
    inverseMatrix: THREE.Matrix4,
    localRay: THREE.Ray
  ): TilesetSamplingHit | null {
    const activeTiles = (tileset as unknown as SamplingTilesRenderer).activeTiles as Set<SamplingTile> | undefined
    if (!activeTiles?.size) return null

    let closestHit: TilesetSamplingHit | null = null

    activeTiles.forEach((tile) => {
      const scene = tile.engineData?.scene
      if (!scene) return
      if (!this.tileIntersectsRay(tile, localRay)) return

      this.hits.length = 0
      raycaster.intersectObject(scene, true, this.hits)
      for (const hit of this.hits) {
        if (!this.isSurfaceHit(hit)) continue

        const sampledHit = this.toSamplingHit(tileset, hit, tile.internal?.depth ?? 0, inverseMatrix)
        if (this.isBetterHit(sampledHit, closestHit)) {
          closestHit = sampledHit
        }
        break
      }
    })

    return closestHit
  }

  private toSamplingHit(
    tileset: TilesRenderer,
    hit: THREE.Intersection,
    depth: number,
    inverseMatrix: THREE.Matrix4
  ): TilesetSamplingHit {
    this.samplePoint.copy(hit.point).applyMatrix4(inverseMatrix)
    const cartographic = tileset.ellipsoid.getPositionToCartographic(
      this.samplePoint,
      this.sampleCartographicScratch
    )
    return {
      height: cartographic.height,
      distance: hit.distance,
      depth,
      isTerrain: this.isQuantizedMeshTerrainHit(hit)
    }
  }

  private isBetterHit(candidate: TilesetSamplingHit, current: TilesetSamplingHit | null) {
    if (!current) return true

    // quantized-mesh terrain 采样时，父级 fallback 和子级精细瓦片可能同时 active。
    // terrain 命中优先选更深层瓦片，避免被更近的低精度父瓦片覆盖。
    if (candidate.isTerrain && current.isTerrain && candidate.depth !== current.depth) {
      return candidate.depth > current.depth
    }

    return candidate.distance < current.distance
  }

  private isSurfaceHit(hit: THREE.Intersection) {
    const mesh = hit.object as THREE.Mesh
    const geometry = mesh.geometry

    if (
      !this.isQuantizedMeshTerrainHit(hit) ||
      !geometry ||
      geometry.groups.length === 0 ||
      hit.faceIndex == null
    ) {
      return true
    }

    const surfaceGroup = geometry.groups[0]
    const indexStart = hit.faceIndex * 3
    // quantized-mesh 的第一个 geometry group 是 surface，后续 group 通常是 skirt；高度采样不接受裙边。
    return indexStart >= surfaceGroup.start && indexStart < surfaceGroup.start + surfaceGroup.count
  }

  private isQuantizedMeshTerrainHit(hit: THREE.Intersection) {
    return (
      typeof hit.object.userData.minHeight === 'number' &&
      typeof hit.object.userData.maxHeight === 'number'
    )
  }

  private getTileReadiness(
    tile: SamplingTile,
    renderer: SamplingTilesRenderer,
    ray: THREE.Ray
  ): SamplingTileReadiness {
    if (!this.tileIntersectsRay(tile, ray)) {
      return { intersects: false, ready: true }
    }

    if (!tile.internal || !tile.traversal || !this.isTileDownloadFinished(tile)) {
      return { intersects: true, ready: false }
    }

    if (this.isReadyLeaf(tile, renderer)) {
      return { intersects: true, ready: true }
    }

    const children = tile.children ?? []
    // 子节点 traversal 尚未 preprocess 完成时，继续等待；否则可能过早 raycast 到父级 fallback。
    if (!children[children.length - 1]?.traversal) {
      return { intersects: true, ready: false }
    }

    let childIntersects = false
    for (const child of children) {
      const readiness = this.getTileReadiness(child, renderer, ray)
      childIntersects = childIntersects || readiness.intersects
      if (readiness.intersects && !readiness.ready) {
        return { intersects: true, ready: false }
      }
    }

    return { intersects: true, ready: childIntersects ? true : this.isTileDownloadFinished(tile) }
  }

  private tileIntersectsRay(tile: SamplingTile, ray: THREE.Ray) {
    const boundingVolume = tile.engineData?.boundingVolume
    return boundingVolume ? boundingVolume.intersectsRay(ray) : true
  }

  private isReadyLeaf(tile: SamplingTile, renderer: SamplingTilesRenderer) {
    if (this.isWithinErrorTarget(tile, renderer) && !this.canUnconditionallyRefine(tile)) {
      return true
    }

    if (renderer.maxDepth > 0 && tile.internal && tile.internal.depth + 1 >= renderer.maxDepth) {
      return true
    }

    const children = tile.children ?? []
    return children.length === 0
  }

  private isWithinErrorTarget(tile: SamplingTile, renderer: SamplingTilesRenderer) {
    return (tile.traversal?.error ?? Infinity) <= renderer.errorTarget
  }

  private canUnconditionallyRefine(tile: SamplingTile) {
    return Boolean(tile.internal?.hasUnrenderableContent || (tile.parent && tile.parent.geometricError < tile.geometricError))
  }

  private isTileDownloadFinished(tile: SamplingTile) {
    if (!tile.internal?.hasContent) return true

    return (
      tile.internal.loadingState === TILE_LOADING_STATE_LOADED ||
      tile.internal.loadingState === TILE_LOADING_STATE_FAILED
    )
  }
}
