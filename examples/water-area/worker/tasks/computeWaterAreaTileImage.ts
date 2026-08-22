// cSpell:words varint busway guideway

import Point from '@mapbox/point-geometry'
import { VectorTile } from '@mapbox/vector-tile'
import type Pbf from 'pbf'
import Protobuf from 'pbf'
import {
  LineSymbolizer,
  paint,
  PolygonSymbolizer,
  TileCache as TileCacheBase,
  toIndex,
  View,
  type Feature,
  type PaintRule,
  type PreparedTile,
  type Zxy
} from 'protomaps-leaflet'

import { transferResult, type TransferResult } from '../transfer'
import type {
  WaterAreaTileCoordinate,
  WaterAreaTileImageResult
} from '../types'
import {
  classifyWaterAreaTile,
  isWaterPolygon,
  WATER_AREA_LAYER_KEYS
} from './classifyWaterAreaTile'

const WATER_AREA_TILE_URL =
  'https://vector.openstreetmap.org/shortbread_v1/{z}/{x}/{y}.mvt'
const MAX_DATA_LEVEL = 14
const TILE_DIMENSION = 128
const DATA_DIMENSION = 256

const canvas = new OffscreenCanvas(TILE_DIMENSION, TILE_DIMENSION)
const context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D
const scale = TILE_DIMENSION / DATA_DIMENSION
context.translate(0, TILE_DIMENSION)
context.scale(scale, -scale)

const streetLineWidthAtLevel14: Record<string, number | undefined> = {
  motorway: 3,
  trunk: 2.5,
  primary: 2,
  secondary: 1.5,
  tertiary: 1,
  unclassified: 1,
  residential: 1,
  busway: 1,
  bus_guideway: 1,
  pedestrian: 0.5,
  rail: 0.5,
  living_street: 0.5
}

const isBridge = (feature: Pick<Feature, 'props'>): boolean =>
  feature.props.bridge === true

const paintRules: PaintRule[] = [
  {
    dataLayer: 'ocean',
    symbolizer: new PolygonSymbolizer({ fill: '#fff' })
  },
  {
    dataLayer: 'water_polygons',
    symbolizer: new PolygonSymbolizer({ fill: '#fff' }),
    filter: (_zoom, feature) => isWaterPolygon(feature)
  },
  {
    dataLayer: 'bridges',
    symbolizer: new PolygonSymbolizer({ fill: '#000' })
  },
  {
    dataLayer: 'pier_polygons',
    symbolizer: new PolygonSymbolizer({ fill: '#000' })
  },
  {
    dataLayer: 'dam_polygons',
    symbolizer: new PolygonSymbolizer({ fill: '#000' })
  },
  {
    dataLayer: 'street_polygons',
    symbolizer: new PolygonSymbolizer({ fill: '#000' }),
    filter: (_zoom, feature) => isBridge(feature)
  },
  {
    dataLayer: 'streets',
    symbolizer: new LineSymbolizer({
      color: '#000',
      width: (zoom, feature) => {
        if (!feature) return 0
        const width =
          streetLineWidthAtLevel14[feature.props.kind as string] ?? 0.3
        return width * 2 ** (zoom - 14)
      }
    }),
    filter: (_zoom, feature) => isBridge(feature)
  }
]

function readSignedVarint(pbf: Pbf): number {
  const value = pbf.readVarint()
  return (value >>> 1) ^ -(value & 1)
}

function loadGeometryAndBounds(
  pbf: Protobuf,
  geometry: number,
  geometryScale: number
) {
  pbf.pos = geometry
  const end = pbf.readVarint() + pbf.pos
  let command = 1
  let commandLength = 0
  let x = 0
  let y = 0
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  const lines: Point[][] = []
  let line: Point[] = []

  while (pbf.pos < end) {
    if (commandLength <= 0) {
      const commandAndLength = pbf.readVarint()
      command = commandAndLength & 0x7
      commandLength = commandAndLength >> 3
    }
    commandLength -= 1

    if (command === 1 || command === 2) {
      x += readSignedVarint(pbf) * geometryScale
      y += readSignedVarint(pbf) * geometryScale
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      if (command === 1) {
        if (line.length > 0) lines.push(line)
        line = []
      }
      line.push(new Point(x, y))
    } else if (command === 7) {
      if (line.length > 0) line.push(line[0].clone())
    } else {
      throw new Error(`Unknown MVT geometry command: ${command}`)
    }
  }

  if (line.length > 0) lines.push(line)
  return {
    geom: lines,
    bbox: { minX, minY, maxX, maxY }
  }
}

function parseTile(
  buffer: ArrayBuffer,
  tileSize: number
): Map<string, Feature[]> {
  const vectorTile = new VectorTile(new Protobuf(buffer))
  const result = new Map<string, Feature[]>()

  for (const [key, value] of Object.entries(vectorTile.layers)) {
    if (!(WATER_AREA_LAYER_KEYS as readonly string[]).includes(key)) continue

    const layer = value as any
    const features: Feature[] = []
    for (let index = 0; index < layer.length; index += 1) {
      const feature = layer.feature(index)
      const props = feature.properties as Feature['props']
      if (
        (key === 'street_polygons' || key === 'streets') &&
        !isBridge({ props })
      ) {
        continue
      }

      const loaded = loadGeometryAndBounds(
        feature._pbf,
        feature._geometry,
        tileSize / layer.extent
      )
      let numVertices = 0
      for (const part of loaded.geom) numVertices += part.length
      features.push({
        id: feature.id,
        geomType: feature.type,
        geom: loaded.geom,
        numVertices,
        bbox: loaded.bbox,
        props
      } as unknown as Feature)
    }
    result.set(key, features)
  }

  return result
}

class WaterAreaTileSource {
  constructor(readonly url: string) {}

  async get(
    { x, y, z }: Zxy,
    tileSize: number
  ): Promise<Map<string, Feature[]>> {
    const url = this.url
      .replace('{z}', `${z}`)
      .replace('{x}', `${x}`)
      .replace('{y}', `${y}`)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Water-area MVT request failed: ${response.status} ${url}`)
    }
    return parseTile(await response.arrayBuffer(), tileSize)
  }
}

class WaterAreaTileCache extends TileCacheBase {
  constructor(
    source: WaterAreaTileSource,
    tileSize: number,
    readonly maxCacheCount = 4
  ) {
    super(source, tileSize)
  }

  override async get(coordinate: Zxy): Promise<Map<string, Feature[]>> {
    const index = toIndex(coordinate)
    return new Promise((resolve, reject) => {
      const cached = this.cache.get(index)
      if (cached) {
        cached.used = performance.now()
        resolve(cached.data)
        return
      }

      const inflight = this.inflight.get(index)
      if (inflight) {
        inflight.push({ resolve, reject })
        return
      }

      this.inflight.set(index, [])
      this.source
        .get(coordinate, this.tileSize)
        .then((tile) => {
          this.cache.set(index, { used: performance.now(), data: tile })
          const listeners = this.inflight.get(index) ?? []
          for (const listener of listeners) listener.resolve(tile)
          this.inflight.delete(index)
          resolve(tile)
          this.evictLeastRecentlyUsedTile()
        })
        .catch((error: unknown) => {
          const failure =
            error instanceof Error ? error : new Error(String(error))
          const listeners = this.inflight.get(index) ?? []
          for (const listener of listeners) listener.reject(failure)
          this.inflight.delete(index)
          reject(failure)
        })
    })
  }

  private evictLeastRecentlyUsedTile(): void {
    if (this.cache.size < this.maxCacheCount) return

    let oldestUse = Infinity
    let oldestKey: string | undefined
    this.cache.forEach((value, key) => {
      if (value.used < oldestUse) {
        oldestUse = value.used
        oldestKey = key
      }
    })
    if (oldestKey !== undefined) this.cache.delete(oldestKey)
  }
}

const LEVEL_DIFFERENCE = 2
const source = new WaterAreaTileSource(WATER_AREA_TILE_URL)
const cache = new WaterAreaTileCache(
  source,
  DATA_DIMENSION * LEVEL_DIFFERENCE ** 2
)
const view = new View(cache, MAX_DATA_LEVEL, LEVEL_DIFFERENCE)

export async function computeWaterAreaTileImage(
  coordinate: WaterAreaTileCoordinate
): Promise<TransferResult<WaterAreaTileImageResult> | WaterAreaTileImageResult> {
  context.fillStyle = '#000'
  context.fillRect(0, 0, DATA_DIMENSION, DATA_DIMENSION)

  const { x, y, z } = coordinate
  const bounds = {
    minX: DATA_DIMENSION * x,
    minY: DATA_DIMENSION * y,
    maxX: DATA_DIMENSION * (x + 1),
    maxY: DATA_DIMENSION * (y + 1)
  }
  const origin = new Point(DATA_DIMENSION * x, DATA_DIMENSION * y)
  const preparedTile = (await view.getDisplayTile(coordinate)) as PreparedTile
  const classification = classifyWaterAreaTile(preparedTile.data)

  if (classification === 'land') return { solid: 'land' }
  if (classification === 'water') return { solid: 'water' }

  paint(
    context,
    z,
    new Map([['', [preparedTile]]]),
    null,
    paintRules,
    bounds,
    origin,
    false
  )

  const image = canvas.transferToImageBitmap()
  return transferResult({ image }, [image])
}
