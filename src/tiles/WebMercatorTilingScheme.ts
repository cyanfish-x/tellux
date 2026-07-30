export type CartographicBounds = [
  west: number,
  south: number,
  east: number,
  north: number
]

function normalizedToLongitude(value: number) {
  return value * 2 * Math.PI - Math.PI
}

function normalizedToLatitude(value: number) {
  const mercator = value * 2 - 1
  return 2 * Math.atan(Math.exp(mercator * Math.PI)) - Math.PI / 2
}

/**
 * Tellux 内部使用的标准 Web Mercator 四叉树边界适配器。
 *
 * Internal Tellux adapter for standard Web Mercator quadtree bounds.
 */
export class WebMercatorTilingScheme {
  readonly rootTileCountX = 1

  getContentBounds(): CartographicBounds {
    return [
      normalizedToLongitude(0),
      normalizedToLatitude(0),
      normalizedToLongitude(1),
      normalizedToLatitude(1)
    ]
  }

  getTileBounds(x: number, y: number, level: number): CartographicBounds {
    const tileCount = 2 ** level
    const west = x / tileCount
    const south = y / tileCount
    const east = (x + 1) / tileCount
    const north = (y + 1) / tileCount

    return [
      normalizedToLongitude(west),
      normalizedToLatitude(south),
      normalizedToLongitude(east),
      normalizedToLatitude(north)
    ]
  }
}
