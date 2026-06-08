import * as THREE from 'three'
import { LoadRegionPlugin, RayRegion } from '3d-tiles-renderer/plugins'
import type { TilesRenderer } from '3d-tiles-renderer'
import { DEG2RAD } from '../constants'
import type { HeightSamplingTilesetEntry, TilesetManager } from '../tiles/TilesetManager'
import type {
  CartographicCoordinateTuple,
  CartographicCoordinates,
  CartographicInput,
  SampleHeightMostDetailedDebugOptions,
  SampleHeightMostDetailedOptions,
  SampleHeightMostDetailedResult,
  SampleHeightOptions
} from '../types'
import { QuantizedMeshTerrainSampler } from './QuantizedMeshTerrainSampler'

const DEFAULT_SAMPLE_HEIGHT_MINIMUM_HEIGHT = -10000
const DEFAULT_SAMPLE_HEIGHT_MAXIMUM_HEIGHT = 100000
const DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_RESOLUTION = 256
const DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_MAX_FRAMES = 120
const DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_MAX_PASSES_PER_FRAME = 1
const DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_BATCH_SIZE = 8
const DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_SCENE_REGION_BATCH_SIZE = 64
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

type HeightSamplingHit = {
  height: number
  distance: number
  depth: number
  isTerrain: boolean
}

type HeightSamplingTile = {
  geometricError: number
  refine?: 'REPLACE' | 'ADD'
  parent?: HeightSamplingTile | null
  children?: HeightSamplingTile[]
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

type HeightSamplingTilesRenderer = TilesRenderer & {
  root: HeightSamplingTile | null
  errorTarget: number
  maxDepth: number
  activeTiles?: Set<HeightSamplingTile>
}

type HeightSamplingReadiness = {
  intersects: boolean
  ready: boolean
}

type HeightSamplingReadinessSummary = {
  ready: boolean
  intersectingRays: number
  pendingRays: number
}

type HeightSamplingTilesetSnapshot = {
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

type HeightSamplingTask = {
  index: number
  position: CartographicCoordinateTuple
  ray: THREE.Ray
  raycaster: THREE.Raycaster
  origin: THREE.Vector3
  direction: THREE.Vector3
  surfacePoint: THREE.Vector3
}

type HeightSamplingBatchState = {
  tasks: HeightSamplingTask[]
  camera: THREE.OrthographicCamera | null
  loadRegions: HeightSamplingLoadRegion[]
  startedAt: number
  frames: number
  stableFrames: number
}

type ResolvedHeightSamplingDebugOptions = Required<SampleHeightMostDetailedDebugOptions>

type HeightSamplingDebugState = {
  options: ResolvedHeightSamplingDebugOptions
  startedAt: number
  positions: number
  batches: number
  route: string
}

type HeightSamplingJob = {
  options: SampleHeightMostDetailedOptions
  results: SampleHeightMostDetailedResult[]
  batches: HeightSamplingTask[][]
  currentBatchIndex: number
  maxFrames: number
  entries: HeightSamplingTilesetEntry[]
  activeBatch: HeightSamplingBatchState | null
  debug: HeightSamplingDebugState | null
  resolve: (results: SampleHeightMostDetailedResult[]) => void
}

export class HeightSampler {
  private readonly sampleRaycaster = new THREE.Raycaster()
  private readonly sampleRay = new THREE.Ray()
  private readonly sampleSurfacePoint = new THREE.Vector3()
  private readonly sampleOrigin = new THREE.Vector3()
  private readonly sampleDirection = new THREE.Vector3()
  private readonly samplePoint = new THREE.Vector3()
  private readonly sampleMatrix = new THREE.Matrix4()
  private readonly sampleLocalRay = new THREE.Ray()
  private readonly sampleTilesetRay = new THREE.Ray()
  private readonly sampleTilesetRayOrigin = new THREE.Vector3()
  private readonly sampleTilesetRayTarget = new THREE.Vector3()
  private readonly sampleTarget = new THREE.Vector3()
  private readonly sampleCartographicScratch = { lat: 0, lon: 0, height: 0 }
  private readonly terrainSampler = new QuantizedMeshTerrainSampler()
  private readonly heightSamplingLoadRegionPlugins = new WeakMap<TilesRenderer, InstanceType<typeof LoadRegionPlugin>>()
  private readonly heightSamplingJobs: HeightSamplingJob[] = []
  private heightSamplingJobCursor = 0

  get hasPendingMostDetailedSampling() {
    return this.heightSamplingJobs.length > 0
  }

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
    if (positions.length === 0) return []

    const hybridResults = await this.sampleAllMostDetailedHybrid(positions, options)
    if (hybridResults) return hybridResults

    if (options.source === 'terrain' || this.canUseDirectTerrainOnlySampling(options.source)) {
      const terrainResults = await this.sampleTerrainMostDetailedDirect(positions)
      if (terrainResults) return terrainResults
    }

    const entries = this.createMostDetailedSamplingEntries(options.source)
    return this.sampleHeightMostDetailedFromEntries(positions, options, entries)
  }

  private sampleHeightMostDetailedFromEntries(
    positions: CartographicCoordinateTuple[],
    options: SampleHeightMostDetailedOptions,
    entries: HeightSamplingTilesetEntry[]
  ): Promise<SampleHeightMostDetailedResult[]> | SampleHeightMostDetailedResult[] {
    const results: SampleHeightMostDetailedResult[] = new Array(positions.length).fill(undefined)
    if (entries.length === 0) {
      positions.forEach((position, index) => {
        const height = this.sampleHeightFromLoadedTiles(position, options)
        results[index] = height === undefined ? undefined : [position[0], position[1], height]
      })
      return results
    }

    const tasks = positions.map((position, index) => this.createHeightSamplingTask(position, index, options))
    const batches = this.createHeightSamplingBatches(tasks, entries)
    const maxFrames = Math.max(0, options.maxFrames ?? DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_MAX_FRAMES)
    const debug = this.createHeightSamplingDebugState(options.debug, positions.length, batches.length, entries)

    return new Promise<SampleHeightMostDetailedResult[]>((resolve) => {
      this.heightSamplingJobs.push({
        options,
        results,
        batches,
        currentBatchIndex: 0,
        maxFrames,
        entries,
        activeBatch: null,
        debug,
        resolve
      })
    })
  }

  private async sampleAllMostDetailedHybrid(
    positions: CartographicCoordinateTuple[],
    options: SampleHeightMostDetailedOptions
  ) {
    if (options.source !== undefined && options.source !== 'all') return null
    if (!this.tilesets.terrainOptions || !this.tilesets.terrainTileset) return null

    const tilesetEntries = this.tilesets.createSceneRegionHeightSamplingTilesets('tileset')
    if (tilesetEntries.length === 0) return null

    const terrainPromise = this.sampleTerrainMostDetailedDirect(positions)
    const tilesetResults = await this.sampleHeightMostDetailedFromEntries(
      positions,
      { ...options, source: 'tileset' },
      tilesetEntries
    )
    const terrainResults = await terrainPromise
    if (!terrainResults) return null

    return this.mergeMostDetailedTerrainAndTilesetResults(positions, terrainResults, tilesetResults)
  }

  private mergeMostDetailedTerrainAndTilesetResults(
    positions: CartographicCoordinateTuple[],
    terrainResults: SampleHeightMostDetailedResult[],
    tilesetResults: SampleHeightMostDetailedResult[]
  ) {
    return positions.map((position, index) => {
      const tilesetResult = tilesetResults[index]
      const terrainResult = terrainResults[index]
      if (!terrainResult) return tilesetResult
      if (!tilesetResult) return terrainResult

      return tilesetResult[2] >= terrainResult[2] ? tilesetResult : terrainResult
    })
  }

  updateMostDetailedSampling(maxPasses = DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_MAX_PASSES_PER_FRAME) {
    const passCount = Math.max(0, maxPasses)
    for (let pass = 0; pass < passCount && this.heightSamplingJobs.length > 0; pass += 1) {
      if (this.heightSamplingJobCursor >= this.heightSamplingJobs.length) {
        this.heightSamplingJobCursor = 0
      }

      const job = this.heightSamplingJobs[this.heightSamplingJobCursor]
      const isComplete = this.updateHeightSamplingJob(job)
      if (!isComplete && this.heightSamplingJobs[this.heightSamplingJobCursor] === job) {
        this.heightSamplingJobCursor += 1
      }
    }

    return this.hasPendingMostDetailedSampling
  }

  dispose() {
    while (this.heightSamplingJobs.length > 0) {
      this.cancelHeightSamplingJob(this.heightSamplingJobs[0])
    }
    this.terrainSampler.clear()
  }

  private async sampleTerrainMostDetailedDirect(positions: CartographicCoordinateTuple[]) {
    const terrain = this.tilesets.terrainOptions
    if (!terrain || !this.tilesets.terrainTileset) return null

    try {
      return await this.terrainSampler.sampleMostDetailed(terrain, positions)
    } catch (error) {
      console.warn('Tellux height sampler: direct terrain sampling failed; falling back to tiles renderer sampling.', error)
      return null
    }
  }

  private canUseDirectTerrainOnlySampling(source: SampleHeightMostDetailedOptions['source']) {
    if (source !== undefined && source !== 'all') return false

    return this.tilesets.loadedSceneTilesets.every((tileset) => !tileset.group.visible)
  }

  private createMostDetailedSamplingEntries(source: SampleHeightMostDetailedOptions['source']) {
    if (source !== 'terrain') {
      const sceneRegionEntries = this.tilesets.createSceneRegionHeightSamplingTilesets(source)
      if (sceneRegionEntries.length > 0) return sceneRegionEntries
    }

    return this.tilesets.createHeightSamplingTilesets(source)
  }

  private createHeightSamplingDebugState(
    debug: SampleHeightMostDetailedOptions['debug'],
    positions: number,
    batches: number,
    entries: HeightSamplingTilesetEntry[]
  ): HeightSamplingDebugState | null {
    if (!debug) return null

    const options = this.resolveHeightSamplingDebugOptions(debug)
    const route = entries.every((entry) => entry.useSamplingCamera === false)
      ? 'scene-region'
      : 'sampling-tileset'
    const state = {
      options,
      startedAt: performance.now(),
      positions,
      batches,
      route
    }

    console.info(`${options.label}: started`, {
      positions,
      batches,
      route,
      entries: entries.map((entry) => this.getHeightSamplingEntryDebugInfo(entry))
    })
    return state
  }

  private resolveHeightSamplingDebugOptions(
    debug: true | SampleHeightMostDetailedDebugOptions
  ): ResolvedHeightSamplingDebugOptions {
    const options = debug === true ? {} : debug
    return {
      label: options.label ?? '[Tellux] sampleHeightMostDetailed',
      logBatches: options.logBatches ?? true,
      batchInterval: Math.max(1, options.batchInterval ?? 1),
      slowBatchMilliseconds: Math.max(0, options.slowBatchMilliseconds ?? 500)
    }
  }

  private getHeightSamplingEntryDebugInfo(entry: HeightSamplingTilesetEntry) {
    return {
      mode: entry.useSamplingCamera === false ? 'scene-region' : 'sampling-tileset',
      regionMask: entry.regionMask ?? true,
      isTerrain: entry.source === this.tilesets.terrainTileset,
      visible: entry.source.group.visible,
      sameAsSource: entry.source === entry.tileset
    }
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

  private createHeightSamplingBatches(tasks: HeightSamplingTask[], entries: HeightSamplingTilesetEntry[]) {
    const batches: HeightSamplingTask[][] = []
    const maxBatchSize = this.isSceneRegionSamplingEntries(entries)
      ? DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_SCENE_REGION_BATCH_SIZE
      : DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_BATCH_SIZE
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

  private isSceneRegionSamplingEntries(entries: HeightSamplingTilesetEntry[]) {
    return entries.length > 0 && entries.every((entry) => entry.useSamplingCamera === false)
  }

  private configureSampleOffscreenCamera(tasks: HeightSamplingTask[], options: SampleHeightMostDetailedOptions) {
    const minimumHeight = options.minimumHeight ?? DEFAULT_SAMPLE_HEIGHT_MINIMUM_HEIGHT
    const maximumHeight = options.maximumHeight ?? DEFAULT_SAMPLE_HEIGHT_MAXIMUM_HEIGHT
    const heightRange = Math.max(maximumHeight - minimumHeight, 1)
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1)
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
    this.sampleMatrix.copy(tileset.group.matrixWorld).invert()
    this.sampleLocalRay.copy(raycaster.ray).applyMatrix4(this.sampleMatrix)

    const activeTileHit = this.sampleHeightFromActiveTiles(tileset, raycaster, this.sampleMatrix, this.sampleLocalRay)
    if (activeTileHit) return activeTileHit

    const hits: THREE.Intersection[] = []
    ;(tileset as RaycastableTilesRenderer).raycast(raycaster, hits)
    hits.sort((a, b) => a.distance - b.distance)
    const hit = hits.find((item) => this.isSampleHeightSurfaceHit(item))
    if (!hit) return null

    return this.toHeightSamplingHit(tileset, hit, 0, this.sampleMatrix)
  }

  private sampleHeightFromActiveTiles(
    tileset: TilesRenderer,
    raycaster: THREE.Raycaster,
    inverseMatrix: THREE.Matrix4,
    localRay: THREE.Ray
  ): HeightSamplingHit | null {
    const renderer = tileset as HeightSamplingTilesRenderer
    const activeTiles = renderer.activeTiles as unknown as Set<HeightSamplingTile> | undefined
    if (!activeTiles?.size) return null

    let closestHit: HeightSamplingHit | null = null
    const hits: THREE.Intersection[] = []

    activeTiles.forEach((tile) => {
      const scene = tile.engineData?.scene
      if (!scene) return
      if (!this.heightSamplingTileIntersectsRay(tile, localRay)) return

      hits.length = 0
      raycaster.intersectObject(scene, true, hits)
      for (const hit of hits) {
        if (!this.isSampleHeightSurfaceHit(hit)) continue

        const sampledHit = this.toHeightSamplingHit(tileset, hit, tile.internal?.depth ?? 0, inverseMatrix)
        if (this.isBetterHeightSamplingHit(sampledHit, closestHit)) {
          closestHit = sampledHit
        }
        break
      }
    })

    return closestHit
  }

  private toHeightSamplingHit(
    tileset: TilesRenderer,
    hit: THREE.Intersection,
    depth: number,
    inverseMatrix: THREE.Matrix4
  ): HeightSamplingHit {
    this.samplePoint.copy(hit.point).applyMatrix4(inverseMatrix)
    const cartographic = tileset.ellipsoid.getPositionToCartographic(this.samplePoint, this.sampleCartographicScratch)
    return {
      height: cartographic.height,
      distance: hit.distance,
      depth,
      isTerrain: this.isQuantizedMeshTerrainHit(hit)
    }
  }

  private isBetterHeightSamplingHit(candidate: HeightSamplingHit, current: HeightSamplingHit | null) {
    if (!current) return true

    if (candidate.isTerrain && current.isTerrain && candidate.depth !== current.depth) {
      return candidate.depth > current.depth
    }

    return candidate.distance < current.distance
  }

  private isSampleHeightSurfaceHit(hit: THREE.Intersection) {
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
    return indexStart >= surfaceGroup.start && indexStart < surfaceGroup.start + surfaceGroup.count
  }

  private isQuantizedMeshTerrainHit(hit: THREE.Intersection) {
    return (
      typeof hit.object.userData.minHeight === 'number' &&
      typeof hit.object.userData.maxHeight === 'number'
    )
  }

  private addHeightSamplingLoadRegions(
    tileset: TilesRenderer,
    tasks: HeightSamplingTask[],
    mask: boolean
  ): HeightSamplingLoadRegion[] {
    const plugin = this.getHeightSamplingLoadRegionPlugin(tileset)
    return tasks.map((task) => {
      const region = new RayRegion({
        ray: this.getHeightSamplingRayInTilesetFrame(tileset, task.ray),
        errorTarget: DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_REGION_ERROR_TARGET,
        mask
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

  private updateHeightSamplingJob(job: HeightSamplingJob) {
    if (!job.activeBatch) {
      this.beginHeightSamplingBatch(job)
    }

    const batch = job.activeBatch
    if (!batch) {
      return this.finishHeightSamplingJob(job)
    }

    if (batch.frames >= job.maxFrames) {
      this.completeHeightSamplingBatch(job)
      return job.currentBatchIndex >= job.batches.length
        ? this.finishHeightSamplingJob(job)
        : false
    }

    const snapshots: HeightSamplingTilesetSnapshot[] = []
    let loading = false
    for (const entry of job.entries) {
      entry.tileset.update()
      if (job.debug) {
        const snapshot = this.getTilesetLoadingSnapshot(entry.tileset)
        snapshots.push(snapshot)
        loading = snapshot.loading || loading
      } else {
        loading = this.isTilesetLoading(entry.tileset) || loading
      }
    }

    const hasRenderableTiles = job.entries.some((entry) => this.hasTilesetRenderableTiles(entry.tileset))
    const readinessSummaries = job.debug
      ? job.entries.map((entry) => this.getHeightSamplingBatchReadinessSummary(entry.tileset, batch.tasks))
      : null
    const isSceneRegionJob = this.isSceneRegionSamplingEntries(job.entries)
    const isBatchRegionReady = readinessSummaries
      ? readinessSummaries.every((summary) => summary.ready)
      : job.entries.every((entry) => this.isHeightSamplingBatchMostDetailed(entry.tileset, batch.tasks))
    const isMostDetailed =
      hasRenderableTiles &&
      isBatchRegionReady &&
      (isSceneRegionJob || !loading)

    if (isMostDetailed) {
      batch.stableFrames += 1
    } else {
      batch.stableFrames = 0
    }

    batch.frames += 1

    if (batch.stableFrames >= 2 || batch.frames >= job.maxFrames) {
      this.logHeightSamplingBatchDebug(job, batch, snapshots, readinessSummaries, {
        loading,
        hasRenderableTiles,
        isMostDetailed,
        completedBy: batch.stableFrames >= 2 ? 'stable' : 'maxFrames'
      })
      this.completeHeightSamplingBatch(job)
      return job.currentBatchIndex >= job.batches.length
        ? this.finishHeightSamplingJob(job)
        : false
    }

    return false
  }

  private beginHeightSamplingBatch(job: HeightSamplingJob) {
    const tasks = job.batches[job.currentBatchIndex]
    if (!tasks) return

    const needsSamplingCamera = job.entries.some((entry) => entry.useSamplingCamera !== false)
    const camera = needsSamplingCamera ? this.configureSampleOffscreenCamera(tasks, job.options) : null
    const resolution = Math.max(1, job.options.resolution ?? DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_RESOLUTION)
    const loadRegions = job.entries.flatMap((entry) => (
      this.addHeightSamplingLoadRegions(entry.tileset, tasks, entry.regionMask ?? true)
    ))

    job.entries.forEach((entry) => {
      if (!camera || entry.useSamplingCamera === false) return
      entry.tileset.setCamera(camera)
      entry.tileset.setResolution(camera, resolution, resolution)
    })

    job.activeBatch = {
      tasks,
      camera,
      loadRegions,
      startedAt: performance.now(),
      frames: 0,
      stableFrames: 0
    }
  }

  private completeHeightSamplingBatch(job: HeightSamplingJob) {
    const batch = job.activeBatch
    if (!batch) return

    const sampleStartedAt = performance.now()
    this.sampleHeightTasksFromSamplingTilesets(batch.tasks, job.entries, job.results)
    batch.tasks.forEach((task) => {
      if (job.results[task.index] !== undefined) return

      const height = this.sampleHeightFromLoadedTilesForTask(task, job.options)
      job.results[task.index] = height === undefined ? undefined : [task.position[0], task.position[1], height]
    })
    this.logHeightSamplingBatchSampleDebug(job, batch, performance.now() - sampleStartedAt)

    this.disposeHeightSamplingBatch(job)
    job.currentBatchIndex += 1
  }

  private disposeHeightSamplingBatch(job: HeightSamplingJob) {
    const batch = job.activeBatch
    if (!batch) return

    batch.loadRegions.forEach((loadRegion) => {
      loadRegion.plugin.removeRegion(loadRegion.region)
    })
    job.entries.forEach((entry) => {
      if (batch.camera && entry.useSamplingCamera !== false) {
        entry.tileset.deleteCamera(batch.camera)
      }
    })
    job.activeBatch = null
  }

  private finishHeightSamplingJob(job: HeightSamplingJob) {
    this.disposeHeightSamplingBatch(job)
    this.tilesets.disposeHeightSamplingTilesets(job.entries)
    this.removeHeightSamplingJob(job)
    this.logHeightSamplingJobFinished(job)
    job.resolve(job.results)
    return true
  }

  private cancelHeightSamplingJob(job: HeightSamplingJob) {
    this.disposeHeightSamplingBatch(job)
    this.tilesets.disposeHeightSamplingTilesets(job.entries)
    this.removeHeightSamplingJob(job)
    job.resolve(job.results)
  }

  private removeHeightSamplingJob(job: HeightSamplingJob) {
    const index = this.heightSamplingJobs.indexOf(job)
    if (index !== -1) {
      this.heightSamplingJobs.splice(index, 1)
      if (index < this.heightSamplingJobCursor) {
        this.heightSamplingJobCursor -= 1
      }
      if (this.heightSamplingJobCursor >= this.heightSamplingJobs.length) {
        this.heightSamplingJobCursor = 0
      }
    }
  }

  private sampleHeightTasksFromSamplingTilesets(
    tasks: HeightSamplingTask[],
    entries: HeightSamplingTilesetEntry[],
    results: SampleHeightMostDetailedResult[]
  ) {
    tasks.forEach((task) => {
      const height = this.sampleHeightFromSamplingTilesetsForTask(task, entries)
      if (height !== undefined) {
        results[task.index] = [task.position[0], task.position[1], height]
      }
    })
  }

  private sampleHeightFromSamplingTilesetsForTask(task: HeightSamplingTask, entries: HeightSamplingTilesetEntry[]) {
    let closestHit: { height: number; distance: number } | null = null

    for (const entry of entries) {
      const hit = this.sampleHeightFromTileset(entry.tileset, task.raycaster)
      if (hit && (!closestHit || hit.distance < closestHit.distance)) {
        closestHit = hit
      }
    }

    return closestHit?.height
  }

  private hasTilesetRenderableTiles(tileset: TilesRenderer) {
    const renderer = tileset as TilesRenderer & {
      activeTiles?: Set<unknown>
      visibleTiles?: Set<unknown>
    }

    return (renderer.activeTiles?.size ?? 0) > 0 || (renderer.visibleTiles?.size ?? 0) > 0
  }

  private isHeightSamplingBatchMostDetailed(tileset: TilesRenderer, tasks: HeightSamplingTask[]) {
    return this.getHeightSamplingBatchReadinessSummary(tileset, tasks).ready
  }

  private getHeightSamplingBatchReadinessSummary(tileset: TilesRenderer, tasks: HeightSamplingTask[]): HeightSamplingReadinessSummary {
    const renderer = tileset as HeightSamplingTilesRenderer
    const root = renderer.root
    if (!root) {
      return {
        ready: false,
        intersectingRays: 0,
        pendingRays: tasks.length
      }
    }

    let intersectingRays = 0
    let pendingRays = 0
    tasks.forEach((task) => {
      const ray = this.getHeightSamplingRayInTilesetFrame(tileset, task.ray)
      const readiness = this.getHeightSamplingTileReadiness(root, renderer, ray)
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

    if (this.isHeightSamplingTileReadyLeaf(tile, renderer)) {
      return { intersects: true, ready: true }
    }

    const children = tile.children ?? []
    if (!children[children.length - 1]?.traversal) {
      return { intersects: true, ready: false }
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

  private isHeightSamplingTileReadyLeaf(tile: HeightSamplingTile, renderer: HeightSamplingTilesRenderer) {
    if (this.isHeightSamplingTileWithinErrorTarget(tile, renderer) && !this.canHeightSamplingTileUnconditionallyRefine(tile)) {
      return true
    }

    if (renderer.maxDepth > 0 && tile.internal && tile.internal.depth + 1 >= renderer.maxDepth) {
      return true
    }

    const children = tile.children ?? []
    return children.length === 0
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
    return this.getTilesetLoadingSnapshot(tileset).loading
  }

  private getTilesetLoadingSnapshot(tileset: TilesRenderer): HeightSamplingTilesetSnapshot {
    const renderer = tileset as TilesRenderer & {
      isLoading?: boolean
      activeTiles?: Set<unknown>
      visibleTiles?: Set<unknown>
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

  private logHeightSamplingBatchDebug(
    job: HeightSamplingJob,
    batch: HeightSamplingBatchState,
    snapshots: HeightSamplingTilesetSnapshot[],
    readinessSummaries: HeightSamplingReadinessSummary[] | null,
    status: {
      loading: boolean
      hasRenderableTiles: boolean
      isMostDetailed: boolean
      completedBy: 'stable' | 'maxFrames'
    }
  ) {
    const debug = job.debug
    if (!debug?.options.logBatches) return

    const batchNumber = job.currentBatchIndex + 1
    const elapsed = performance.now() - batch.startedAt
    const shouldLog =
      batchNumber % debug.options.batchInterval === 0 ||
      elapsed >= debug.options.slowBatchMilliseconds ||
      status.completedBy === 'maxFrames'
    if (!shouldLog) return

    console.info(`${debug.options.label}: batch ${batchNumber}/${debug.batches}`, {
      route: debug.route,
      tasks: batch.tasks.length,
      elapsedMilliseconds: Math.round(elapsed),
      frames: batch.frames,
      stableFrames: batch.stableFrames,
      completedBy: status.completedBy,
      loading: status.loading,
      hasRenderableTiles: status.hasRenderableTiles,
      isMostDetailed: status.isMostDetailed,
      tilesets: snapshots.length > 0
        ? snapshots
        : job.entries.map((entry) => this.getTilesetLoadingSnapshot(entry.tileset)),
      readiness: readinessSummaries ?? job.entries.map((entry) => (
        this.getHeightSamplingBatchReadinessSummary(entry.tileset, batch.tasks)
      ))
    })
  }

  private logHeightSamplingBatchSampleDebug(
    job: HeightSamplingJob,
    batch: HeightSamplingBatchState,
    elapsedMilliseconds: number
  ) {
    const debug = job.debug
    if (!debug?.options.logBatches) return

    const batchNumber = job.currentBatchIndex + 1
    if (
      batchNumber % debug.options.batchInterval !== 0 &&
      elapsedMilliseconds < debug.options.slowBatchMilliseconds
    ) {
      return
    }

    const hits = batch.tasks.reduce((count, task) => (
      job.results[task.index] === undefined ? count : count + 1
    ), 0)
    console.info(`${debug.options.label}: batch ${batchNumber}/${debug.batches} raycast`, {
      tasks: batch.tasks.length,
      hits,
      elapsedMilliseconds: Math.round(elapsedMilliseconds)
    })
  }

  private logHeightSamplingJobFinished(job: HeightSamplingJob) {
    const debug = job.debug
    if (!debug) return

    const elapsed = performance.now() - debug.startedAt
    const hits = job.results.reduce((count, result) => result === undefined ? count : count + 1, 0)
    console.info(`${debug.options.label}: finished`, {
      route: debug.route,
      positions: debug.positions,
      batches: debug.batches,
      hits,
      elapsedMilliseconds: Math.round(elapsed)
    })
  }
}
