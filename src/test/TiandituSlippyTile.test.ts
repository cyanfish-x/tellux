import { describe, expect, it } from 'vitest'

import { lonLatToTiandituTileXY, parseTiandituServiceError } from '../tiles/TiandituSlippyTile'

describe('TiandituSlippyTile', () => {
  it('maps Chengdu to expected zoom-7 tile coordinates', () => {
    const lon = (103.51293447705049 * Math.PI) / 180
    const lat = (30.755465691598996 * Math.PI) / 180
    const tile = lonLatToTiandituTileXY(lon, lat, 7)

    expect(tile.x).toBe(100)
    expect(tile.y).toBeGreaterThanOrEqual(50)
    expect(tile.y).toBeLessThanOrEqual(60)
  })

  it('parses Tianditu JSON error payloads', () => {
    const buffer = new TextEncoder().encode(
      JSON.stringify({ code: 301018, msg: '权限类型错误', resolve: '不支持的key类型！' })
    )

    expect(parseTiandituServiceError(buffer.buffer)).toBe(
      '[301018] 权限类型错误：不支持的key类型！'
    )
  })
})
