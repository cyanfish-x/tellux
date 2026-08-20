export interface TerrainHeightPage {
  id: string
  parentId: string | null
  sourceRevision: number
  depth: number
  rectangle: { west: number, south: number, east: number, north: number }
  size: number
  heights: Float32Array
  validity: Uint8Array
  loadedAt: number
}

export interface TerrainFieldClipmapOptions {
  maxBytes: number
  blendSeconds: number
}

type StoredPage = TerrainHeightPage & {
  lastUsed: number
  bytes: number
}

export class TerrainFieldClipmap {
  private readonly pages = new Map<string, StoredPage>()
  private useCounter = 0
  private byteLength = 0

  constructor(private readonly options: TerrainFieldClipmapOptions) {}

  get pageCount() {
    return this.pages.size
  }

  get bytes() {
    return this.byteLength
  }

  upsert(page: TerrainHeightPage) {
    const previous = this.pages.get(page.id)
    if (previous) this.byteLength -= previous.bytes
    const bytes = page.heights.byteLength + page.validity.byteLength
    this.pages.set(page.id, { ...page, bytes, lastUsed: ++this.useCounter })
    this.byteLength += bytes
    this.evictToBudget()
  }

  clear() {
    this.pages.clear()
    this.byteLength = 0
  }

  sample(longitude: number, latitude: number, nowSeconds: number) {
    const candidates = [...this.pages.values()]
      .filter((page) => contains(page.rectangle, longitude, latitude))
      .sort((a, b) => b.depth - a.depth || b.loadedAt - a.loadedAt)

    for (const page of candidates) {
      const height = samplePage(page, longitude, latitude)
      if (height === null) continue
      page.lastUsed = ++this.useCounter
      const parent = page.parentId ? this.pages.get(page.parentId) : undefined
      const parentHeight = parent ? samplePage(parent, longitude, latitude) : null
      const blendSeconds = Math.max(this.options.blendSeconds, 0)
      const alpha = blendSeconds === 0
        ? 1
        : clamp((nowSeconds - page.loadedAt) / blendSeconds, 0, 1)
      return {
        height: parentHeight === null ? height : lerp(parentHeight, height, alpha),
        depth: page.depth,
        pageId: page.id,
        blend: parentHeight === null ? 1 : alpha
      }
    }
    return null
  }

  private evictToBudget() {
    while (this.byteLength > this.options.maxBytes && this.pages.size > 0) {
      let oldest: StoredPage | undefined
      for (const page of this.pages.values()) {
        if (!oldest || page.lastUsed < oldest.lastUsed) oldest = page
      }
      if (!oldest) break
      this.pages.delete(oldest.id)
      this.byteLength -= oldest.bytes
    }
  }
}

function contains(rectangle: TerrainHeightPage['rectangle'], longitude: number, latitude: number) {
  const longitudeInside = rectangle.west <= rectangle.east
    ? longitude >= rectangle.west && longitude <= rectangle.east
    : longitude >= rectangle.west || longitude <= rectangle.east
  return longitudeInside && latitude >= rectangle.south && latitude <= rectangle.north
}

function samplePage(page: TerrainHeightPage, longitude: number, latitude: number) {
  const longitudeSpan = page.rectangle.west <= page.rectangle.east
    ? page.rectangle.east - page.rectangle.west
    : page.rectangle.east + 360 - page.rectangle.west
  const normalizedLongitude = longitude < page.rectangle.west && page.rectangle.west > page.rectangle.east
    ? longitude + 360
    : longitude
  const u = clamp((normalizedLongitude - page.rectangle.west) / longitudeSpan, 0, 1)
  const v = clamp((latitude - page.rectangle.south) / (page.rectangle.north - page.rectangle.south), 0, 1)
  const x = u * (page.size - 1)
  const y = v * (page.size - 1)
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(x0 + 1, page.size - 1)
  const y1 = Math.min(y0 + 1, page.size - 1)
  const indices = [y0 * page.size + x0, y0 * page.size + x1, y1 * page.size + x0, y1 * page.size + x1]
  if (indices.some((index) => page.validity[index] === 0)) return null
  const tx = x - x0
  const ty = y - y0
  const top = lerp(page.heights[indices[0]], page.heights[indices[1]], tx)
  const bottom = lerp(page.heights[indices[2]], page.heights[indices[3]], tx)
  return lerp(top, bottom, ty)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
