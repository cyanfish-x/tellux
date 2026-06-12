import type {
  CartographicCoordinateTuple,
  CesiumIonTerrainOptions,
  SampleHeightMostDetailedResult,
  TerrainOptions,
  UrlTerrainOptions
} from '../types'

const GZIP_ID1 = 0x1f
const GZIP_ID2 = 0x8b
const QUANTIZED_MESH_MAX_VALUE = 32767
const TERRAIN_ACCEPT_HEADER =
  'application/vnd.quantized-mesh,application/octet-stream;q=0.9;extensions=octvertexnormals-watermask-metadata'
const DEFAULT_TERRAIN_VERSION = 1
const TRIANGLE_EPSILON = 1e-7

type QuantizedMeshLayer = {
  tiles: string[]
  projection?: string
  available?: TerrainAvailabilityLevel[] | null
  metadataAvailability?: number
  maxzoom?: number | null
}

type TerrainAvailabilityRange = {
  startX: number
  startY: number
  endX: number
  endY: number
}

type TerrainAvailabilityLevel = TerrainAvailabilityRange[]

type TerrainTileCoordinate = {
  level: number
  x: number
  y: number
}

type TerrainTileData = {
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

type TerrainLayerState = {
  resource: TerrainResource
  layerUrl: string
  layer: QuantizedMeshLayer
  available: Array<TerrainAvailabilityLevel | null>
  loadedMetadataTiles: Set<string>
  metadataAvailability: number
  maxLevel: number
  projection: TerrainProjection
}

type TerrainResource = {
  cacheKey: string
  rootUrl: string
  inheritedSearchParams: URLSearchParams
  headers?: Record<string, string>
  cesiumIon?: CesiumIonTerrainResource
}

type CesiumIonTerrainResource = {
  endpointUrl: string
  apiToken: string
  autoRefreshToken: boolean
}

type CesiumIonTerrainEndpoint = {
  type?: string
  url?: string
  accessToken?: string
}

type TerrainProjection = {
  scheme: string
  rootTileX: number
  rootTileY: number
}

type TerrainSampleRequest = {
  index: number
  position: CartographicCoordinateTuple
  coordinate: TerrainTileCoordinate
}

type TypedArrayConstructor<T extends Uint8Array | Uint16Array | Uint32Array> = {
  new(buffer: ArrayBuffer, byteOffset: number, length: number): T
  BYTES_PER_ELEMENT: number
}

type QuantizedMeshIndexArray = Uint16Array | Uint32Array

/**
 * Samples Cesium quantized-mesh terrain directly from `layer.json` and `.terrain`
 * buffers. This avoids creating a hidden TilesRenderer, so terrain-only most
 * detailed sampling is driven by terrain availability instead of camera traversal.
 */
export class QuantizedMeshTerrainSampler {
  private readonly layerCache = new Map<string, Promise<TerrainLayerState>>()
  private readonly tileCache = new Map<string, Promise<TerrainTileData>>()

  async sampleMostDetailed(
    terrain: TerrainOptions,
    positions: CartographicCoordinateTuple[]
  ): Promise<SampleHeightMostDetailedResult[]> {
    const results: SampleHeightMostDetailedResult[] = new Array(positions.length).fill(undefined)
    if (positions.length === 0) return results

    const state = await this.getLayerState(terrain)
    const requests = await Promise.all(
      positions.map(async (position, index): Promise<TerrainSampleRequest | null> => {
        const coordinate = await this.findMostDetailedTileForPosition(state, position)
        return coordinate ? { index, position, coordinate } : null
      })
    )

    const groupedRequests = new Map<string, TerrainSampleRequest[]>()
    requests.forEach((request) => {
      if (!request) return

      const key = this.getTileKey(state, request.coordinate)
      const group = groupedRequests.get(key)
      if (group) {
        group.push(request)
      } else {
        groupedRequests.set(key, [request])
      }
    })

    await Promise.all(
      Array.from(groupedRequests.values()).map(async (group) => {
        const tile = await this.getTerrainTile(state, group[0].coordinate)
        group.forEach((request) => {
          const height = this.interpolateHeight(tile, request.position)
          if (height !== undefined) {
            results[request.index] = [request.position[0], request.position[1], height]
          }
        })
      })
    )

    return results
  }

  clear() {
    this.layerCache.clear()
    this.tileCache.clear()
  }

  private getLayerState(terrain: TerrainOptions) {
    const cacheKey = this.getTerrainCacheKey(terrain)
    let promise = this.layerCache.get(cacheKey)
    if (!promise) {
      promise = this.loadLayerState(terrain)
      this.layerCache.set(cacheKey, promise)
    }

    return promise
  }

  private async loadLayerState(terrain: TerrainOptions): Promise<TerrainLayerState> {
    const resource = await this.resolveTerrainResource(terrain)
    const layerUrl = this.preprocessTerrainUrl(
      new URL('layer.json', resource.rootUrl),
      resource.inheritedSearchParams
    )
    const response = await this.fetchTerrainResource(resource, layerUrl)
    if (!response.ok) {
      throw new Error(`Tellux terrain sampler: failed to load layer.json (${response.status} ${response.statusText}).`)
    }

    const layer = await response.json() as QuantizedMeshLayer
    if (!layer.tiles?.length) {
      throw new Error('Tellux terrain sampler: layer.json does not contain terrain tile templates.')
    }

    const available = (layer.available ?? []).map((level) => level ?? null)
    const projection = this.createProjection(layer.projection ?? 'EPSG:4326')
    const maxLevel = layer.maxzoom ?? Math.max(available.length - 1, 0)

    return {
      resource,
      layerUrl,
      layer,
      available,
      loadedMetadataTiles: new Set(),
      metadataAvailability: layer.metadataAvailability ?? -1,
      maxLevel,
      projection
    }
  }

  private async resolveTerrainResource(terrain: TerrainOptions): Promise<TerrainResource> {
    if (this.isCesiumIonTerrainOptions(terrain)) {
      return this.resolveCesiumIonTerrainResource(terrain)
    }

    return this.resolveUrlTerrainResource(terrain)
  }

  private resolveUrlTerrainResource(terrain: UrlTerrainOptions): TerrainResource {
    const rootUrl = this.normalizeTerrainRootUrl(terrain.url)
    return {
      cacheKey: rootUrl,
      rootUrl,
      inheritedSearchParams: new URL(terrain.url, location.href).searchParams
    }
  }

  private async resolveCesiumIonTerrainResource(terrain: CesiumIonTerrainOptions): Promise<TerrainResource> {
    const endpointUrl = this.getCesiumIonEndpointUrl(terrain)
    const endpoint = await this.fetchCesiumIonTerrainEndpoint(endpointUrl, terrain.apiToken)
    const resource: TerrainResource = {
      cacheKey: this.getTerrainCacheKey(terrain),
      rootUrl: '',
      inheritedSearchParams: new URLSearchParams(),
      cesiumIon: {
        endpointUrl,
        apiToken: terrain.apiToken,
        autoRefreshToken: terrain.autoRefreshToken ?? true
      }
    }

    this.applyCesiumIonTerrainEndpoint(resource, endpoint)
    return resource
  }

  private async fetchTerrainResource(
    resource: TerrainResource,
    url: string,
    options: RequestInit = {}
  ) {
    let response = await fetch(url, this.createTerrainRequestOptions(resource, options))
    if (!this.shouldRefreshCesiumIonTerrainResource(resource, response)) {
      return response
    }

    await this.refreshCesiumIonTerrainResource(resource)
    response = await fetch(url, this.createTerrainRequestOptions(resource, options))
    return response
  }

  private createTerrainRequestOptions(resource: TerrainResource, options: RequestInit) {
    const headers = new Headers(resource.headers)
    new Headers(options.headers).forEach((value, key) => {
      headers.set(key, value)
    })

    return {
      ...options,
      headers
    }
  }

  private shouldRefreshCesiumIonTerrainResource(resource: TerrainResource, response: Response) {
    return (
      resource.cesiumIon?.autoRefreshToken === true &&
      response.status >= 400 &&
      response.status <= 499
    )
  }

  private async refreshCesiumIonTerrainResource(resource: TerrainResource) {
    if (!resource.cesiumIon) return

    const endpoint = await this.fetchCesiumIonTerrainEndpoint(
      resource.cesiumIon.endpointUrl,
      resource.cesiumIon.apiToken
    )
    this.applyCesiumIonTerrainEndpoint(resource, endpoint)
  }

  private async fetchCesiumIonTerrainEndpoint(endpointUrl: string, apiToken: string): Promise<CesiumIonTerrainEndpoint> {
    const url = new URL(endpointUrl)
    url.searchParams.set('access_token', apiToken)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Tellux terrain sampler: failed to load Cesium Ion terrain endpoint (${response.status} ${response.statusText}).`)
    }

    const endpoint = await response.json() as CesiumIonTerrainEndpoint
    if (endpoint.type !== 'TERRAIN') {
      throw new Error(`Tellux terrain sampler: Cesium Ion asset type "${endpoint.type}" is not supported by terrain sampling.`)
    }
    if (typeof endpoint.url !== 'string' || endpoint.url.length === 0) {
      throw new Error('Tellux terrain sampler: Cesium Ion terrain endpoint does not contain a terrain URL.')
    }
    if (typeof endpoint.accessToken !== 'string' || endpoint.accessToken.length === 0) {
      throw new Error('Tellux terrain sampler: Cesium Ion terrain endpoint does not contain an access token.')
    }

    return endpoint
  }

  private applyCesiumIonTerrainEndpoint(
    resource: TerrainResource,
    endpoint: CesiumIonTerrainEndpoint
  ) {
    resource.rootUrl = this.normalizeTerrainRootUrl(endpoint.url!)
    resource.inheritedSearchParams = new URL(endpoint.url!, location.href).searchParams
    resource.headers = {
      Authorization: `Bearer ${endpoint.accessToken}`
    }
  }

  private async findMostDetailedTileForPosition(
    state: TerrainLayerState,
    position: CartographicCoordinateTuple
  ): Promise<TerrainTileCoordinate | null> {
    let current = this.findDeepestKnownAvailableTile(state, position)
    if (!current) return null

    let availabilityChanged = true
    while (availabilityChanged && current.level < state.maxLevel) {
      availabilityChanged = false
      const deepestKnownLevel = current.level

      for (let level = 0; level <= deepestKnownLevel; level += 1) {
        const metadataCoordinate = this.getTileAtPosition(state.projection, position, level)
        if (!this.isTileAvailable(state, metadataCoordinate)) continue
        if (!this.tileShouldHaveMetadata(state, metadataCoordinate)) continue

        const metadataKey = this.getCoordinateKey(metadataCoordinate)
        if (state.loadedMetadataTiles.has(metadataKey)) continue

        state.loadedMetadataTiles.add(metadataKey)
        const tile = await this.getTerrainTile(state, metadataCoordinate)
        if (tile.metadata?.available) {
          this.mergeAvailability(state, metadataCoordinate.level, tile.metadata.available)
          availabilityChanged = true
        }
      }

      const next = this.findDeepestKnownAvailableTile(state, position)
      if (next && next.level > current.level) {
        current = next
        availabilityChanged = true
      }
    }

    return current
  }

  private findDeepestKnownAvailableTile(
    state: TerrainLayerState,
    position: CartographicCoordinateTuple,
    minLevel = 0
  ): TerrainTileCoordinate | null {
    for (let level = state.maxLevel; level >= minLevel; level -= 1) {
      const coordinate = this.getTileAtPosition(state.projection, position, level)
      if (this.isTileAvailable(state, coordinate)) {
        return coordinate
      }
    }

    for (let level = Math.min(minLevel - 1, state.maxLevel); level >= 0; level -= 1) {
      const coordinate = this.getTileAtPosition(state.projection, position, level)
      if (this.isTileAvailable(state, coordinate)) {
        return coordinate
      }
    }

    return null
  }

  private isTileAvailable(state: TerrainLayerState, coordinate: TerrainTileCoordinate) {
    const available = state.available[coordinate.level]
    if (available) {
      return available.some((range) => (
        coordinate.x >= range.startX &&
        coordinate.x <= range.endX &&
        coordinate.y >= range.startY &&
        coordinate.y <= range.endY
      ))
    }

    return state.layer.available == null && coordinate.level === 0
  }

  private tileShouldHaveMetadata(state: TerrainLayerState, coordinate: TerrainTileCoordinate) {
    return (
      coordinate.level < state.maxLevel &&
      state.metadataAvailability !== -1 &&
      coordinate.level % state.metadataAvailability === 0
    )
  }

  private mergeAvailability(
    state: TerrainLayerState,
    tileLevel: number,
    available: TerrainAvailabilityLevel[]
  ) {
    available.forEach((levelAvailability, index) => {
      const level = tileLevel + 1 + index
      if (!levelAvailability || level > state.maxLevel) return

      const target = state.available[level]
      if (target) {
        target.push(...levelAvailability)
      } else {
        state.available[level] = [...levelAvailability]
      }
    })
  }

  private getTerrainTile(state: TerrainLayerState, coordinate: TerrainTileCoordinate) {
    const key = this.getTileKey(state, coordinate)
    let promise = this.tileCache.get(key)
    if (!promise) {
      promise = this.loadTerrainTile(state, coordinate)
      this.tileCache.set(key, promise)
    }

    return promise
  }

  private async loadTerrainTile(
    state: TerrainLayerState,
    coordinate: TerrainTileCoordinate
  ): Promise<TerrainTileData> {
    const url = this.preprocessTerrainUrl(
      new URL(this.getContentUrl(state.layer, coordinate), state.layerUrl),
      state.resource.inheritedSearchParams
    )
    const response = await this.fetchTerrainResource(state.resource, url, {
      headers: {
        Accept: TERRAIN_ACCEPT_HEADER
      }
    })
    if (!response.ok) {
      throw new Error(`Tellux terrain sampler: failed to load terrain tile ${coordinate.level}/${coordinate.x}/${coordinate.y}.`)
    }

    const buffer = await this.getTerrainArrayBuffer(response)
    return {
      coordinate,
      bounds: this.getTileBounds(state.projection, coordinate),
      ...this.parseQuantizedMesh(buffer)
    }
  }

  private async getTerrainArrayBuffer(response: Response) {
    const buffer = await response.arrayBuffer()
    if (!this.isGzip(buffer)) return buffer

    if (typeof DecompressionStream === 'undefined') {
      throw new Error(
        'Tellux terrain sampler: received gzip-compressed .terrain bytes without Content-Encoding: gzip, but this browser does not support DecompressionStream.'
      )
    }

    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
    return new Response(stream).arrayBuffer()
  }

  private parseQuantizedMesh(buffer: ArrayBuffer): Omit<TerrainTileData, 'coordinate' | 'bounds'> {
    let pointer = 0
    const view = new DataView(buffer)
    const readFloat64 = () => {
      const result = view.getFloat64(pointer, true)
      pointer += 8
      return result
    }
    const readFloat32 = () => {
      const result = view.getFloat32(pointer, true)
      pointer += 4
      return result
    }
    const readUint32 = () => {
      const result = view.getUint32(pointer, true)
      pointer += 4
      return result
    }
    const readUint8 = () => {
      const result = view.getUint8(pointer)
      pointer += 1
      return result
    }
    const skipBytes = (count: number) => {
      pointer += count
    }
    const readBuffer = <T extends Uint8Array | Uint16Array | Uint32Array>(
      count: number,
      type: TypedArrayConstructor<T>
    ) => {
      const result = new type(buffer, pointer, count)
      pointer += count * type.BYTES_PER_ELEMENT
      return result
    }
    const readIndexBuffer = (count: number, is32Bit: boolean): QuantizedMeshIndexArray => {
      return is32Bit ? readBuffer(count, Uint32Array) : readBuffer(count, Uint16Array)
    }

    readFloat64()
    readFloat64()
    readFloat64()
    const minHeight = readFloat32()
    const maxHeight = readFloat32()
    readFloat64()
    readFloat64()
    readFloat64()
    readFloat64()
    readFloat64()
    readFloat64()
    readFloat64()

    const vertexCount = readUint32()
    const uBuffer = readBuffer(vertexCount, Uint16Array)
    const vBuffer = readBuffer(vertexCount, Uint16Array)
    const hBuffer = readBuffer(vertexCount, Uint16Array)
    const uResult = new Float32Array(vertexCount)
    const vResult = new Float32Array(vertexCount)
    const hResult = new Float32Array(vertexCount)
    let u = 0
    let v = 0
    let h = 0

    for (let index = 0; index < vertexCount; index += 1) {
      u += this.zigZagDecode(uBuffer[index])
      v += this.zigZagDecode(vBuffer[index])
      h += this.zigZagDecode(hBuffer[index])
      uResult[index] = u / QUANTIZED_MESH_MAX_VALUE
      vResult[index] = v / QUANTIZED_MESH_MAX_VALUE
      hResult[index] = h / QUANTIZED_MESH_MAX_VALUE
    }

    const is32BitIndex = vertexCount > 65536
    const indexBufferBytesPerElement = is32BitIndex ? Uint32Array.BYTES_PER_ELEMENT : Uint16Array.BYTES_PER_ELEMENT
    pointer = Math.ceil(pointer / indexBufferBytesPerElement) * indexBufferBytesPerElement

    const triangleCount = readUint32()
    const indices = readIndexBuffer(triangleCount * 3, is32BitIndex)
    let highest = 0
    for (let index = 0; index < indices.length; index += 1) {
      const code = indices[index]
      indices[index] = highest - code
      if (code === 0) highest += 1
    }

    this.skipEdgeIndices(readUint32, readIndexBuffer, is32BitIndex)
    const metadata = this.readQuantizedMeshMetadata(view, () => pointer, skipBytes, readUint8, readUint32, readBuffer)

    return {
      header: {
        minHeight,
        maxHeight
      },
      indices,
      vertexData: {
        u: uResult,
        v: vResult,
        height: hResult
      },
      metadata
    }
  }

  private skipEdgeIndices(
    readUint32: () => number,
    readIndexBuffer: (count: number, is32Bit: boolean) => QuantizedMeshIndexArray,
    is32BitIndex: boolean
  ) {
    readIndexBuffer(readUint32(), is32BitIndex)
    readIndexBuffer(readUint32(), is32BitIndex)
    readIndexBuffer(readUint32(), is32BitIndex)
    readIndexBuffer(readUint32(), is32BitIndex)
  }

  private readQuantizedMeshMetadata(
    view: DataView,
    getPointer: () => number,
    skipBytes: (count: number) => void,
    readUint8: () => number,
    readUint32: () => number,
    readBuffer: <T extends Uint8Array | Uint16Array | Uint32Array>(
      count: number,
      type: TypedArrayConstructor<T>
    ) => T
  ): TerrainTileData['metadata'] {
    let metadata: TerrainTileData['metadata']
    while (getPointer() + 5 <= view.byteLength) {
      const extensionId = readUint8()
      const extensionLength = readUint32()
      const extensionEnd = getPointer() + extensionLength
      if (extensionId === 1 || extensionId === 2) {
        readBuffer(extensionLength, Uint8Array)
      } else if (extensionId === 4) {
        const jsonLength = readUint32()
        const jsonBuffer = readBuffer(jsonLength, Uint8Array)
        metadata = JSON.parse(new TextDecoder().decode(jsonBuffer))
      } else {
        readBuffer(extensionLength, Uint8Array)
      }

      const remainingBytes = extensionEnd - getPointer()
      if (remainingBytes > 0) {
        skipBytes(remainingBytes)
      }
    }

    return metadata
  }

  private interpolateHeight(tile: TerrainTileData, position: CartographicCoordinateTuple) {
    const [longitude, latitude] = position
    const [west, south, east, north] = tile.bounds
    const u = (longitude * Math.PI / 180 - west) / (east - west)
    const v = (latitude * Math.PI / 180 - south) / (north - south)

    if (!Number.isFinite(u) || !Number.isFinite(v)) return undefined

    const { indices, vertexData, header } = tile
    let nearestHeight: number | undefined
    let nearestDistance = Infinity

    for (let index = 0; index < indices.length; index += 3) {
      const i0 = indices[index]
      const i1 = indices[index + 1]
      const i2 = indices[index + 2]
      const u0 = vertexData.u[i0]
      const v0 = vertexData.v[i0]
      const u1 = vertexData.u[i1]
      const v1 = vertexData.v[i1]
      const u2 = vertexData.u[i2]
      const v2 = vertexData.v[i2]
      const barycentric = this.getBarycentricCoordinates(u, v, u0, v0, u1, v1, u2, v2)

      if (barycentric) {
        return this.lerpHeight(header, (
          barycentric.w0 * vertexData.height[i0] +
          barycentric.w1 * vertexData.height[i1] +
          barycentric.w2 * vertexData.height[i2]
        ))
      }

      const distance = this.getPointToTriangleAabbDistanceSq(u, v, u0, v0, u1, v1, u2, v2)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestHeight = this.lerpHeight(header, (
          vertexData.height[i0] +
          vertexData.height[i1] +
          vertexData.height[i2]
        ) / 3)
      }
    }

    return nearestHeight
  }

  private getBarycentricCoordinates(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number
  ) {
    const v0x = bx - ax
    const v0y = by - ay
    const v1x = cx - ax
    const v1y = cy - ay
    const v2x = px - ax
    const v2y = py - ay
    const denominator = v0x * v1y - v1x * v0y
    if (Math.abs(denominator) < Number.EPSILON) return null

    const w1 = (v2x * v1y - v1x * v2y) / denominator
    const w2 = (v0x * v2y - v2x * v0y) / denominator
    const w0 = 1 - w1 - w2

    return (
      w0 >= -TRIANGLE_EPSILON &&
      w1 >= -TRIANGLE_EPSILON &&
      w2 >= -TRIANGLE_EPSILON
    ) ? { w0, w1, w2 } : null
  }

  private getPointToTriangleAabbDistanceSq(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number
  ) {
    const minX = Math.min(ax, bx, cx)
    const maxX = Math.max(ax, bx, cx)
    const minY = Math.min(ay, by, cy)
    const maxY = Math.max(ay, by, cy)
    const dx = px < minX ? minX - px : px > maxX ? px - maxX : 0
    const dy = py < minY ? minY - py : py > maxY ? py - maxY : 0
    return dx * dx + dy * dy
  }

  private lerpHeight(header: TerrainTileData['header'], normalizedHeight: number) {
    return header.minHeight + (header.maxHeight - header.minHeight) * normalizedHeight
  }

  private getTileAtPosition(
    projection: TerrainProjection,
    position: CartographicCoordinateTuple,
    level: number
  ): TerrainTileCoordinate {
    const normalizedX = this.longitudeToNormalized(position[0] * Math.PI / 180)
    const normalizedY = this.latitudeToNormalized(position[1] * Math.PI / 180, projection.scheme)
    const tileCountX = projection.rootTileX * 2 ** level
    const tileCountY = projection.rootTileY * 2 ** level
    const x = this.clamp(Math.floor(normalizedX * tileCountX), 0, tileCountX - 1)
    const y = this.clamp(Math.floor(normalizedY * tileCountY), 0, tileCountY - 1)
    return { level, x, y }
  }

  private getTileBounds(
    projection: TerrainProjection,
    coordinate: TerrainTileCoordinate
  ): [west: number, south: number, east: number, north: number] {
    const tileCountX = projection.rootTileX * 2 ** coordinate.level
    const tileCountY = projection.rootTileY * 2 ** coordinate.level
    const westNormalized = coordinate.x / tileCountX
    const eastNormalized = (coordinate.x + 1) / tileCountX
    const southNormalized = coordinate.y / tileCountY
    const northNormalized = (coordinate.y + 1) / tileCountY

    return [
      this.normalizedToLongitude(westNormalized),
      this.normalizedToLatitude(southNormalized, projection.scheme),
      this.normalizedToLongitude(eastNormalized),
      this.normalizedToLatitude(northNormalized, projection.scheme)
    ]
  }

  private createProjection(scheme: string): TerrainProjection {
    switch (scheme) {
      case 'CRS:84':
      case 'EPSG:4326':
        return { scheme, rootTileX: 2, rootTileY: 1 }
      case 'EPSG:3857':
        return { scheme, rootTileX: 1, rootTileY: 1 }
      default:
        throw new Error(`Tellux terrain sampler: unsupported terrain projection "${scheme}".`)
    }
  }

  private getContentUrl(layer: QuantizedMeshLayer, coordinate: TerrainTileCoordinate) {
    return layer.tiles[0]
      .replace(/{\s*z\s*}/g, String(coordinate.level))
      .replace(/{\s*x\s*}/g, String(coordinate.x))
      .replace(/{\s*y\s*}/g, String(coordinate.y))
      .replace(/{\s*version\s*}/g, String(DEFAULT_TERRAIN_VERSION))
  }

  private getTileKey(state: TerrainLayerState, coordinate: TerrainTileCoordinate) {
    return `${state.resource.cacheKey}|${this.getCoordinateKey(coordinate)}`
  }

  private getCoordinateKey(coordinate: TerrainTileCoordinate) {
    return `${coordinate.level}/${coordinate.x}/${coordinate.y}`
  }

  private preprocessTerrainUrl(url: URL, inheritedSearchParams: URLSearchParams) {
    inheritedSearchParams.forEach((value, key) => {
      if (!url.searchParams.has(key)) {
        url.searchParams.set(key, value)
      }
    })

    return url.toString()
  }

  private getTerrainCacheKey(terrain: TerrainOptions) {
    if (this.isCesiumIonTerrainOptions(terrain)) {
      return [
        'cesium-ion',
        String(terrain.assetId),
        terrain.apiToken,
        terrain.autoRefreshToken ?? true
      ].join(':')
    }

    return this.normalizeTerrainRootUrl(terrain.url)
  }

  private getCesiumIonEndpointUrl(terrain: CesiumIonTerrainOptions) {
    return `https://api.cesium.com/v1/assets/${encodeURIComponent(String(terrain.assetId))}/endpoint`
  }

  private isCesiumIonTerrainOptions(terrain: TerrainOptions): terrain is CesiumIonTerrainOptions {
    return terrain.type === 'cesium-ion'
  }

  private normalizeTerrainRootUrl(url: string) {
    const terrainUrl = new URL(url, location.href)
    if (terrainUrl.pathname.endsWith('/layer.json')) {
      terrainUrl.pathname = terrainUrl.pathname.slice(0, -'layer.json'.length)
    } else if (!terrainUrl.pathname.endsWith('/')) {
      terrainUrl.pathname += '/'
    }

    return terrainUrl.toString()
  }

  private longitudeToNormalized(longitude: number) {
    return (longitude + Math.PI) / (2 * Math.PI)
  }

  private normalizedToLongitude(normalized: number) {
    return normalized * 2 * Math.PI - Math.PI
  }

  private latitudeToNormalized(latitude: number, scheme: string) {
    if (scheme === 'EPSG:3857') {
      const clampedLatitude = this.clamp(latitude, -Math.PI / 2 + 1e-10, Math.PI / 2 - 1e-10)
      return 0.5 + Math.log(Math.tan(Math.PI / 4 + clampedLatitude / 2)) / (2 * Math.PI)
    }

    return (latitude + Math.PI / 2) / Math.PI
  }

  private normalizedToLatitude(normalized: number, scheme: string) {
    if (scheme === 'EPSG:3857') {
      return 2 * Math.atan(Math.exp((normalized * 2 - 1) * Math.PI)) - Math.PI / 2
    }

    return normalized * Math.PI - Math.PI / 2
  }

  private zigZagDecode(value: number) {
    return (value >> 1) ^ (-(value & 1))
  }

  private isGzip(buffer: ArrayBuffer) {
    if (buffer.byteLength < 2) return false

    const bytes = new Uint8Array(buffer, 0, 2)
    return bytes[0] === GZIP_ID1 && bytes[1] === GZIP_ID2
  }

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value))
  }
}
