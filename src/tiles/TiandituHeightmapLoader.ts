import {
  BufferAttribute,
  BufferGeometry,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Vector3
} from 'three'
import { Ellipsoid } from '3d-tiles-renderer/three'

const GZIP_ID1 = 0x1f
const GZIP_ID2 = 0x8b
/** zlib/deflate 常见头（天地图 swdx 实测返回 `78 9c`）。Common zlib/deflate header. */
const ZLIB_CMF = 0x78

export const TIANDITU_HEIGHTMAP_SIZE = 64
const SOURCE_GRID_SIZE = 150
const SOURCE_SAMPLE_COUNT = SOURCE_GRID_SIZE * SOURCE_GRID_SIZE
const MIN_VALID_HEIGHT = -2000
const MAX_VALID_HEIGHT = 10000

export type TiandituHeightmapLoaderOptions = {
  ellipsoid: Ellipsoid
  minLat: number
  minLon: number
  maxLat: number
  maxLon: number
  skirtLength?: number
  generateNormals?: boolean
}

const _position = new Vector3()

/**
 * 解压天地图 elv_c 地形字节。服务可能返回 gzip（`1f 8b`）或 zlib/deflate（`78 9c`），
 * 与 Cesium `GeoTerrainProvider` 行为对齐；未压缩则原样返回。
 *
 * Decompresses Tianditu `elv_c` terrain bytes. The service may return gzip
 * (`1f 8b`) or zlib/deflate (`78 9c`), matching Cesium `GeoTerrainProvider`.
 * Uncompressed payloads are returned as-is.
 */
export async function decompressTiandituTerrainBuffer(buffer: ArrayBuffer) {
  const format = detectTiandituCompression(buffer)
  if (!format) return buffer

  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      `Tellux Tianditu terrain: received ${format}-compressed elv_c bytes, but this browser does not support DecompressionStream.`
    )
  }

  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream(format))
  return new Response(stream).arrayBuffer()
}

/** @deprecated 请改用 {@link decompressTiandituTerrainBuffer}。 */
export async function decompressGzipBuffer(buffer: ArrayBuffer) {
  return decompressTiandituTerrainBuffer(buffer)
}

function detectTiandituCompression(buffer: ArrayBuffer): 'gzip' | 'deflate' | null {
  if (buffer.byteLength < 2) return null
  const bytes = new Uint8Array(buffer, 0, 2)
  if (bytes[0] === GZIP_ID1 && bytes[1] === GZIP_ID2) return 'gzip'
  // zlib wrapper: CMF=0x78，FLG 常见 0x01/0x9c/0xda 等
  if (bytes[0] === ZLIB_CMF) return 'deflate'
  return null
}

export function decodeTiandituElvC(buffer: ArrayBuffer): Float32Array {
  const bytes = new Uint8Array(buffer)
  const heights = new Float32Array(TIANDITU_HEIGHTMAP_SIZE * TIANDITU_HEIGHTMAP_SIZE)

  if (bytes.byteLength < SOURCE_SAMPLE_COUNT * 2) {
    return heights
  }

  for (let row = 0; row < TIANDITU_HEIGHTMAP_SIZE; row++) {
    for (let col = 0; col < TIANDITU_HEIGHTMAP_SIZE; col++) {
      const sourceRow = Math.floor((149 * row) / (TIANDITU_HEIGHTMAP_SIZE - 1))
      const sourceCol = Math.floor((149 * col) / (TIANDITU_HEIGHTMAP_SIZE - 1))
      const offset = 2 * (SOURCE_GRID_SIZE * sourceRow + sourceCol)
      let height = bytes[offset] + 256 * bytes[offset + 1]

      if (height > MAX_VALID_HEIGHT || height < MIN_VALID_HEIGHT) {
        height = 0
      }

      heights[row * TIANDITU_HEIGHTMAP_SIZE + col] = height
    }
  }

  return heights
}

export function createFlatTiandituHeights() {
  return new Float32Array(TIANDITU_HEIGHTMAP_SIZE * TIANDITU_HEIGHTMAP_SIZE)
}

export class TiandituHeightmapLoader {
  constructor(private readonly options: TiandituHeightmapLoaderOptions) {}

  parse(heights: Float32Array) {
    const {
      ellipsoid,
      minLat,
      minLon,
      maxLat,
      maxLon,
      skirtLength = 0,
      generateNormals = true
    } = this.options

    const positions: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    let minHeight = Infinity
    let maxHeight = -Infinity

    for (let row = 0; row < TIANDITU_HEIGHTMAP_SIZE; row++) {
      for (let col = 0; col < TIANDITU_HEIGHTMAP_SIZE; col++) {
        const u = col / (TIANDITU_HEIGHTMAP_SIZE - 1)
        const v = row / (TIANDITU_HEIGHTMAP_SIZE - 1)
        const height = heights[row * TIANDITU_HEIGHTMAP_SIZE + col]

        minHeight = Math.min(minHeight, height)
        maxHeight = Math.max(maxHeight, height)

        const lon = MathUtils.lerp(minLon, maxLon, u)
        const lat = MathUtils.lerp(minLat, maxLat, 1 - v)
        ellipsoid.getCartographicToPosition(lat, lon, height, _position)

        uvs.push(u, v)
        positions.push(_position.x, _position.y, _position.z)
      }
    }

    for (let row = 0; row < TIANDITU_HEIGHTMAP_SIZE - 1; row++) {
      for (let col = 0; col < TIANDITU_HEIGHTMAP_SIZE - 1; col++) {
        const topLeft = row * TIANDITU_HEIGHTMAP_SIZE + col
        const topRight = topLeft + 1
        const bottomLeft = topLeft + TIANDITU_HEIGHTMAP_SIZE
        const bottomRight = bottomLeft + 1

        indices.push(topLeft, bottomLeft, topRight)
        indices.push(topRight, bottomLeft, bottomRight)
      }
    }

    if (skirtLength > 0) {
      appendSkirt({
        positions,
        uvs,
        indices,
        ellipsoid,
        minLat,
        minLon,
        maxLat,
        maxLon,
        skirtLength,
        heights
      })
    }

    const centerHeight = Number.isFinite(minHeight) && Number.isFinite(maxHeight)
      ? (minHeight + maxHeight) * 0.5
      : 0
    const center = getRegionCenter(ellipsoid, minLat, minLon, maxLat, maxLon, centerHeight)
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] -= center.x
      positions[i + 1] -= center.y
      positions[i + 2] -= center.z
    }

    const geometry = new BufferGeometry()
    const indexBuffer =
      positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)
    geometry.setIndex(new BufferAttribute(indexBuffer, 1, false))
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3, false))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2, false))

    if (generateNormals) {
      geometry.computeVertexNormals()
    }

    const mesh = new Mesh(geometry, new MeshStandardMaterial())
    mesh.position.set(center.x, center.y, center.z)
    mesh.userData.minHeight = Number.isFinite(minHeight) ? minHeight : 0
    mesh.userData.maxHeight = Number.isFinite(maxHeight) ? maxHeight : 0

    return mesh
  }
}

function appendSkirt(options: {
  positions: number[]
  uvs: number[]
  indices: number[]
  ellipsoid: Ellipsoid
  minLat: number
  minLon: number
  maxLat: number
  maxLon: number
  skirtLength: number
  heights: Float32Array
}) {
  const { positions, uvs, indices, ellipsoid, minLat, minLon, maxLat, maxLon, skirtLength, heights } =
    options

  const addEdge = (vertexIndices: number[]) => {
    const topOffset = positions.length / 3

    for (const index of vertexIndices) {
      const u = uvs[index * 2]
      const v = uvs[index * 2 + 1]
      const lon = MathUtils.lerp(minLon, maxLon, u)
      const lat = MathUtils.lerp(minLat, maxLat, 1 - v)
      const height = heights[index]

      ellipsoid.getCartographicToPosition(lat, lon, height, _position)
      positions.push(_position.x, _position.y, _position.z)
      uvs.push(u, v)

      ellipsoid.getCartographicToPosition(lat, lon, height - skirtLength, _position)
      positions.push(_position.x, _position.y, _position.z)
      uvs.push(u, v)
    }

    for (let i = 0; i < vertexIndices.length - 1; i++) {
      const topA = topOffset + i * 2
      const bottomA = topA + 1
      const topB = topA + 2
      const bottomB = topB + 1
      indices.push(topA, bottomA, topB)
      indices.push(topB, bottomA, bottomB)
    }
  }

  const westEdge = Array.from({ length: TIANDITU_HEIGHTMAP_SIZE }, (_, row) => row * TIANDITU_HEIGHTMAP_SIZE)
  const eastEdge = Array.from(
    { length: TIANDITU_HEIGHTMAP_SIZE },
    (_, row) => row * TIANDITU_HEIGHTMAP_SIZE + (TIANDITU_HEIGHTMAP_SIZE - 1)
  )
  const northEdge = Array.from({ length: TIANDITU_HEIGHTMAP_SIZE }, (_, col) => col)
  const southEdge = Array.from(
    { length: TIANDITU_HEIGHTMAP_SIZE },
    (_, col) => (TIANDITU_HEIGHTMAP_SIZE - 1) * TIANDITU_HEIGHTMAP_SIZE + col
  )

  addEdge(westEdge)
  addEdge(eastEdge)
  addEdge(northEdge)
  addEdge(southEdge)
}

function getRegionCenter(
  ellipsoid: Ellipsoid,
  minLat: number,
  minLon: number,
  maxLat: number,
  maxLon: number,
  height: number
) {
  const center = new Vector3()
  ellipsoid.getCartographicToPosition(
    (minLat + maxLat) * 0.5,
    (minLon + maxLon) * 0.5,
    height,
    center
  )
  return center
}
