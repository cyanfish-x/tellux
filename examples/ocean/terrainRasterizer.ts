export interface TerrainRasterizerInput {
  size: number
  positions: Float32Array
  uvs: Float32Array
  indices: Uint16Array | Uint32Array
  indexStart: number
  indexCount: number
  matrix: readonly number[]
}

export interface TerrainRasterizerResult {
  heights: Float32Array
  validity: Uint8Array
}

export function rasterizeTerrainPage(input: TerrainRasterizerInput): TerrainRasterizerResult {
  const count = input.size * input.size
  const heights = new Float32Array(count)
  const weights = new Uint16Array(count)
  const end = Math.min(input.indexStart + input.indexCount, input.indices.length)
  for (let offset = input.indexStart; offset + 2 < end; offset += 3) {
    const a = readVertex(input, input.indices[offset])
    const b = readVertex(input, input.indices[offset + 1])
    const c = readVertex(input, input.indices[offset + 2])
    rasterizeTriangle(input.size, a, b, c, heights, weights)
  }

  const validity = new Uint8Array(count)
  for (let index = 0; index < count; index += 1) {
    if (weights[index] === 0) continue
    heights[index] /= weights[index]
    validity[index] = 1
  }
  return { heights, validity }
}

type RasterVertex = { u: number, v: number, height: number }

function readVertex(input: TerrainRasterizerInput, index: number): RasterVertex {
  const positionOffset = index * 3
  const x = input.positions[positionOffset]
  const y = input.positions[positionOffset + 1]
  const z = input.positions[positionOffset + 2]
  const matrix = input.matrix
  return {
    u: input.uvs[index * 2],
    v: input.uvs[index * 2 + 1],
    height: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]
  }
}

function rasterizeTriangle(
  size: number,
  a: RasterVertex,
  b: RasterVertex,
  c: RasterVertex,
  heights: Float32Array,
  weights: Uint16Array
) {
  const denominator = (b.v - c.v) * (a.u - c.u) + (c.u - b.u) * (a.v - c.v)
  if (Math.abs(denominator) < 1e-12) return
  const scale = size - 1
  const minX = clamp(Math.floor(Math.min(a.u, b.u, c.u) * scale), 0, scale)
  const maxX = clamp(Math.ceil(Math.max(a.u, b.u, c.u) * scale), 0, scale)
  const minY = clamp(Math.floor(Math.min(a.v, b.v, c.v) * scale), 0, scale)
  const maxY = clamp(Math.ceil(Math.max(a.v, b.v, c.v) * scale), 0, scale)
  for (let y = minY; y <= maxY; y += 1) {
    const v = y / scale
    for (let x = minX; x <= maxX; x += 1) {
      const u = x / scale
      const wa = ((b.v - c.v) * (u - c.u) + (c.u - b.u) * (v - c.v)) / denominator
      const wb = ((c.v - a.v) * (u - c.u) + (a.u - c.u) * (v - c.v)) / denominator
      const wc = 1 - wa - wb
      if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue
      const index = y * size + x
      heights[index] += wa * a.height + wb * b.height + wc * c.height
      weights[index] += 1
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
