import type { TerrainHeightPage } from './TerrainFieldClipmap'
import type { TerrainRasterizerInput } from './terrainRasterizer'

export interface TerrainFieldWorkerConfig {
  width: number
  height: number
  cellSize: number
  maxBytes: number
  blendSeconds: number
  crossShoreMin: number
  crossShoreMax: number
  alongshoreMin: number
  alongshoreMax: number
  seaLevel: number
  maxDepth: number
  bathymetrySlope: number
  hysteresis: number
}

export type TerrainFieldWorkerRequest =
  | { type: 'init', config: TerrainFieldWorkerConfig }
  | { type: 'page', page: Omit<TerrainHeightPage, 'size' | 'heights' | 'validity'>, raster: TerrainRasterizerInput }
  | { type: 'compose', nowSeconds: number }
  | { type: 'settings', seaLevel: number, maxDepth: number, bathymetrySlope: number, blendSeconds: number }
  | { type: 'reset', sourceRevision: number }

export interface TerrainFieldRevision {
  type: 'field'
  revision: number
  sourceRevision: number
  width: number
  height: number
  heights: Float32Array
  landMask: Uint8Array
  shoreSdf: Float32Array
  bedHeight: Float32Array
  validity: Uint8Array
  depth: Uint16Array
  pageCount: number
  cacheBytes: number
  composeMilliseconds: number
}

export type TerrainFieldWorkerResponse = TerrainFieldRevision | {
  type: 'error'
  message: string
}
