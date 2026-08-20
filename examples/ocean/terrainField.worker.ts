/// <reference lib="webworker" />

import { TerrainFieldClipmap } from './TerrainFieldClipmap'
import { deriveCoastField } from './coastField'
import { localToRiyueBayCartographic } from './RiyueBayPreset'
import { rasterizeTerrainPage } from './terrainRasterizer'
import type {
  TerrainFieldWorkerConfig,
  TerrainFieldWorkerRequest,
  TerrainFieldWorkerResponse
} from './terrainFieldMessages'

let config: TerrainFieldWorkerConfig | null = null
let clipmap: TerrainFieldClipmap | null = null
let sourceRevision = 0
let revision = 0
let previousLand: Uint8Array | undefined
let composeTimer: ReturnType<typeof setTimeout> | undefined

self.addEventListener('message', (event: MessageEvent<TerrainFieldWorkerRequest>) => {
  try {
    handleRequest(event.data)
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
})

function handleRequest(request: TerrainFieldWorkerRequest) {
  switch (request.type) {
    case 'init':
      config = { ...request.config }
      clipmap = new TerrainFieldClipmap({
        maxBytes: config.maxBytes,
        blendSeconds: config.blendSeconds
      })
      previousLand = undefined
      return
    case 'page': {
      ensureInitialized()
      sourceRevision = request.page.sourceRevision
      const result = rasterizeTerrainPage(request.raster)
      clipmap!.upsert({
        ...request.page,
        size: request.raster.size,
        heights: result.heights,
        validity: result.validity
      })
      scheduleCompose()
      return
    }
    case 'compose':
      compose(request.nowSeconds)
      return
    case 'settings':
      ensureInitialized()
      config!.seaLevel = request.seaLevel
      config!.maxDepth = request.maxDepth
      config!.bathymetrySlope = request.bathymetrySlope
      config!.blendSeconds = request.blendSeconds
      clipmap!.setBlendSeconds(request.blendSeconds)
      scheduleCompose()
      return
    case 'reset':
      sourceRevision = request.sourceRevision
      clipmap?.clear()
      previousLand = undefined
      revision += 1
      postEmptyField()
  }
}

function scheduleCompose() {
  if (composeTimer !== undefined) return
  composeTimer = setTimeout(() => {
    composeTimer = undefined
    compose(performance.now() / 1000)
  }, 40)
}

function compose(nowSeconds: number) {
  ensureInitialized()
  const start = performance.now()
  const count = config!.width * config!.height
  const heights = new Float32Array(count)
  heights.fill(Number.NaN)
  const validity = new Uint8Array(count)
  const depth = new Uint16Array(count)
  const extentWidth = config!.crossShoreMax - config!.crossShoreMin
  const extentHeight = config!.alongshoreMax - config!.alongshoreMin
  for (let y = 0; y < config!.height; y += 1) {
    const z = config!.alongshoreMin + (y + 0.5) / config!.height * extentHeight
    for (let x = 0; x < config!.width; x += 1) {
      const localX = config!.crossShoreMin + (x + 0.5) / config!.width * extentWidth
      const cartographic = localToRiyueBayCartographic(localX, z)
      const sample = clipmap!.sample(cartographic.longitude, cartographic.latitude, nowSeconds)
      if (!sample) continue
      const index = y * config!.width + x
      heights[index] = sample.height
      validity[index] = 1
      depth[index] = sample.depth
    }
  }
  const derived = deriveCoastField({
    heights,
    validity,
    width: config!.width,
    height: config!.height,
    cellSize: config!.cellSize,
    seaLevel: config!.seaLevel,
    maxDepth: config!.maxDepth,
    bathymetrySlope: config!.bathymetrySlope,
    hysteresis: config!.hysteresis,
    previousLand
  })
  previousLand = new Uint8Array(derived.landMask)
  revision += 1
  const response: TerrainFieldWorkerResponse = {
    type: 'field',
    revision,
    sourceRevision,
    width: config!.width,
    height: config!.height,
    heights,
    landMask: derived.landMask,
    shoreSdf: derived.shoreSdf,
    bedHeight: derived.bedHeight,
    validity: derived.validity,
    depth,
    pageCount: clipmap!.pageCount,
    cacheBytes: clipmap!.bytes,
    composeMilliseconds: performance.now() - start
  }
  post(response, [
    heights.buffer,
    response.landMask.buffer,
    response.shoreSdf.buffer,
    response.bedHeight.buffer,
    response.validity.buffer,
    depth.buffer
  ])
}

function postEmptyField() {
  if (!config) return
  const count = config.width * config.height
  const heights = new Float32Array(count)
  heights.fill(Number.NaN)
  const landMask = new Uint8Array(count)
  const shoreSdf = new Float32Array(count)
  shoreSdf.fill(Number.NaN)
  const bedHeight = new Float32Array(count)
  bedHeight.fill(Number.NaN)
  const validity = new Uint8Array(count)
  const depth = new Uint16Array(count)
  post({
    type: 'field', revision, sourceRevision,
    width: config.width, height: config.height,
    heights, landMask, shoreSdf, bedHeight, validity, depth,
    pageCount: 0, cacheBytes: 0, composeMilliseconds: 0
  }, [heights.buffer, landMask.buffer, shoreSdf.buffer, bedHeight.buffer, validity.buffer, depth.buffer])
}

function ensureInitialized() {
  if (!config || !clipmap) throw new Error('Terrain field worker has not been initialized.')
}

function post(message: TerrainFieldWorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer })
}
