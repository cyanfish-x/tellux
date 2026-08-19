import { Matrix4, Vector3 } from "three"
import { WGS84_ELLIPSOID } from "3d-tiles-renderer"
import { describe, expect, it } from "vitest"

const DEG = Math.PI / 180

/** 与 ocean.ts 水面网格相同：OBJECT_FRAME 下的经纬 → 局部 XYZ。 */
function toObjectLocal(
  originLon: number,
  originLat: number,
  lon: number,
  lat: number,
  height = 0
) {
  const origin = new Matrix4()
  WGS84_ELLIPSOID.getObjectFrame(originLat * DEG, originLon * DEG, height, 0, 0, 0, origin)
  const p = new Vector3()
  WGS84_ELLIPSOID.getCartographicToPosition(lat * DEG, lon * DEG, height, p)
  return p.applyMatrix4(origin.clone().invert())
}

function lonLatToTile(lon: number, lat: number, z: number) {
  const n = 2 ** z
  const x = Math.floor(((lon + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  )
  return { z, x, y }
}

function pointInRing(x: number, z: number, ring: Array<{ x: number; z: number }>) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x
    const zi = ring[i].z
    const xj = ring[j].x
    const zj = ring[j].z
    if (zi === zj) continue
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function pointInPolygonRings(x: number, z: number, rings: Array<Array<{ x: number; z: number }>>) {
  let inside = false
  for (const ring of rings) {
    if (pointInRing(x, z, ring)) inside = !inside
  }
  return inside
}

describe("ocean mask object-frame projection", () => {
  const originLon = -76
  const originLat = 36.95

  it("maps east to negative local X and north to positive local Z", () => {
    const east = toObjectLocal(originLon, originLat, originLon + 0.01, originLat)
    const north = toObjectLocal(originLon, originLat, originLon, originLat + 0.01)
    expect(east.x).toBeLessThan(-800)
    expect(Math.abs(east.z)).toBeLessThan(1)
    expect(north.z).toBeGreaterThan(1000)
    expect(Math.abs(north.x)).toBeLessThan(1)
  })
})

describe("OSM water tile addressing", () => {
  it("maps Chesapeake Bay mouth -76,36.95 at z=12 to OpenMapTiles 1183/1594", () => {
    expect(lonLatToTile(-76, 36.95, 12)).toEqual({ z: 12, x: 1183, y: 1594 })
  })
})

describe("OSM water polygon mask", () => {
  it("keeps water and punches island holes with even-odd rings", () => {
    const water = [
      { x: -10, z: -10 },
      { x: 10, z: -10 },
      { x: 10, z: 10 },
      { x: -10, z: 10 },
    ]
    const island = [
      { x: -2, z: -2 },
      { x: 2, z: -2 },
      { x: 2, z: 2 },
      { x: -2, z: 2 },
    ]
    expect(pointInPolygonRings(0, 0, [water, island])).toBe(false)
    expect(pointInPolygonRings(5, 0, [water, island])).toBe(true)
    expect(pointInPolygonRings(20, 0, [water, island])).toBe(false)
  })
})

describe("water SDF encoding", () => {
  it("encodes inside positive and outside negative around 0.5", () => {
    // 中央 4×4 为水，外圈陆地；与 ocean.ts 相同的 0.5± 编码约定。
    const w = 8
    const mask = new Uint8Array(w * w)
    for (let y = 2; y < 6; y++) {
      for (let x = 2; x < 6; x++) mask[y * w + x] = 1
    }
    // 简易距离：内部到边界、外部到边界（曼哈顿够测编码符号）
    const center = mask[4 * w + 4]
    const outside = mask[0]
    expect(center).toBe(1)
    expect(outside).toBe(0)
    const encode = (inside: boolean, distPx: number, spread: number) =>
      0.5 + 0.5 * Math.max(-1, Math.min(1, (inside ? distPx : -distPx) / spread))
    expect(encode(true, 2, 8)).toBeGreaterThan(0.5)
    expect(encode(false, 2, 8)).toBeLessThan(0.5)
    expect(encode(true, 0, 8)).toBeCloseTo(0.5)
  })
})
