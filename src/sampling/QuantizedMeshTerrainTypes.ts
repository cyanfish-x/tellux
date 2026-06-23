export type QuantizedMeshLayer = {
  tiles: string[]
  projection?: string
  available?: TerrainAvailabilityLevel[] | null
  metadataAvailability?: number
  maxzoom?: number | null
}

export type TerrainAvailabilityRange = {
  startX: number
  startY: number
  endX: number
  endY: number
}

export type TerrainAvailabilityLevel = TerrainAvailabilityRange[]

export type TerrainTileCoordinate = {
  level: number
  x: number
  y: number
}

export type TerrainTileData = {
  coordinate: TerrainTileCoordinate
  bounds: [west: number, south: number, east: number, north: number]
  header: {
    minHeight: number
    maxHeight: number
  }
  indices: Uint16Array | Uint32Array
  vertexData: {
    u: Float32Array
    v: Float32Array
    height: Float32Array
  }
  metadata?: {
    available?: TerrainAvailabilityLevel[]
  }
}

export type TerrainLayerState = {
  resource: TerrainResource
  layerUrl: string
  layer: QuantizedMeshLayer
  available: Array<TerrainAvailabilityLevel | null>
  loadedMetadataTiles: Set<string>
  metadataAvailability: number
  maxLevel: number
  projection: TerrainProjection
}

export type TerrainResource = {
  cacheKey: string
  rootUrl: string
  inheritedSearchParams: URLSearchParams
  headers?: Record<string, string>
  cesiumIon?: CesiumIonTerrainResource
}

export type CesiumIonTerrainResource = {
  endpointUrl: string
  apiToken: string
  autoRefreshToken: boolean
}

export type CesiumIonTerrainEndpoint = {
  type?: string
  url?: string
  accessToken?: string
}

export type TerrainProjection = {
  scheme: string
  rootTileX: number
  rootTileY: number
}
