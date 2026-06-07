import * as THREE from 'three'
import { LoadRegionPlugin, RayRegion } from '3d-tiles-renderer/plugins'
import type { TilesRenderer } from '3d-tiles-renderer'
import { DEG2RAD } from '../constants'
import type { TilesetManager } from '../tiles/TilesetManager'
import type {
  CartographicCoordinateTuple,
  CartographicCoordinates,
  CartographicInput,
  SampleHeightMostDetailedOptions,
  SampleHeightMostDetailedResult,
  SampleHeightOptions
} from '../types'

const DEFAULT_SAMPLE_HEIGHT_MINIMUM_HEIGHT = -10000
const DEFAULT_SAMPLE_HEIGHT_MAXIMUM_HEIGHT = 100000
const DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_RESOLUTION = 256
const DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_MAX_FRAMES = 120
const DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_BATCH_SIZE = 64
const DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_MAX_BATCH_SPAN_DEGREES = 0.25
const DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_REGION_ERROR_TARGET = 0
const TILE_LOADING_STATE_FAILED = -1
const TILE_LOADING_STATE_LOADED = 4

type HeightSamplingLoadRegion = {
  plugin: InstanceType<typeof LoadRegionPlugin>
  region: InstanceType<typeof RayRegion>
}

type RaycastableTilesRenderer = TilesRenderer & {
  raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void
}

type HeightSamplingTile = {
  geometricError: number
  refine?: 'REPLACE' | 'ADD'
  parent?: HeightSamplingTile | null
  children?: HeightSamplingTile[]
  engineData?: {
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

type HeightSamplingTilesRenderer = TilesRenderer & {
  root: HeightSamplingTile | null
  errorTarget: number
  maxDepth: number
}

type HeightSamplingReadiness = {
  intersects: boolean
  ready: boolean
}

type HeightSamplingTask = {
  index: number
  position: CartographicCoordinateTuple
  ray: THREE.Ray
  raycaster: THREE.Raycaster
  origin: THREE.Vector3
  direction: THREE.Vector3
  surfacePoint: THREE.Vector3
}

export class HeightSampler {
  private readonly sampleRaycaster = new THREE.Raycaster()
  private readonly sampleRay = new THREE.Ray()
  private readonly sampleSurfacePoint = new THREE.Vector3()
  private readonly sampleOrigin = new THREE.Vector3()
  private readonly sampleDirection = new THREE.Vector3()
  private readonly samplePoint = new THREE.Vector3()
  private readonly sampleMatrix = new THREE.Matrix4()
  private readonly sampleTilesetRay = new THREE.Ray()
  private readonly sampleTilesetRayOrigin = new THREE.Vector3()
  private readonly sampleTilesetRayTarget = new THREE.Vector3()
  private readonly sampleTarget = new THREE.Vector3()
  private readonly sampleOffscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1)
  private readonly sampleCartographicScratch = { lat: 0, lon: 0, height: 0 }
  private readonly heightSamplingLoadRegionPlugins = new WeakMap<TilesRenderer, InstanceType<typeof LoadRegionPlugin>>()

  constructor(
    private readonly tilesets: TilesetManager,
    private readonly resolveCartographicInput: (input: CartographicInput) => CartographicCoordinates
  ) {}

  sampleHeight(position: CartographicInput, options: SampleHeightOptions = {}) {
    return this.sampleHeightFromLoadedTiles(position, options)
  }

  async sampleHeightMostDetailed(
    positions: CartographicCoordinateTuple[],
    options: SampleHeightMostDetailedOptions = {}
  ): Promise<SampleHeightMostDetailedResult[]> {
    const results: SampleHeightMostDetailedResult[] = new Array(positions.length).fill(undefined)
    if (positions.length === 0) return results

    const tilesets = this.getHeightSamplingTilesets(options.source)
    const offscreenTilesets = tilesets.filter((tileset) => tileset !== this.tilesets.surfaceTileset)
    if (offscreenTilesets.length === 0) {
      positions.forEach((position, index) => {
        const height = this.sampleHeightFromLoadedTiles(position, options)
        results[index] = height === undefined ? undefined : [position[0], position[1], height]
      })
      return results
    }

    const tasks = positions.map((position, index) => this.createHeightSamplingTask(position, index, options))
    const batches = this.createHeightSamplingBatches(tasks)
    const maxFrames = Math.max(0, options.maxFrames ?? DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_MAX_FRAMES)

    for (const batch of batches) {
      await this.sampleHeightMostDetailedBatch(batch, options, offscreenTilesets, maxFrames, results)
    }

    return results
  }

  private sampleHeightFromLoadedTiles(input: CartographicInput, options: SampleHeightOptions) {
    this.configureSampleRay(input, options)
    const tilesets = this.getHeightSamplingTilesets(options.source)
    let closestHit: { height: number; distance: number } | null = null

    for (const tileset of tilesets) {
      if (!tileset.group.visible) continue

      const hit = this.sampleHeightFromTileset(tileset, this.sampleRaycaster)
      if (hit && (!closestHit || hit.distance < closestHit.distance)) {
        closestHit = hit
      }
    }

    return closestHit?.height
  }

  private sampleHeightFromLoadedTilesForTask(task: HeightSamplingTask, options: SampleHeightOptions) {
    const tilesets = this.getHeightSamplingTilesets(options.source)
    let closestHit: { height: number; distance: number } | null = null

    for (const tileset of tilesets) {
      if (!tileset.group.visible) continue

      const hit = this.sampleHeightFromTileset(tileset, task.raycaster)
      if (hit && (!closestHit || hit.distance < closestHit.distance)) {
        closestHit = hit
      }
    }

    return closestHit?.height
  }

  private createHeightSamplingTask(
    position: CartographicCoordinateTuple,
    index: number,
    options: SampleHeightOptions
  ): HeightSamplingTask {
    const minimumHeight = options.minimumHeight ?? DEFAULT_SAMPLE_HEIGHT_MINIMUM_HEIGHT
    const maximumHeight = options.maximumHeight ?? DEFAULT_SAMPLE_HEIGHT_MAXIMUM_HEIGHT
    const ellipsoid = this.tilesets.tileset.ellipsoid
    const surfacePoint = new THREE.Vector3()
    const direction = new THREE.Vector3()

    ellipsoid.getCartographicToPosition(
      position[1] * DEG2RAD,
      position[0] * DEG2RAD,
      0,
      surfacePoint
    )
    ellipsoid.getCartographicToNormal(
      position[1] * DEG2RAD,
      position[0] * DEG2RAD,
      direction
    )

    const origin = surfacePoint.clone().addScaledVector(direction, maximumHeight)
    const rayDirection = direction.clone().multiplyScalar(-1).normalize()
    const ray = new THREE.Ray(origin.clone(), rayDirection)
    const raycaster = new THREE.Raycaster(origin, rayDirection, 0, Math.max(maximumHeight - minimumHeight, 0))

    return {
      index,
      position,
      ray,
      raycaster,
      origin,
      direction,
      surfacePoint
    }
  }

  private configureSampleRay(input: CartographicInput, options: SampleHeightOptions) {
    const cartographic = this.resolveCartographicInput(input)
    const minimumHeight = options.minimumHeight ?? DEFAULT_SAMPLE_HEIGHT_MINIMUM_HEIGHT
    const maximumHeight = options.maximumHeight ?? DEFAULT_SAMPLE_HEIGHT_MAXIMUM_HEIGHT
    const ellipsoid = this.tilesets.tileset.ellipsoid

    ellipsoid.getCartographicToPosition(
      cartographic.latitude * DEG2RAD,
      cartographic.longitude * DEG2RAD,
      0,
      this.sampleSurfacePoint
    )
    ellipsoid.getCartographicToNormal(
      cartographic.latitude * DEG2RAD,
      cartographic.longitude * DEG2RAD,
      this.sampleDirection
    )

    this.sampleOrigin.copy(this.sampleSurfacePoint).addScaledVector(this.sampleDirection, maximumHeight)
    this.sampleRay.origin.copy(this.sampleOrigin)
    this.sampleRay.direction.copy(this.sampleDirection).multiplyScalar(-1).normalize()
    this.sampleRaycaster.ray.copy(this.sampleRay)
    this.sampleRaycaster.near = 0
    this.sampleRaycaster.far = Math.max(maximumHeight - minimumHeight, 0)
  }

  private createHeightSamplingBatches(tasks: HeightSamplingTask[]) {
    const batches: HeightSamplingTask[][] = []
    const maxBatchSize = DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_BATCH_SIZE
    const maxSpan = DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_MAX_BATCH_SPAN_DEGREES
    const sortedTasks = tasks.slice().sort((a, b) => {
      const latitudeDelta = a.position[1] - b.position[1]
      return latitudeDelta === 0 ? a.position[0] - b.position[0] : latitudeDelta
    })
    let batch: HeightSamplingTask[] = []
    let minLongitude = Infinity
    let maxLongitude = -Infinity
    let minLatitude = Infinity
    let maxLatitude = -Infinity

    const flushBatch = () => {
      if (batch.length > 0) {
        batches.push(batch)
        batch = []
        minLongitude = Infinity
        maxLongitude = -Infinity
        minLatitude = Infinity
        maxLatitude = -Infinity
      }
    }

    sortedTasks.forEach((task) => {
      const nextMinLongitude = Math.min(minLongitude, task.position[0])
      const nextMaxLongitude = Math.max(maxLongitude, task.position[0])
      const nextMinLatitude = Math.min(minLatitude, task.position[1])
      const nextMaxLatitude = Math.max(maxLatitude, task.position[1])
      const exceedsSpan =
        batch.length > 0 &&
        (
          nextMaxLongitude - nextMinLongitude > maxSpan ||
          nextMaxLatitude - nextMinLatitude > maxSpan
        )
      const exceedsSize = batch.length >= maxBatchSize

      if (exceedsSpan || exceedsSize) {
        flushBatch()
      }

      batch.push(task)
      minLongitude = Math.min(minLongitude, task.position[0])
      maxLongitude = Math.max(maxLongitude, task.position[0])
      minLatitude = Math.min(minLatitude, task.position[1])
      maxLatitude = Math.max(maxLatitude, task.position[1])
    })
    flushBatch()

    return batches
  }

  private configureSampleOffscreenCamera(tasks: HeightSamplingTask[], options: SampleHeightMostDetailedOptions) {
    const minimumHeight = options.minimumHeight ?? DEFAULT_SAMPLE_HEIGHT_MINIMUM_HEIGHT
    const maximumHeight = options.maximumHeight ?? DEFAULT_SAMPLE_HEIGHT_MAXIMUM_HEIGHT
    const heightRange = Math.max(maximumHeight - minimumHeight, 1)
    const camera = this.sampleOffscreenCamera
    const center = this.sampleSurfacePoint.set(0, 0, 0)
    const up = this.sampleDirection.set(0, 0, 0)
    const cameraOrigin = this.sampleOrigin.set(0, 0, 0)
    const bounds = new THREE.Box3()

    tasks.forEach((task) => {
      center.add(task.surfacePoint)
      up.add(task.direction)
    })
    center.divideScalar(tasks.length)
    up.normalize()
    if (up.lengthSq() === 0) {
      up.copy(tasks[0].direction)
    }
    cameraOrigin.copy(center).addScaledVector(up, maximumHeight)

    camera.near = Math.max(0.1, heightRange / 1000000)
    camera.far = heightRange
    camera.position.copy(cameraOrigin)
    this.sampleTarget.copy(cameraOrigin).addScaledVector(up, -1)
    camera.up.set(0, 1, 0)
    if (Math.abs(camera.up.dot(up)) > 0.99) camera.up.set(1, 0, 0)
    camera.lookAt(this.sampleTarget)
    camera.updateMatrixWorld(true)

    tasks.forEach((task) => {
      this.samplePoint.copy(task.surfacePoint).applyMatrix4(camera.matrixWorldInverse)
      bounds.expandByPoint(this.samplePoint)
    })

    const padding = Math.max(1, Math.sqrt(heightRange))
    camera.left = bounds.min.x - padding
    camera.right = bounds.max.x + padding
    camera.top = bounds.max.y + padding
    camera.bottom = bounds.min.y - padding
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)
    return camera
  }

  private getHeightSamplingTilesets(source: SampleHeightOptions['source'] = 'all') {
    if (source === 'terrain') {
      return [this.tilesets.terrainTileset ?? this.tilesets.surfaceTileset]
    }

    if (source === 'tileset') {
      return this.tilesets.loadedSceneTilesets.filter((tileset) => tileset.group.visible)
    }

    return [
      ...this.tilesets.loadedSceneTilesets.filter((tileset) => tileset.group.visible),
      this.tilesets.terrainTileset ?? this.tilesets.surfaceTileset
    ]
  }

  private sampleHeightFromTileset(tileset: TilesRenderer, raycaster: THREE.Raycaster) {
    tileset.group.updateMatrixWorld(true)
    const hits: THREE.Intersection[] = []
    ;(tileset as RaycastableTilesRenderer).raycast(raycaster, hits)
    hits.sort((a, b) => a.distance - b.distance)
    const hit = hits.find((item) => this.isSampleHeightSurfaceHit(item))
    if (!hit) return null

    this.sampleMatrix.copy(tileset.group.matrixWorld).invert()
    this.samplePoint.copy(hit.point).applyMatrix4(this.sampleMatrix)
    const cartographic = tileset.ellipsoid.getPositionToCartographic(this.samplePoint, this.sampleCartographicScratch)
    return {
      height: cartographic.height,
      distance: hit.distance
    }
  }

  private isSampleHeightSurfaceHit(hit: THREE.Intersection) {
    const mesh = hit.object as THREE.Mesh
    const geometry = mesh.geometry
    const isQuantizedMeshTerrain =
      typeof hit.object.userData.minHeight === 'number' &&
      typeof hit.object.userData.maxHeight === 'number'

    if (
      !isQuantizedMeshTerrain ||
      !geometry ||
      geometry.groups.length === 0 ||
      hit.faceIndex == null
    ) {
      return true
    }

    const surfaceGroup = geometry.groups[0]
    const indexStart = hit.faceIndex * 3
    return indexStart >= surfaceGroup.start && indexStart < surfaceGroup.start + surfaceGroup.count
  }

  private async sampleHeightMostDetailedBatch(
    tasks: HeightSamplingTask[],
    options: SampleHeightMostDetailedOptions,
    tilesets: TilesRenderer[],
    maxFrames: number,
    results: SampleHeightMostDetailedResult[]
  ) {
    const camera = this.configureSampleOffscreenCamera(tasks, options)
    const resolution = Math.max(1, options.resolution ?? DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_RESOLUTION)
    const loadRegions = tilesets.flatMap((tileset) => this.addHeightSamplingLoadRegions(tileset, tasks))

    tilesets.forEach((tileset) => {
      tileset.setCamera(camera)
      tileset.setResolution(camera, resolution, resolution)
    })

    try {
      await this.updateHeightSamplingTilesets(tasks, options, tilesets, maxFrames, results)
    } finally {
      loadRegions.forEach((loadRegion) => {
        loadRegion.plugin.removeRegion(loadRegion.region)
      })
      tilesets.forEach((tileset) => {
        tileset.deleteCamera(camera)
      })
    }

    tasks.forEach((task) => {
      if (results[task.index] !== undefined) return

      const height = this.sampleHeightFromLoadedTilesForTask(task, options)
      results[task.index] = height === undefined ? undefined : [task.position[0], task.position[1], height]
    })
  }

  private addHeightSamplingLoadRegions(tileset: TilesRenderer, tasks: HeightSamplingTask[]): HeightSamplingLoadRegion[] {
    const plugin = this.getHeightSamplingLoadRegionPlugin(tileset)
    return tasks.map((task) => {
      const region = new RayRegion({
        ray: this.getHeightSamplingRayInTilesetFrame(tileset, task.ray),
        errorTarget: DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_REGION_ERROR_TARGET,
        mask: true
      })

      plugin.addRegion(region)
      return { plugin, region }
    })
  }

  private getHeightSamplingLoadRegionPlugin(tileset: TilesRenderer) {
    const cachedPlugin = this.heightSamplingLoadRegionPlugins.get(tileset)
    if (cachedPlugin) return cachedPlugin

    const existingPlugin = tileset.getPluginByName('LOAD_REGION_PLUGIN')
    if (existingPlugin instanceof LoadRegionPlugin) {
      this.heightSamplingLoadRegionPlugins.set(tileset, existingPlugin)
      return existingPlugin
    }

    const plugin = new LoadRegionPlugin()
    tileset.registerPlugin(plugin)
    this.heightSamplingLoadRegionPlugins.set(tileset, plugin)
    return plugin
  }

  private getHeightSamplingRayInTilesetFrame(tileset: TilesRenderer, ray: THREE.Ray) {
    tileset.group.updateMatrixWorld(true)
    this.sampleMatrix.copy(tileset.group.matrixWorld).invert()
    this.sampleTilesetRayOrigin.copy(ray.origin).applyMatrix4(this.sampleMatrix)
    this.sampleTilesetRayTarget
      .copy(ray.origin)
      .add(ray.direction)
      .applyMatrix4(this.sampleMatrix)

    this.sampleTilesetRay.direction
      .copy(this.sampleTilesetRayTarget)
      .sub(this.sampleTilesetRayOrigin)
      .normalize()
    this.sampleTilesetRay.origin.copy(this.sampleTilesetRayOrigin)
    return this.sampleTilesetRay
  }

  private async updateHeightSamplingTilesets(
    tasks: HeightSamplingTask[],
    options: SampleHeightMostDetailedOptions,
    tilesets: TilesRenderer[],
    maxFrames: number,
    results: SampleHeightMostDetailedResult[]
  ) {
    let stableFrames = 0

    for (let frame = 0; frame < maxFrames; frame += 1) {
      let loading = false
      for (const tileset of tilesets) {
        tileset.update()
        loading = this.isTilesetLoading(tileset) || loading
      }
      const hasRenderableTiles = tilesets.some((tileset) => this.hasTilesetRenderableTiles(tileset))
      const isMostDetailed = tilesets.every((tileset) => this.isHeightSamplingBatchMostDetailed(tileset, tasks))

      this.sampleHeightTasksFromLoadedTiles(tasks, options, results)

      if (!loading && hasRenderableTiles && isMostDetailed) {
        stableFrames += 1
        if (stableFrames >= 2) {
          return
        }
      } else {
        stableFrames = 0
      }

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    }
  }

  private sampleHeightTasksFromLoadedTiles(
    tasks: HeightSamplingTask[],
    options: SampleHeightOptions,
    results: SampleHeightMostDetailedResult[]
  ) {
    tasks.forEach((task) => {
      const height = this.sampleHeightFromLoadedTilesForTask(task, options)
      if (height !== undefined) {
        results[task.index] = [task.position[0], task.position[1], height]
      }
    })
  }

  private hasTilesetRenderableTiles(tileset: TilesRenderer) {
    const renderer = tileset as TilesRenderer & {
      activeTiles?: Set<unknown>
      visibleTiles?: Set<unknown>
    }

    return (renderer.activeTiles?.size ?? 0) > 0 || (renderer.visibleTiles?.size ?? 0) > 0
  }

  private isHeightSamplingBatchMostDetailed(tileset: TilesRenderer, tasks: HeightSamplingTask[]) {
    const renderer = tileset as HeightSamplingTilesRenderer
    const root = renderer.root
    if (!root) return false

    return tasks.every((task) => {
      const ray = this.getHeightSamplingRayInTilesetFrame(tileset, task.ray)
      const readiness = this.getHeightSamplingTileReadiness(root, renderer, ray)
      return readiness.intersects ? readiness.ready : true
    })
  }

  private getHeightSamplingTileReadiness(
    tile: HeightSamplingTile,
    renderer: HeightSamplingTilesRenderer,
    ray: THREE.Ray
  ): HeightSamplingReadiness {
    if (!this.heightSamplingTileIntersectsRay(tile, ray)) {
      return { intersects: false, ready: true }
    }

    if (!tile.internal || !tile.traversal || !this.isHeightSamplingTileDownloadFinished(tile)) {
      return { intersects: true, ready: false }
    }

    if (!this.canHeightSamplingTileTraverse(tile, renderer)) {
      return { intersects: true, ready: true }
    }

    const children = tile.children ?? []
    if (children.length === 0) {
      return { intersects: true, ready: true }
    }

    let childIntersects = false
    for (const child of children) {
      const readiness = this.getHeightSamplingTileReadiness(child, renderer, ray)
      childIntersects = childIntersects || readiness.intersects
      if (readiness.intersects && !readiness.ready) {
        return { intersects: true, ready: false }
      }
    }

    return { intersects: true, ready: childIntersects ? true : this.isHeightSamplingTileDownloadFinished(tile) }
  }

  private heightSamplingTileIntersectsRay(tile: HeightSamplingTile, ray: THREE.Ray) {
    const boundingVolume = tile.engineData?.boundingVolume
    return boundingVolume ? boundingVolume.intersectsRay(ray) : true
  }

  private canHeightSamplingTileTraverse(tile: HeightSamplingTile, renderer: HeightSamplingTilesRenderer) {
    if (this.isHeightSamplingTileWithinErrorTarget(tile, renderer) && !this.canHeightSamplingTileUnconditionallyRefine(tile)) {
      return false
    }

    if (renderer.maxDepth > 0 && tile.internal && tile.internal.depth + 1 >= renderer.maxDepth) {
      return false
    }

    const children = tile.children ?? []
    return children.length === 0 || Boolean(children[children.length - 1]?.traversal)
  }

  private isHeightSamplingTileWithinErrorTarget(tile: HeightSamplingTile, renderer: HeightSamplingTilesRenderer) {
    return (tile.traversal?.error ?? Infinity) <= renderer.errorTarget
  }

  private canHeightSamplingTileUnconditionallyRefine(tile: HeightSamplingTile) {
    return Boolean(tile.internal?.hasUnrenderableContent || (tile.parent && tile.parent.geometricError < tile.geometricError))
  }

  private isHeightSamplingTileDownloadFinished(tile: HeightSamplingTile) {
    if (!tile.internal?.hasContent) return true

    return (
      tile.internal.loadingState === TILE_LOADING_STATE_LOADED ||
      tile.internal.loadingState === TILE_LOADING_STATE_FAILED
    )
  }

  private isTilesetLoading(tileset: TilesRenderer) {
    const renderer = tileset as TilesRenderer & {
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

    const stats = renderer.stats
    return Boolean(
      !tileset.root ||
      renderer.isLoading ||
      tileset.loadProgress < 1 ||
      (stats?.queued ?? 0) > 0 ||
      (stats?.downloading ?? 0) > 0 ||
      (stats?.parsing ?? 0) > 0 ||
      renderer.downloadQueue?.running ||
      renderer.parseQueue?.running ||
      renderer.processNodeQueue?.running ||
      (renderer.loadingTiles?.size ?? 0) > 0
    )
  }
}
