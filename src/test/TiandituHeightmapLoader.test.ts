import { describe, expect, it } from 'vitest'

import {
  createFlatTiandituHeights,
  decodeTiandituElvC,
  decompressTiandituTerrainBuffer,
  TIANDITU_HEIGHTMAP_SIZE
} from '../tiles/TiandituHeightmapLoader'

describe('TiandituHeightmapLoader', () => {
  it('decodes int16 elv_c samples into a 64x64 height grid', () => {
    const source = new Uint8Array(150 * 150 * 2)
    source[0] = 200
    source[1] = 0

    const heights = decodeTiandituElvC(source.buffer)

    expect(heights.length).toBe(TIANDITU_HEIGHTMAP_SIZE * TIANDITU_HEIGHTMAP_SIZE)
    expect(heights[0]).toBe(200)
  })

  it('returns a zero-filled grid for undersized buffers', () => {
    const heights = decodeTiandituElvC(new ArrayBuffer(16))
    expect(Array.from(heights)).toEqual(Array.from(createFlatTiandituHeights()))
  })

  it('decompresses zlib/deflate elv_c payloads used by swdx', async () => {
    if (typeof CompressionStream === 'undefined') return

    const raw = new Uint8Array(150 * 150 * 2)
    raw[0] = 200
    raw[1] = 0
    const compressed = await new Response(
      new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))
    ).arrayBuffer()

    const decompressed = await decompressTiandituTerrainBuffer(compressed)
    expect(decodeTiandituElvC(decompressed)[0]).toBe(200)
  })
})
