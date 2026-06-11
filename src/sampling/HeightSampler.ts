import * as THREE from 'three'
import { LoadRegionPlugin, RayRegion } from '3d-tiles-renderer/plugins'
import type { TilesRenderer } from '3d-tiles-renderer'
import { DEG2RAD } from '../constants'
import type { HeightSamplingTilesetEntry, TilesetManager } from '../tiles/TilesetManager'
import {
  TilesetSamplingAdapter,
  type TilesetSamplingReadinessSummary,
  type TilesetSamplingSnapshot
} from '../tiles/TilesetSamplingAdapter'
import type {
  CartographicCoordinateTuple,
  CartographicCoordinates,
  CartographicInput,
  SampleHeightMostDetailedDebugOptions,
  SampleHeightMostDetailedOptions,
  SampleHeightMostDetailedResult,
  SampleHeightOptions
} from '../types'
import { HeightSamplingBatcher } from './HeightSamplingBatcher'
import { QuantizedMeshTerrainSampler } from './QuantizedMeshTerrainSampler'

const DEFAULT_SAMPLE_HEIGHT_MINIMUM_HEIGHT = -10000
const DEFAULT_SAMPLE_HEIGHT_MAXIMUM_HEIGHT = 100000
const DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_RESOLUTION = 256
const DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_MAX_FRAMES = 120
const DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_MAX_PASSES_PER_FRAME = 1
const DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_BATCH_SIZE = 8
const DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_SCENE_REGION_BATCH_SIZE = 64
// 默认不主动切分 raycast 阶段；历史测试中小时间片会显著降低大批量采样吞吐。
const RAYCAST_TIME_SLICING_DISABLED = Number.POSITIVE_INFINITY
const DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_RAYCAST_TIME_SLICE_MS = RAYCAST_TIME_SLICING_DISABLED
const DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_MAX_BATCH_SPAN_DEGREES = 0.25
const DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_REGION_ERROR_TARGET = 0

type HeightSamplingLoadRegion = {
  plugin: InstanceType<typeof LoadRegionPlugin>
  region: InstanceType<typeof RayRegion>
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
  isSampling: boolean
  sampleCursor: number
  sampleElapsedMilliseconds: number
  sampleSlices: number
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
  private readonly batcher = new HeightSamplingBatcher()
  private readonly terrainSampler = new QuantizedMeshTerrainSampler()
  private readonly tilesetSampling = new TilesetSamplingAdapter()
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

    await this.waitForBrowserPaint()

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

    const tilesetEntries = this.tilesets.createHeightSamplingTilesets('tileset')
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
    const maxBatchSize = this.isSceneRegionSamplingEntries(entries)
      ? DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_SCENE_REGION_BATCH_SIZE
      : DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_BATCH_SIZE
    return this.batcher.createBatches(tasks, {
      maxBatchSize,
      maxSpanDegrees: DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_MAX_BATCH_SPAN_DEGREES
    })
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

    return this.tilesetSampling.sampleHeight(tileset, raycaster, this.sampleMatrix, this.sampleLocalRay)
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

    if (batch.isSampling) {
      const isBatchSampled = this.updateHeightSamplingBatchSample(job)
      return isBatchSampled && job.currentBatchIndex >= job.batches.length
        ? this.finishHeightSamplingJob(job)
        : false
    }

    if (batch.frames >= job.maxFrames) {
      this.beginHeightSamplingBatchSample(job)
      const isBatchSampled = this.updateHeightSamplingBatchSample(job)
      return isBatchSampled && job.currentBatchIndex >= job.batches.length
        ? this.finishHeightSamplingJob(job)
        : false
    }

    const snapshots: TilesetSamplingSnapshot[] = []
    let loading = false
    for (const entry of job.entries) {
      entry.tileset.update()
      if (job.debug) {
        const snapshot = this.tilesetSampling.getLoadingSnapshot(entry.tileset)
        snapshots.push(snapshot)
        loading = snapshot.loading || loading
      } else {
        loading = this.tilesetSampling.isLoading(entry.tileset) || loading
      }
    }

    const hasRenderableTiles = job.entries.some((entry) => this.tilesetSampling.hasRenderableTiles(entry.tileset))
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
      this.beginHeightSamplingBatchSample(job)
      const isBatchSampled = this.updateHeightSamplingBatchSample(job)
      return isBatchSampled && job.currentBatchIndex >= job.batches.length
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
      stableFrames: 0,
      isSampling: false,
      sampleCursor: 0,
      sampleElapsedMilliseconds: 0,
      sampleSlices: 0
    }
  }

  private beginHeightSamplingBatchSample(job: HeightSamplingJob) {
    const batch = job.activeBatch
    if (!batch) return

    batch.isSampling = true
    batch.sampleCursor = 0
    batch.sampleElapsedMilliseconds = 0
    batch.sampleSlices = 0
  }

  private updateHeightSamplingBatchSample(job: HeightSamplingJob) {
    const batch = job.activeBatch
    if (!batch) return false
    if (!batch.isSampling) this.beginHeightSamplingBatchSample(job)

    const sliceStartedAt = performance.now()
    const sliceBudget = Math.max(1, DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_RAYCAST_TIME_SLICE_MS)

    while (batch.sampleCursor < batch.tasks.length) {
      const task = batch.tasks[batch.sampleCursor]
      const height = this.sampleHeightFromSamplingTilesetsForTask(task, job.entries)
        ?? this.sampleHeightFromLoadedTilesForTask(task, job.options)

      job.results[task.index] = height === undefined ? undefined : [task.position[0], task.position[1], height]
      batch.sampleCursor += 1

      if (this.shouldYieldRaycastSlice(sliceStartedAt, sliceBudget)) {
        break
      }
    }

    batch.sampleElapsedMilliseconds += performance.now() - sliceStartedAt
    batch.sampleSlices += 1
    if (batch.sampleCursor < batch.tasks.length) return false

    this.completeHeightSamplingBatch(job)
    return true
  }

  private shouldYieldRaycastSlice(sliceStartedAt: number, sliceBudgetMilliseconds: number) {
    // Infinity 表示明确禁用 raycast 时间片，而不是依赖比较表达式的隐式行为。
    if (!Number.isFinite(sliceBudgetMilliseconds)) return false

    return performance.now() - sliceStartedAt >= sliceBudgetMilliseconds
  }

  private completeHeightSamplingBatch(job: HeightSamplingJob) {
    const batch = job.activeBatch
    if (!batch) return

    this.logHeightSamplingBatchSampleDebug(job, batch, batch.sampleElapsedMilliseconds)

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

  private waitForBrowserPaint() {
    return new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame !== 'function') {
        setTimeout(resolve, 0)
        return
      }

      requestAnimationFrame(() => {
        setTimeout(resolve, 0)
      })
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

  private isHeightSamplingBatchMostDetailed(tileset: TilesRenderer, tasks: HeightSamplingTask[]) {
    return this.getHeightSamplingBatchReadinessSummary(tileset, tasks).ready
  }

  private getHeightSamplingBatchReadinessSummary(
    tileset: TilesRenderer,
    tasks: HeightSamplingTask[]
  ): TilesetSamplingReadinessSummary {
    return this.tilesetSampling.getReadinessSummary(tileset, tasks, (task) => (
      this.getHeightSamplingRayInTilesetFrame(tileset, task.ray)
    ))
  }

  private logHeightSamplingBatchDebug(
    job: HeightSamplingJob,
    batch: HeightSamplingBatchState,
    snapshots: TilesetSamplingSnapshot[],
    readinessSummaries: TilesetSamplingReadinessSummary[] | null,
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
        : job.entries.map((entry) => this.tilesetSampling.getLoadingSnapshot(entry.tileset)),
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
