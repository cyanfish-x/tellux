const EARTH_RADIUS_METERS = 6378137
const DEG2RAD = Math.PI / 180

export interface ClusterCell {
  key: string
  eastMin: number
  northMin: number
  eastMax: number
  northMax: number
}

export interface ClusterReference {
  longitude: number
  latitude: number
}

export function cartographicOffsetMeters(
  referenceLongitude: number,
  referenceLatitude: number,
  longitude: number,
  latitude: number
) {
  return {
    east:
      (longitude - referenceLongitude) *
      DEG2RAD *
      EARTH_RADIUS_METERS *
      Math.cos(referenceLatitude * DEG2RAD),
    north: (latitude - referenceLatitude) * DEG2RAD * EARTH_RADIUS_METERS
  }
}

export function resolveClusterReference(
  longitudes: number[],
  latitudes: number[]
): ClusterReference {
  if (longitudes.length === 0 || latitudes.length === 0) {
    return { longitude: 0, latitude: 0 }
  }

  let sumLon = 0
  let sumLat = 0
  for (let index = 0; index < longitudes.length; index += 1) {
    sumLon += longitudes[index] ?? 0
    sumLat += latitudes[index] ?? 0
  }

  return {
    longitude: sumLon / longitudes.length,
    latitude: sumLat / latitudes.length
  }
}

export function createClusterCellKey(
  eastMeters: number,
  northMeters: number,
  cellSizeMeters: number
): string {
  const cellX = Math.floor(eastMeters / cellSizeMeters)
  const cellY = Math.floor(northMeters / cellSizeMeters)
  return `${cellX}:${cellY}`
}

export function createClusterCellBounds(
  cellKey: string,
  cellSizeMeters: number
): ClusterCell {
  const [cellXRaw, cellYRaw] = cellKey.split(':')
  const cellX = Number(cellXRaw)
  const cellY = Number(cellYRaw)
  const eastMin = cellX * cellSizeMeters
  const northMin = cellY * cellSizeMeters

  return {
    key: cellKey,
    eastMin,
    northMin,
    eastMax: eastMin + cellSizeMeters,
    northMax: northMin + cellSizeMeters
  }
}

export function clusterCellKeyFromCartographic(
  reference: ClusterReference,
  longitude: number,
  latitude: number,
  cellSizeMeters: number
): string {
  const offset = cartographicOffsetMeters(
    reference.longitude,
    reference.latitude,
    longitude,
    latitude
  )
  return createClusterCellKey(offset.east, offset.north, cellSizeMeters)
}
