/**
 * gpuocean 第 2 组：Coast 弧长表 / ChainSim / shore ribbon / film foam。
 * 供 ocean.ts 使用；Sandcastle 会内联本文件（见 expandLocalLibImports）。
 */
import * as THREE from "three"

export const SLOPE = 0.15
export const REST_DEPTH = 0.25
export const MAIN_COLS = 160
export const ISLAND_COLS = 96
export const SIM_COLS = 256
export const SIM_NODES = 64
export const SIM_SPAN = 24
export const SIM_BAND = 4
export const MAIN_TABLE_N = 2048
export const MAIN_TABLE_STEP = 0.8
/** 原版 authored coast 常量：SDF 烘焙范围与远场直线岸线。 */
const SDF_SIZE = 512
const SDF_EXTENT = 384
const BASE_SHORE_X = 10
export const RIBBON_SPAN = 28
export const RIBBON_CELLS = 140
export const FOAM_RISE = 0.08
/** 与 ocean.ts GRID_N 一致：ribbon 沿岸行复用 warp 格。 */
export const RIBBON_GRID_N = 512
const RIBBON_WARP_CELL = 0.4
const RIBBON_LINEAR_CELLS = 160
const RIBBON_CELL_GROWTH = 1.12

function ribbonWarpAxis(i: number) {
  const a = Math.abs(i)
  const sign = Math.sign(i) || 0
  if (a <= RIBBON_LINEAR_CELLS) return sign * a * RIBBON_WARP_CELL
  return (
    sign *
    (RIBBON_LINEAR_CELLS * RIBBON_WARP_CELL +
      (RIBBON_WARP_CELL * (RIBBON_CELL_GROWTH ** (a - RIBBON_LINEAR_CELLS) - 1)) /
        (RIBBON_CELL_GROWTH - 1))
  )
}

const GRAVITY = 9.81
const FRICTION = 0.3
const VISC_Q = 0.25
const A_CAP = 25
const U_CAP = 6
const Q_CAP = 0.5
const MAX_DRIVE_SPEED = 5
const DRIVE_LEVEL = 1.0
const LEVEL_TAU = 1.0
const SUBSTEPS = 4
export const SKIRT_W = 0.2
export const WARP_CELL = 0.4
export const WARP_LINEAR = 64
export const WARP_GROWTH = 1.08
export const GRID_N = 512
/** 原版 ocean.wgsl 没有该校正系数；置 1 保持原版衰减。 */
const COPY_FINE = 1

type Pt = { x: number; z: number }

function resample(pts: Pt[], count: number, closed: boolean) {
  if (pts.length < 2) {
    const P = new Float32Array(count * 2)
    const N = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      P[i * 2] = pts[0]?.x ?? 0
      P[i * 2 + 1] = pts[0]?.z ?? 0
      N[i * 2] = 1
    }
    return { P, N, step: 1, total: 0 }
  }
  const cum = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z))
  }
  const total = closed
    ? cum[pts.length - 1] + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z)
    : cum[pts.length - 1]
  const step = total / (closed ? count : Math.max(count - 1, 1))
  const P = new Float32Array(count * 2)
  const N = new Float32Array(count * 2)
  let seg = 0
  for (let i = 0; i < count; i++) {
    const t = i * step
    while (seg < pts.length - 2 && cum[seg + 1] < t) seg++
    const a = pts[seg]
    const b = pts[Math.min(seg + 1, pts.length - 1)]
    const len = Math.max(cum[Math.min(seg + 1, pts.length - 1)] - cum[seg], 1e-6)
    const f = Math.min((t - cum[seg]) / len, 1)
    P[i * 2] = a.x + (b.x - a.x) * f
    P[i * 2 + 1] = a.z + (b.z - a.z) * f
  }
  for (let i = 0; i < count; i++) {
    const i0 = closed ? (i + count - 1) % count : Math.max(i - 1, 0)
    const i1 = closed ? (i + 1) % count : Math.min(i + 1, count - 1)
    const dx = P[i1 * 2] - P[i0 * 2]
    const dz = P[i1 * 2 + 1] - P[i0 * 2 + 1]
    const inv = 1 / Math.max(Math.hypot(dx, dz), 1e-6)
    N[i * 2] = dz * inv
    N[i * 2 + 1] = -dx * inv
  }
  return { P, N, step, total }
}

function ensureLandwardNormals(
  P: Float32Array,
  N: Float32Array,
  count: number,
  isWater: (x: number, z: number) => boolean
) {
  const mid = Math.floor(count / 2)
  const px = P[mid * 2]
  const pz = P[mid * 2 + 1]
  const nx = N[mid * 2]
  const nz = N[mid * 2 + 1]
  const probe = isWater(px + nx * 2, pz + nz * 2)
  if (probe) {
    for (let i = 0; i < count; i++) {
      N[i * 2] *= -1
      N[i * 2 + 1] *= -1
    }
  }
}

/** 从水面 mask 提取 0 等位线，重建弧长表（负 SDF = 海）。 */
export function buildCoastFromWaterMask(
  mask: Uint8Array,
  resolution: number,
  seaHalf: number,
  isWaterAt: (x: number, z: number) => boolean
) {
  const cell = (2 * seaHalf) / resolution
  const toWorld = (ix: number, iz: number): Pt => ({
    x: (ix + 0.5) * cell - seaHalf,
    z: (iz + 0.5) * cell - seaHalf,
  })
  const edges: Array<[Pt, Pt]> = []
  const at = (x: number, y: number) => mask[y * resolution + x] ? 1 : 0
  for (let y = 0; y < resolution - 1; y++) {
    for (let x = 0; x < resolution - 1; x++) {
      const c0 = at(x, y)
      const c1 = at(x + 1, y)
      const c2 = at(x + 1, y + 1)
      const c3 = at(x, y + 1)
      const code = (c0 << 3) | (c1 << 2) | (c2 << 1) | c3
      if (code === 0 || code === 15) continue
      const a = toWorld(x, y)
      const b = toWorld(x + 1, y)
      const c = toWorld(x + 1, y + 1)
      const d = toWorld(x, y + 1)
      const m01 = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
      const m12 = { x: (b.x + c.x) / 2, z: (b.z + c.z) / 2 }
      const m23 = { x: (c.x + d.x) / 2, z: (c.z + d.z) / 2 }
      const m30 = { x: (d.x + a.x) / 2, z: (d.z + a.z) / 2 }
      const push = (p: Pt, q: Pt) => edges.push([p, q])
      // 简化 marching squares：按 case 连中点
      const table: Record<number, Array<[Pt, Pt]>> = {
        1: [[m30, m23]], 2: [[m12, m23]], 3: [[m30, m12]], 4: [[m01, m12]],
        5: [[m01, m30], [m12, m23]], 6: [[m01, m23]], 7: [[m01, m30]],
        8: [[m01, m30]], 9: [[m01, m23]], 10: [[m01, m12], [m30, m23]],
        11: [[m01, m12]], 12: [[m30, m12]], 13: [[m12, m23]], 14: [[m30, m23]],
      }
      for (const seg of table[code] ?? []) push(seg[0], seg[1])
    }
  }

  // 把边串成折线
  const key = (p: Pt) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`
  const adj = new Map<string, Pt[]>()
  const add = (p: Pt, q: Pt) => {
    const k = key(p)
    if (!adj.has(k)) adj.set(k, [])
    adj.get(k)!.push(q)
  }
  for (const [p, q] of edges) {
    add(p, q)
    add(q, p)
  }
  const used = new Set<string>()
  const polylines: Pt[][] = []
  for (const [k0, neighbors] of adj) {
    if (neighbors.length !== 1 && neighbors.length !== 2) continue
    if ([...neighbors].every((n) => used.has(key(n) + "|" + k0) || used.has(k0 + "|" + key(n)))) continue
    // 找端点起步；闭合环任取一点
    let startKey = k0
    for (const [k, ns] of adj) {
      if (ns.length === 1) {
        startKey = k
        break
      }
    }
    if (used.has("poly:" + startKey)) continue
    const start = neighbors[0]
      ? { x: +startKey.split(",")[0], z: +startKey.split(",")[1] }
      : { x: 0, z: 0 }
    // 重新解析 start
    const [sx, sz] = startKey.split(",").map(Number)
    const line: Pt[] = [{ x: sx, z: sz }]
    used.add("poly:" + startKey)
    let prev = startKey
    let cur = startKey
    let guard = 0
    while (guard++ < edges.length + 2) {
      const ns = adj.get(cur) ?? []
      let nextPt: Pt | null = null
      let nextKey = ""
      for (const n of ns) {
        const nk = key(n)
        const ek = prev < nk ? `${prev}|${nk}` : `${nk}|${prev}`
        const ek2 = cur < nk ? `${cur}|${nk}` : `${nk}|${cur}`
        if (used.has(ek2)) continue
        nextPt = n
        nextKey = nk
        used.add(ek2)
        break
      }
      if (!nextPt) break
      if (nextKey === startKey && line.length > 2) {
        line.push(nextPt)
        break
      }
      line.push(nextPt)
      prev = cur
      cur = nextKey
    }
    if (line.length >= 8) polylines.push(line)
  }

  polylines.sort((a, b) => b.length - a.length)
  const mainPts = polylines[0] ?? [
    { x: 10, z: -800 },
    { x: 10, z: 800 },
  ]
  const main = resample(mainPts, MAIN_TABLE_N, false)
  ensureLandwardNormals(main.P, main.N, MAIN_TABLE_N, isWaterAt)
  let center = 0
  for (let i = 0; i < MAIN_TABLE_N; i++) {
    if (Math.hypot(main.P[i * 2], main.P[i * 2 + 1]) < Math.hypot(main.P[center * 2], main.P[center * 2 + 1])) {
      center = i
    }
  }
  ;(main as any).t0 = -center * main.step

  let islandPts: Pt[] | null = null
  for (const line of polylines.slice(1)) {
    const closed =
      Math.hypot(line[0].x - line[line.length - 1].x, line[0].z - line[line.length - 1].z) < cell * 2
    if (closed && line.length > 24 && line.length < mainPts.length * 0.6) {
      islandPts = line
      break
    }
  }
  if (!islandPts) {
    islandPts = []
    for (let s = 0; s < 1; s += 1 / 64) {
      const th = -s * Math.PI * 2
      islandPts.push({ x: -seaHalf * 0.85 + Math.cos(th) * 12, z: -seaHalf * 0.85 + Math.sin(th) * 12 })
    }
  }
  const island = resample(islandPts, ISLAND_COLS, true)
  ensureLandwardNormals(island.P, island.N, ISLAND_COLS, isWaterAt)

  const tableData = new Float32Array(MAIN_TABLE_N * 4)
  for (let i = 0; i < MAIN_TABLE_N; i++) {
    tableData[i * 4] = main.P[i * 2]
    tableData[i * 4 + 1] = main.P[i * 2 + 1]
    tableData[i * 4 + 2] = main.N[i * 2]
    tableData[i * 4 + 3] = main.N[i * 2 + 1]
  }
  const mainTableTexture = new THREE.DataTexture(
    tableData,
    MAIN_TABLE_N,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  mainTableTexture.minFilter = THREE.NearestFilter
  mainTableTexture.magFilter = THREE.NearestFilter
  mainTableTexture.generateMipmaps = false
  mainTableTexture.colorSpace = THREE.NoColorSpace
  mainTableTexture.needsUpdate = true

  const sample4 = new Float32Array(4)
  const coast = {
    main,
    island,
    islandArcStep: island.step,
    mainTableTexture,
    sampleMain(t: number, out: Float32Array) {
      const f = (t - (main as any).t0) / main.step
      const fc = Math.min(Math.max(f, 0), MAIN_TABLE_N - 1)
      const j0 = Math.min(Math.floor(fc), MAIN_TABLE_N - 2)
      const a = fc - j0
      let px = main.P[j0 * 2] * (1 - a) + main.P[j0 * 2 + 2] * a
      let pz = main.P[j0 * 2 + 1] * (1 - a) + main.P[j0 * 2 + 3] * a
      const nx = main.N[j0 * 2] * (1 - a) + main.N[j0 * 2 + 2] * a
      const nz = main.N[j0 * 2 + 1] * (1 - a) + main.N[j0 * 2 + 3] * a
      const inv = 1 / Math.max(Math.hypot(nx, nz), 1e-6)
      const over = (f - fc) * main.step
      px += -nz * inv * over
      pz += nx * inv * over
      out[0] = px
      out[1] = pz
      out[2] = nx * inv
      out[3] = nz * inv
    },
    nearestMainArc(x: number, z: number) {
      let best = 0
      let bd = Infinity
      // 必须逐项搜索：原版步长 4 在真实海岸线重采样后会把 tCamSnap 量化成约 7.2m 一档，
      // 导致 ribbon/chain 窗口随相机移动出现明显跳变（岸边色带几何不稳定）。
      for (let i = 0; i < MAIN_TABLE_N; i += 1) {
        const d = (main.P[i * 2] - x) ** 2 + (main.P[i * 2 + 1] - z) ** 2
        if (d < bd) {
          bd = d
          best = i
        }
      }
      return (main as any).t0 + best * main.step
    },
    _sample4: sample4,
  }
  return coast
}

function mainlandX(z: number) {
  const w = Math.min(Math.abs(z) / 330, 1)
  const fade = 1 - w * w * (3 - 2 * w)
  const curve = 0.6 * (6 * Math.sin(z * 0.041) + 3.5 * Math.sin(z * 0.093 + 1.7))
  const cape = -26 * Math.exp(-(((z + 70) / 38) ** 2))
  return BASE_SHORE_X + fade * (curve + cape)
}

function islandPoint(s: number): Pt {
  const th = -s * 2 * Math.PI
  const r = 20 + 3 * Math.sin(3 * th + 1)
  return { x: -45 + Math.cos(th) * r, z: 15 + Math.sin(th) * r }
}

/**
 * 原版 gpuocean authored coast：程序化大陆岸线 + 小岛，生成 SDF 纹理和弧长表。
 * 用于直接还原原生效果，不依赖 OSM / 真实地形高度场。
 */
export function buildAuthoredCoast() {
  const zSpan = ((MAIN_TABLE_N - 1) * MAIN_TABLE_STEP) / 2 + 40
  const dense: Pt[] = []
  for (let z = -zSpan; z <= zSpan; z += 0.5) dense.push({ x: mainlandX(z), z })
  const main = resample(dense, MAIN_TABLE_N, false)
  let center = 0
  for (let i = 0; i < MAIN_TABLE_N; i++) {
    if (Math.abs(main.P[i * 2 + 1]) < Math.abs(main.P[center * 2 + 1])) center = i
  }
  ;(main as any).t0 = -center * main.step

  const islDense: Pt[] = []
  for (let s = 0; s < 1; s += 1 / 512) islDense.push(islandPoint(s))
  const island = resample(islDense, ISLAND_COLS, true)
  const islandFine = resample(islDense, ISLAND_COLS * 4, true)

  // 烘焙 SDF（与原版 coast.js 相同的暴力最近点 + 法线符号）
  const pts: Array<{ x: number; z: number; nx: number; nz: number }> = []
  for (let i = 0; i < MAIN_TABLE_N; i++) {
    if (
      Math.abs(main.P[i * 2]) < SDF_EXTENT + 60 &&
      Math.abs(main.P[i * 2 + 1]) < SDF_EXTENT + 60
    ) {
      pts.push({ x: main.P[i * 2], z: main.P[i * 2 + 1], nx: main.N[i * 2], nz: main.N[i * 2 + 1] })
    }
  }
  for (let i = 0; i < islandFine.P.length / 2; i++) {
    pts.push({
      x: islandFine.P[i * 2],
      z: islandFine.P[i * 2 + 1],
      nx: islandFine.N[i * 2],
      nz: islandFine.N[i * 2 + 1],
    })
  }
  const BUCKET = 24
  const NB = Math.ceil((2 * (SDF_EXTENT + 80)) / BUCKET)
  const buckets: Array<Array<{ x: number; z: number; nx: number; nz: number }>> = Array.from(
    { length: NB * NB },
    () => []
  )
  const bIndex = (x: number, z: number) => {
    const bx = Math.min(Math.max(Math.floor((x + SDF_EXTENT + 80) / BUCKET), 0), NB - 1)
    const bz = Math.min(Math.max(Math.floor((z + SDF_EXTENT + 80) / BUCKET), 0), NB - 1)
    return bz * NB + bx
  }
  for (const p of pts) buckets[bIndex(p.x, p.z)].push(p)

  const data = new Float32Array(SDF_SIZE * SDF_SIZE * 4)
  const texel = (2 * SDF_EXTENT) / SDF_SIZE
  for (let iz = 0; iz < SDF_SIZE; iz++) {
    const z = -SDF_EXTENT + (iz + 0.5) * texel
    for (let ix = 0; ix < SDF_SIZE; ix++) {
      const x = -SDF_EXTENT + (ix + 0.5) * texel
      let bd = Infinity
      let bp: { x: number; z: number; nx: number; nz: number } | null = null
      const bx = Math.floor((x + SDF_EXTENT + 80) / BUCKET)
      const bz = Math.floor((z + SDF_EXTENT + 80) / BUCKET)
      for (let ring = 0; ring < NB; ring++) {
        if (bd < ((ring - 1) * BUCKET) ** 2 && ring > 1) break
        for (let dz = -ring; dz <= ring; dz++) {
          for (let dx = -ring; dx <= ring; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue
            const cx = bx + dx
            const cz = bz + dz
            if (cx < 0 || cz < 0 || cx >= NB || cz >= NB) continue
            for (const p of buckets[cz * NB + cx]) {
              const d = (p.x - x) ** 2 + (p.z - z) ** 2
              if (d < bd) {
                bd = d
                bp = p
              }
            }
          }
        }
      }
      let sd = Math.sqrt(bd)
      if (bp && (x - bp.x) * bp.nx + (z - bp.z) * bp.nz < 0) sd = -sd
      const i = iz * SDF_SIZE + ix
      data[i * 4] = sd
      data[i * 4 + 3] = 1
    }
  }
  const sdfTexture = new THREE.DataTexture(data, SDF_SIZE, SDF_SIZE, THREE.RGBAFormat, THREE.FloatType)
  sdfTexture.minFilter = THREE.LinearFilter
  sdfTexture.magFilter = THREE.LinearFilter
  sdfTexture.generateMipmaps = false
  sdfTexture.colorSpace = THREE.NoColorSpace
  sdfTexture.wrapS = THREE.ClampToEdgeWrapping
  sdfTexture.wrapT = THREE.ClampToEdgeWrapping
  sdfTexture.needsUpdate = true

  const tableData = new Float32Array(MAIN_TABLE_N * 4)
  for (let i = 0; i < MAIN_TABLE_N; i++) {
    tableData[i * 4] = main.P[i * 2]
    tableData[i * 4 + 1] = main.P[i * 2 + 1]
    tableData[i * 4 + 2] = main.N[i * 2]
    tableData[i * 4 + 3] = main.N[i * 2 + 1]
  }
  const mainTableTexture = new THREE.DataTexture(
    tableData,
    MAIN_TABLE_N,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  mainTableTexture.minFilter = THREE.NearestFilter
  mainTableTexture.magFilter = THREE.NearestFilter
  mainTableTexture.generateMipmaps = false
  mainTableTexture.colorSpace = THREE.NoColorSpace
  mainTableTexture.needsUpdate = true

  const sample4 = new Float32Array(4)
  const coast = {
    main,
    island,
    islandArcStep: island.step,
    mainTableTexture,
    sampleMain(t: number, out: Float32Array) {
      const f = (t - (main as any).t0) / main.step
      const fc = Math.min(Math.max(f, 0), MAIN_TABLE_N - 1)
      const j0 = Math.min(Math.floor(fc), MAIN_TABLE_N - 2)
      const a = fc - j0
      let px = main.P[j0 * 2] * (1 - a) + main.P[j0 * 2 + 2] * a
      let pz = main.P[j0 * 2 + 1] * (1 - a) + main.P[j0 * 2 + 3] * a
      const nx = main.N[j0 * 2] * (1 - a) + main.N[j0 * 2 + 2] * a
      const nz = main.N[j0 * 2 + 1] * (1 - a) + main.N[j0 * 2 + 3] * a
      const inv = 1 / Math.max(Math.hypot(nx, nz), 1e-6)
      const over = (f - fc) * main.step
      px += -nz * inv * over
      pz += nx * inv * over
      out[0] = px
      out[1] = pz
      out[2] = nx * inv
      out[3] = nz * inv
    },
    nearestMainArc(x: number, z: number) {
      let best = 0
      let bd = Infinity
      for (let i = 0; i < MAIN_TABLE_N; i += 1) {
        const d = (main.P[i * 2] - x) ** 2 + (main.P[i * 2 + 1] - z) ** 2
        if (d < bd) {
          bd = d
          best = i
        }
      }
      return (main as any).t0 + best * main.step
    },
    _sample4: sample4,
    sdfTexture,
  }
  return coast
}

export type OceanCoast = ReturnType<typeof buildCoastFromWaterMask>

function smoothSeg(
  a: Float32Array,
  offset: number,
  stride: number,
  j0: number,
  j1: number,
  wrap: boolean,
  k: number
) {
  const n = j1 - j0
  for (let j = wrap ? 0 : 1; j < (wrap ? n : n - 1); j++) {
    const o = offset + (j0 + j) * stride
    const prev = offset + (j0 + ((j + n - 1) % n)) * stride
    const next = offset + (j0 + ((j + 1) % n)) * stride
    a[o] += k * (a[prev] + a[next] - 2 * a[o])
  }
}

function bilinearWrap(tex: Float32Array, size: number, u: number, v: number) {
  const x = (u - Math.floor(u)) * size
  const y = (v - Math.floor(v)) * size
  const x0 = Math.floor(x) % size
  const y0 = Math.floor(y) % size
  const x1 = (x0 + 1) % size
  const y1 = (y0 + 1) % size
  const fx = x - Math.floor(x)
  const fy = y - Math.floor(y)
  const a = tex[y0 * size + x0] * (1 - fx) + tex[y0 * size + x1] * fx
  const b = tex[y1 * size + x0] * (1 - fx) + tex[y1 * size + x1] * fx
  return a * (1 - fy) + b * fy
}

export function sampleWaveLevel(
  x: number,
  z: number,
  heights: Float32Array[],
  copyData: Float32Array,
  layers: Array<{ dx: number; dz: number; invL: number; amp: number; su: number; sv: number }>,
  size: number
) {
  let hsum = 0
  for (const l of layers) {
    const u0 = (x * l.dx + z * l.dz) * l.invL + l.su
    const v0 = (-x * l.dz + z * l.dx) * l.invL + l.sv
    let sh = 0
    for (let k = 0; k < heights.length; k++) {
      sh +=
        copyData[k * 4 + 2] *
        bilinearWrap(heights[k], size, u0 + copyData[k * 4], v0 + copyData[k * 4 + 1])
    }
    hsum += l.amp * sh
  }
  return (hsum * DRIVE_LEVEL) / SLOPE
}

export class ChainSim {
  zBase = 0
  lastShift = 0
  tCamSnap = 0
  islandArcStep: number
  readonly simTexture: THREE.DataTexture
  readonly coastTexture: THREE.DataTexture
  private coast: OceanCoast
  private sample4 = new Float32Array(4)
  private x = new Float32Array(SIM_COLS * SIM_NODES)
  private u = new Float32Array(SIM_COLS * SIM_NODES)
  private vol = new Float32Array(SIM_NODES - 1)
  private eta = new Float32Array(SIM_NODES - 1)
  private drive = new Float32Array(SIM_COLS)
  private prevXi = new Float32Array(SIM_COLS)
  private levelLP = new Float32Array(SIM_COLS)
  private ve = new Float32Array(SIM_COLS)
  private juncWorld = new Float32Array(SIM_COLS * 2)
  private normal = new Float32Array(SIM_COLS * 2)
  private texData = new Float32Array(SIM_NODES * SIM_COLS * 4)
  private key = ""
  private sJ = 0
  private Lr = 0

  constructor(coast: OceanCoast) {
    this.coast = coast
    this.islandArcStep = coast.islandArcStep
    this.simTexture = new THREE.DataTexture(
      this.texData,
      SIM_NODES,
      SIM_COLS,
      THREE.RGBAFormat,
      THREE.FloatType
    )
    this.simTexture.minFilter = THREE.NearestFilter
    this.simTexture.magFilter = THREE.NearestFilter
    this.simTexture.generateMipmaps = false
    this.simTexture.colorSpace = THREE.NoColorSpace
    this.simTexture.needsUpdate = true

    const coastData = new Float32Array(SIM_COLS * 4)
    this.coastTexture = new THREE.DataTexture(
      coastData,
      SIM_COLS,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    )
    this.coastTexture.minFilter = THREE.NearestFilter
    this.coastTexture.magFilter = THREE.NearestFilter
    this.coastTexture.generateMipmaps = false
    this.coastTexture.colorSpace = THREE.NoColorSpace
    this.coastTexture.needsUpdate = true
    const t0 = this.coast.nearestMainArc(0, 0)
    this.tCamSnap = Math.floor(t0 / 0.4 + 0.5) * 0.4
  }

  private mainlandGeometry(j: number) {
    const t = this.zBase + (j / (MAIN_COLS - 1) - 0.5) * 160
    const c = this.sample4
    this.coast.sampleMain(t, c)
    this.normal[j * 2] = c[2]
    this.normal[j * 2 + 1] = c[3]
    this.juncWorld[j * 2] = c[0] + c[2] * this.sJ
    this.juncWorld[j * 2 + 1] = c[1] + c[3] * this.sJ
  }

  private shiftWindow(steps: number) {
    const s = Math.max(-MAIN_COLS, Math.min(steps, MAIN_COLS))
    this.zBase += s * (160 / (MAIN_COLS - 1))
    const copyRow = (dst: number, src: number) => {
      this.x.copyWithin(dst * SIM_NODES, src * SIM_NODES, (src + 1) * SIM_NODES)
      this.u.copyWithin(dst * SIM_NODES, src * SIM_NODES, (src + 1) * SIM_NODES)
      this.prevXi[dst] = this.prevXi[src]
      this.levelLP[dst] = this.levelLP[src]
    }
    if (s > 0) {
      for (let j = 0; j < MAIN_COLS; j++) copyRow(j, Math.min(j + s, MAIN_COLS - 1))
    } else {
      for (let j = MAIN_COLS - 1; j >= 0; j--) copyRow(j, Math.max(j + s, 0))
    }
    for (let j = 0; j < MAIN_COLS; j++) this.mainlandGeometry(j)
    return s
  }

  reset(params: { depth: number }) {
    this.sJ = -REST_DEPTH / SLOPE
    this.Lr = REST_DEPTH / SLOPE / (SIM_NODES - 1)
    this.zBase = this.zBase || 0
    for (let k = 0; k < SIM_NODES - 1; k++) {
      this.vol[k] = this.Lr * (REST_DEPTH - (k + 0.5) * this.Lr * SLOPE)
    }
    const island = this.coast.island
    const coastData = this.coastTexture.image.data as Float32Array
    for (let j = 0; j < SIM_COLS; j++) {
      if (j < MAIN_COLS) {
        this.mainlandGeometry(j)
        coastData[j * 4] = 0
        coastData[j * 4 + 1] = 0
        coastData[j * 4 + 2] = 0
        coastData[j * 4 + 3] = 0
      } else {
        const k = j - MAIN_COLS
        const px = island.P[k * 2]
        const pz = island.P[k * 2 + 1]
        const nx = island.N[k * 2]
        const nz = island.N[k * 2 + 1]
        coastData[j * 4] = px
        coastData[j * 4 + 1] = pz
        coastData[j * 4 + 2] = nx
        coastData[j * 4 + 3] = nz
        this.juncWorld[j * 2] = px + nx * this.sJ
        this.juncWorld[j * 2 + 1] = pz + nz * this.sJ
        this.normal[j * 2] = nx
        this.normal[j * 2 + 1] = nz
      }
      for (let i = 0; i < SIM_NODES; i++) this.x[j * SIM_NODES + i] = this.sJ + i * this.Lr
      this.drive[j] = this.sJ
    }
    this.coastTexture.needsUpdate = true
    this.u.fill(0)
    this.prevXi.fill(0)
    this.levelLP.fill(0)
    this.ve.fill(0)
    void params
  }

  update(
    dt: number,
    params: { depth: number },
    sampleLevel: (x: number, z: number) => number,
    _camX: number,
    _camZ: number
  ) {
    const key = `${params.depth}`
    if (key !== this.key) {
      this.key = key
      this.reset(params)
    }
    // 原版每帧都更新 tCamSnap，暂停时 ribbon 窗口也应跟随相机。
    const tCam = this.coast.nearestMainArc(_camX, _camZ)
    this.tCamSnap = Math.floor(tCam / 0.4 + 0.5) * 0.4
    this.lastShift = 0
    if (dt > 0) {
      const steps = Math.round((tCam - this.zBase) / (160 / (MAIN_COLS - 1)))
      if (steps !== 0) this.lastShift = this.shiftWindow(steps)
      const kLP = 1 - Math.exp(-dt / LEVEL_TAU)
      for (let j = 0; j < SIM_COLS; j++) {
        const level = sampleLevel(this.juncWorld[j * 2], this.juncWorld[j * 2 + 1])
        this.levelLP[j] += (level - this.levelLP[j]) * kLP
        const xi = this.levelLP[j]
        this.drive[j] = this.sJ + xi
        this.ve[j] = Math.max(-MAX_DRIVE_SPEED, Math.min((xi - this.prevXi[j]) / dt, MAX_DRIVE_SPEED))
        this.prevXi[j] = xi
      }
      const sub = Math.min(dt, 0.04) / SUBSTEPS
      for (let s = 0; s < SUBSTEPS; s++) {
        for (let j = 0; j < SIM_COLS; j++) this.stepColumn(j, sub, params)
      }
      for (let i = 0; i < SIM_NODES; i++) {
        smoothSeg(this.x, i, SIM_NODES, 0, MAIN_COLS, false, 0.04)
        smoothSeg(this.u, i, SIM_NODES, 0, MAIN_COLS, false, 0.04)
        smoothSeg(this.x, i, SIM_NODES, MAIN_COLS, SIM_COLS, true, 0.04)
        smoothSeg(this.u, i, SIM_NODES, MAIN_COLS, SIM_COLS, true, 0.04)
      }
    }

    for (let j = 0; j < SIM_COLS; j++) {
      const base = j * SIM_NODES
      const tip = this.x[base + SIM_NODES - 1]
      for (let i = 0; i < SIM_NODES; i++) {
        const o = (base + i) * 4
        this.texData[o] = this.x[base + i] - (this.sJ + i * this.Lr)
        this.texData[o + 1] = this.u[base + i]
        this.texData[o + 2] = tip
        this.texData[o + 3] = 0
      }
    }
    this.simTexture.needsUpdate = true
  }

  private stepColumn(j: number, sub: number, params: { depth: number }) {
    const base = j * SIM_NODES
    const x = this.x
    const u = this.u
    const eta = this.eta
    const terr = (s: number) => Math.min(Math.max(SLOPE * s, -params.depth), 3)
    const lFloor = 0.4 * this.Lr
    for (let k = 0; k < SIM_NODES - 1; k++) {
      const L = Math.max(x[base + k + 1] - x[base + k], lFloor)
      const du = u[base + k + 1] - u[base + k]
      const q = du < 0 ? Math.min(VISC_Q * du * du, Q_CAP) : 0
      eta[k] = terr((x[base + k] + x[base + k + 1]) / 2) + this.vol[k] / L + q
    }
    for (let i = 1; i < SIM_NODES; i++) {
      const etaR = i < SIM_NODES - 1 ? eta[i] : terr(x[base + SIM_NODES - 1])
      const dx = Math.max(
        (i < SIM_NODES - 1 ? x[base + i + 1] - x[base + i - 1] : x[base + i] - x[base + i - 1]) / 2,
        this.Lr
      )
      let a = (-GRAVITY * (etaR - eta[i - 1])) / dx
      a = Math.max(-A_CAP, Math.min(a, A_CAP))
      const fr = FRICTION * (1 + (3 * i) / (SIM_NODES - 1))
      u[base + i] += (a - fr * u[base + i]) * sub
      u[base + i] = Math.max(-U_CAP, Math.min(u[base + i], U_CAP))
    }
    x[base] = this.drive[j]
    u[base] = this.ve[j]
    for (let i = 1; i < SIM_NODES; i++) x[base + i] += u[base + i] * sub
    const lMin = this.Lr * 0.2
    for (let i = 1; i < SIM_NODES; i++) {
      if (x[base + i] < x[base + i - 1] + lMin) {
        x[base + i] = x[base + i - 1] + lMin
        if (u[base + i] < u[base + i - 1]) u[base + i] = u[base + i - 1]
      }
    }
    const xMax = Math.min(13, 2.8 / SLOPE)
    if (x[base + SIM_NODES - 1] > xMax) {
      x[base + SIM_NODES - 1] = xMax
      if (u[base + SIM_NODES - 1] > 0) u[base + SIM_NODES - 1] = 0
    }
  }
}

export function buildRibbonGeometry(nx = RIBBON_CELLS, nz = RIBBON_GRID_N) {
  const positions = new Float32Array((nx + 1) * (nz + 1) * 3)
  const dxMaterial = RIBBON_SPAN / nx
  const half = nz / 2
  const cellAt = (i: number) => {
    const a = Math.min(Math.abs(i - half), half - 1)
    return ribbonWarpAxis(a + 1) - ribbonWarpAxis(a)
  }
  let p = 0
  for (let iz = 0; iz <= nz; iz++) {
    for (let ix = 0; ix <= nx; ix++) {
      positions[p++] = ix / nx
      positions[p++] = ribbonWarpAxis(iz - half)
      positions[p++] = Math.max(dxMaterial, cellAt(iz))
    }
  }
  const indices = new Uint32Array(nx * nz * 6)
  let t = 0
  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) {
      const a = z * (nx + 1) + x
      const b = a + 1
      const c = a + nx + 1
      const d = c + 1
      indices[t++] = a
      indices[t++] = c
      indices[t++] = b
      indices[t++] = b
      indices[t++] = c
      indices[t++] = d
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geo.setIndex(new THREE.BufferAttribute(indices, 1))
  return geo
}

/** TSL wgslFn 每个依赖必须是单个 `fn`；常量直接烘焙进函数体。 */
export const coastSdfCode = `
fn coastSDF(xz: vec2f, sdfTex: texture_2d<f32>, samp: sampler, seaHalf: f32) -> f32 {
  let uv = xz / (2.0 * ${SDF_EXTENT}.0) + 0.5;
  let uvc = clamp(uv, vec2f(0.0), vec2f(1.0));
  // FloatType SDF 在 WebGPU 下不可 filter，textureLoad + 手动双线性
  let res = ${SDF_SIZE}.0;
  let p = uvc * res - 0.5;
  let x0 = i32(clamp(floor(p.x), 0.0, res - 1.0));
  let y0 = i32(clamp(floor(p.y), 0.0, res - 1.0));
  let x1 = min(x0 + 1, ${SDF_SIZE - 1});
  let y1 = min(y0 + 1, ${SDF_SIZE - 1});
  let a = p.x - floor(p.x);
  let b = p.y - floor(p.y);
  let c00 = textureLoad(sdfTex, vec2i(x0, y0), 0);
  let c10 = textureLoad(sdfTex, vec2i(x1, y0), 0);
  let c01 = textureLoad(sdfTex, vec2i(x0, y1), 0);
  let c11 = textureLoad(sdfTex, vec2i(x1, y1), 0);
  let baked = mix(mix(c00, c10, a), mix(c01, c11, a), b).r;
  let far = smoothstep(${SDF_EXTENT - 48}.0, ${SDF_EXTENT - 8}.0, max(abs(xz.x), abs(xz.y)));
  return mix(baked, xz.x - ${BASE_SHORE_X}.0, far);
}
`

export const terrainHeightCode = `
fn terrainHeight(xz: vec2f, sdfTex: texture_2d<f32>, samp: sampler, seaHalf: f32, slope: f32, seaDepth: f32) -> f32 {
  return min(max(slope * coastSDF(xz, sdfTex, samp, seaHalf), -seaDepth), 3.0);
}
`

export const sunWarmthCode = `
fn sunWarmth(sunDir: vec3f) -> f32 {
  return 1.0 - smoothstep(0.03, 0.5, clamp(sunDir.y, 0.0, 1.0));
}
`

export const sunTintCode = `
fn sunTint(sunDir: vec3f) -> vec3f {
  let w = sunWarmth(sunDir);
  return mix(vec3f(1.0, 0.97, 0.9), vec3f(1.25, 0.5, 0.18), w * w);
}
`

// 兼容保留：ocean.ts 已改用 Tellux sky() 作为海面反射色（view-ray 近似）。
// 这个 gpuocean 程序化 skyColor 目前不再被 oceanShading 调用，仅留作参考/回退。
export const skyColorCode = `
fn skyColor(dir: vec3f, sunDir: vec3f) -> vec3f {
  let w = sunWarmth(sunDir);
  let t = pow(clamp(dir.y, 0.0, 1.0), mix(0.5, 0.65, w));
  let facing = pow(0.5 + 0.5 * dot(normalize(dir.xz + vec2f(1e-5, 0.0)), normalize(sunDir.xz)), 3.0);
  let zenith = mix(vec3f(0.11, 0.30, 0.60), vec3f(0.08, 0.12, 0.30), w);
  let horizon = mix(vec3f(0.62, 0.72, 0.83), mix(vec3f(0.42, 0.36, 0.52), vec3f(1.1, 0.45, 0.16), facing), w);
  var c = mix(horizon, zenith, t);
  let g = max(dot(dir, sunDir), 0.0);
  c += sunTint(sunDir) * (pow(g, mix(40.0, 10.0, w)) * mix(0.25, 0.6, w) + pow(g, 4000.0) * 3.0);
  return c;
}
`

export const colTCode = `
fn colT(col: f32, simZBase: f32, islandArcStep: f32) -> f32 {
  if (col < ${MAIN_COLS}.0) {
    return simZBase + (col / ${MAIN_COLS - 1}.0 - 0.5) * 160.0;
  }
  return (col - ${MAIN_COLS}.0) * islandArcStep;
}
`

export const wrapColCode = `
fn wrapCol(col: f32) -> f32 {
  if (col >= ${MAIN_COLS}.0) {
    return ${MAIN_COLS}.0 + fract((col - ${MAIN_COLS}.0) / ${ISLAND_COLS}.0) * ${ISLAND_COLS}.0;
  }
  return clamp(col, 0.0, ${MAIN_COLS - 1}.0);
}
`

export const simRestSCode = `
fn simRestS(b: f32, slope: f32) -> f32 {
  let m = clamp(b, 0.0, ${SIM_SPAN}.0);
  return -${REST_DEPTH} / slope + b + m * (${REST_DEPTH} / slope / ${SIM_SPAN}.0 - 1.0);
}
`

export const simBlendCode = `
fn simBlend(b: f32) -> f32 {
  return smoothstep(-${SIM_BAND}.0, 0.0, b);
}
`

export const warpVertexCode = `
fn warpVertex(p: vec2f, cameraPos: vec3f, seaHalf: f32) -> vec3f {
  let camXZ = cameraPos.xz;
  let snapRaw = floor(camXZ / ${WARP_CELL} + 0.5) * ${WARP_CELL};
  let snap = clamp(snapRaw, vec2f(-seaHalf), vec2f(seaHalf));
  let r = length(p);
  if (r <= ${WARP_LINEAR}.0) {
    return vec3f(snap + p, ${WARP_CELL});
  }
  let k = min((r - ${WARP_LINEAR}.0) / ${WARP_CELL}, 98.0);
  let g = pow(${WARP_GROWTH}, k);
  let rw = ${WARP_LINEAR}.0 + ${WARP_CELL} * (g - 1.0) / (${WARP_GROWTH} - 1.0);
  return vec3f(snap + p * (rw / r), ${WARP_CELL} * g);
}
`

export const warpCellAtCode = `
fn warpCellAt(dist: f32) -> f32 {
  return ${WARP_CELL} + max((${WARP_GROWTH} - 1.0) * (dist - ${WARP_LINEAR}.0), 0.0);
}
`

export const softClampCode = `
fn softClamp(height: f32, ty: f32) -> f32 {
  let dy = height - (ty + 0.1);
  return ty + 0.1 + 0.5 * (dy + sqrt(dy * dy + 0.0225));
}
`

function unrollGravityVertex() {
  return Array.from({ length: 8 }, (_, i) => `
  if (numLayers > ${i}.5) {
    let dir = d${i}.xy; let invL = d${i}.z; let amp = d${i}.w;
    let att = 1.0 - smoothstep(2.0, 6.0, cell * invL * hGrad * ${COPY_FINE});
    let s = textureSampleLevel(waveTex, samp, layerUV(xz, dir, invL, s${i}.xy), 0.0);
    height += amp * att * s.x;
    disp += choppiness * amp * att * s.y * dir;
  }`).join("")
}

function unrollGravityNormal() {
  return Array.from({ length: 8 }, (_, i) => `
  if (numLayers > ${i}.5) {
    let dir = d${i}.xy; let invL = d${i}.z;
    let amp = d${i}.w * (1.0 - smoothstep(5.0, 14.0, mpp * d${i}.z * hGrad * ${COPY_FINE}));
    let s = textureSample(waveTex, samp, layerUV(waveXZ, dir, invL, s${i}.xy));
    let duvdx = vec2f(dir.x, -dir.y) * invL;
    let duvdz = vec2f(dir.y, dir.x) * invL;
    let grad = vec2f(s.z, s.w) * (hGrad * hScale);
    let dDdu = choppiness * amp * s.x * dGrad;
    dPx += vec3f(dir.x * dDdu * duvdx.x, amp * dot(grad, duvdx), dir.y * dDdu * duvdx.x);
    dPz += vec3f(dir.x * dDdu * duvdz.x, amp * dot(grad, duvdz), dir.y * dDdu * duvdz.x);
    let cAmp = choppiness * amp * dGrad * invL;
    let cAmpP = choppiness * d${i}.w * dGrad * invL;
    varC += cAmp * cAmp;
    varP += cAmpP * cAmpP;
  }`).join("")
}

function unrollCapNormal() {
  return Array.from({ length: 6 }, (_, i) => {
    const iso = i < 3
    const tex = iso ? "capTex" : "waveTex"
    const amp = iso
      ? `isoScale * cd${i}.w * capHGrad * (1.0 - smoothstep(5.0, 14.0, mpp * invL * capHGrad))`
      : `anisoScale * cd${i}.w * hGrad * (1.0 - smoothstep(5.0, 14.0, mpp * invL * hGrad * ${COPY_FINE}))`
    return `
  {
    let dir = cd${i}.xy; let invL = cd${i}.z;
    let s = textureSample(${tex}, samp, layerUV(rippleXZ, dir, invL, cs${i}.xy));
    let amp = ${amp};
    let grad = vec2f(s.z, s.w) * amp;
    dPx.y += dot(grad, vec2f(dir.x, -dir.y) * invL);
    dPz.y += dot(grad, vec2f(dir.y, dir.x) * invL);
  }`
  }).join("")
}

const gravityParams = Array.from({ length: 8 }, (_, i) => `d${i}: vec4f, s${i}: vec4f`).join(", ")
const capParams = Array.from({ length: 6 }, (_, i) => `cd${i}: vec4f, cs${i}: vec4f`).join(", ")

export const oceanVertexCode = `
fn oceanVertex(
  xz: vec2f, cell: f32,
  waveTex: texture_2d<f32>, samp: sampler, sdfTex: texture_2d<f32>,
  ${gravityParams},
  numLayers: f32, choppiness: f32, hGrad: f32, ampInv: f32, leanXY: vec2f,
  seaHalf: f32, slope: f32, seaDepth: f32, waveK: f32
) -> vec4f {
  var height = 0.0;
  var disp = vec2f(0.0);
  ${unrollGravityVertex()}
  let eta = max(height * ampInv, 0.0);
  disp += leanXY * (eta * eta / (1.0 + eta) / ampInv);
  let ty0 = terrainHeight(xz, sdfTex, samp, seaHalf, slope, seaDepth);
  let wSea = 1.0 - smoothstep(-0.6, 0.1, ty0);
  let shallowAmp = clamp(1.0 / tanh(waveK * max(-ty0, 0.05)), 1.0, 2.5);
  let dispXZ = xz + disp * shallowAmp * wSea;
  // 水面只跟水下地形（ty<=0）交互，避免位移采样到岸上正高度时把海面整片抬起
  let ty = min(terrainHeight(dispXZ, sdfTex, samp, seaHalf, slope, seaDepth), 0.0);
  let sOff = coastSDF(xz, sdfTex, samp, seaHalf);
  let sJ0 = -${REST_DEPTH} / slope;
  var cut = sOff - (sJ0 - ${SIM_BAND}.0);
  if (max(abs(xz.x), abs(xz.y)) > seaHalf) {
    cut = 1.0;
  }
  return vec4f(dispXZ.x, softClamp(height, ty), dispXZ.y, cut);
}
`

export const oceanShadingCode = `
fn oceanShading(
  world: vec3f, waveXZ: vec2f, gridXZ: vec2f, cut: f32, st: vec2f, stretch: f32,
  waveTex: texture_2d<f32>, samp: sampler,
  foamTex: texture_2d<f32>, foamPatTex: texture_2d<f32>,
  sdfTex: texture_2d<f32>, capTex: texture_2d<f32>, filmFoamTex: texture_2d<f32>,
  ${gravityParams},
  numLayers: f32, choppiness: f32, dGrad: f32, hGrad: f32, ampInv: f32,
  foamRegion: f32, foamScale: f32, foamCX: f32, foamCZ: f32,
  foamThreshold: f32, foamLife: f32, waveK: f32,
  cameraPos: vec3f, sunDir: vec3f,
  seaHalf: f32, slope: f32, seaDepth: f32,
  ${capParams},
  leanXY: vec2f, capHGrad: f32, rippleBias: f32,
  sssStrength: f32, causticStrength: f32, causticScale: f32, timeSec: f32,
  simZBase: f32, islandArcStep: f32
) -> vec4f {
  if (cut > 0.0) { discard; }
  if (max(abs(waveXZ.x), abs(waveXZ.y)) > seaHalf) { discard; }
  let dist = distance(cameraPos, world);
  let sbF = simBlend(st.x);
  let rippleXZ = mix(gridXZ, world.xz, sbF);
  let hScale = 1.0 - sbF;
  var dPx = vec3f(1.0, 0.0, 0.0);
  var dPz = vec3f(0.0, 0.0, 1.0);
  var varC = 0.0;
  var varP = 0.0;
  let mpp = length(fwidth(waveXZ));
  ${unrollGravityNormal()}
  let eta = max(world.y * ampInv, 0.0);
  let leanSlope = (eta * eta + 2.0 * eta) / ((1.0 + eta) * (1.0 + eta));
  dPx += vec3f(leanXY.x * leanSlope * dPx.y, 0.0, leanXY.y * leanSlope * dPx.y);
  dPz += vec3f(leanXY.x * leanSlope * dPz.y, 0.0, leanXY.y * leanSlope * dPz.y);
  let jac = dPx.x * dPz.z - dPz.x * dPx.z;
  let sigma = sqrt(varC);
  let sigmaP = sqrt(varP);
  let fade = clamp(1.0 - dist / 150.0, 0.0, 1.0);
  let front = smoothstep(0.0, 0.15, -dPx.y);
  let squeeze = smoothstep(0.0, 0.3, 2.0 - dPx.x - dPz.z);
  let conc = front + squeeze;
  let isoScale = mix(1.0, conc, rippleBias * 0.4) * fade;
  let anisoScale = mix(1.0, conc, rippleBias) * fade;
  ${unrollCapNormal()}
  var n = normalize(cross(dPz, dPx));
  // 水面只跟水下地形（ty<=0）交互，避免岸上正高度把水 column 顶起来
  let ty = min(terrainHeight(world.xz, sdfTex, samp, seaHalf, slope, seaDepth), 0.0);
  let column = max(world.y - ty, 0.0);
  let waterM = smoothstep(0.025, 0.09, column);
  let eT = 0.5;
  let hx = terrainHeight(world.xz + vec2f(eT, 0.0), sdfTex, samp, seaHalf, slope, seaDepth)
         - terrainHeight(world.xz - vec2f(eT, 0.0), sdfTex, samp, seaHalf, slope, seaDepth);
  let hz = terrainHeight(world.xz + vec2f(0.0, eT), sdfTex, samp, seaHalf, slope, seaDepth)
         - terrainHeight(world.xz - vec2f(0.0, eT), sdfTex, samp, seaHalf, slope, seaDepth);
  let nTerr = normalize(vec3f(-hx / (2.0 * eT), 1.0, -hz / (2.0 * eT)));
  n = normalize(mix(nTerr, n, waterM));
  let v = normalize(cameraPos - world);
  if (dot(n, v) < 0.0) { n = -n; }
  let fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  let refl = reflect(-v, n);
  let spec = sunTint(sunDir) * (mix(8.0, 4.5, sunWarmth(sunDir)) * pow(max(dot(refl, sunDir), 0.0), 600.0));
  let fCenter = vec2f(foamCX, foamCZ);
  let fuv = (waveXZ - fCenter) / (2.0 * foamRegion) + 0.5;
  let edgeFade = 1.0 - smoothstep(0.85, 1.0, length(waveXZ - fCenter) / foamRegion);
  let foamRaw = textureSample(foamTex, samp, fuv).rgb;
  let foamAcc = foamRaw * edgeFade;
  let sigmaR = max(sigma, 1e-4);
  let pGen = 1.0 / (1.0 + exp(-1.702 * (foamThreshold - 1.0) / max(sigmaP, 1e-4)));
  let period = 6.2832 / sqrt(9.81 * waveK);
  let cover = clamp(1.0 - pow(1.0 - pGen, 1.0 + 1.2 * foamLife / period), 1e-4, 0.6);
  let zQ = -log(1.0 / cover - 1.0) / 1.702;
  let zNow = (jac - 1.0) / sigmaR;
  let waterGateF = smoothstep(0.0, 0.3, world.y - ty);
  let depthF = max(-ty, 0.05);
  let genSurfF = smoothstep(0.55, 0.9, world.y / depthF) * smoothstep(0.0, 0.5, depthF) * waterGateF;
  let tailW = 1.0 / (1.0 + abs(zQ));
  let farJ = clamp(0.48 + 0.45 * (1.0 - exp((zNow - zQ + 0.28) / tailW)), 0.0, 1.0);
  let farR = max(farJ * waterGateF, genSurfF);
  let bufBlend = edgeFade * (1.0 - smoothstep(foamRegion, 2.0 * foamRegion, dist));
  let accR = mix(farR, foamRaw.r, bufBlend);
  let towardSun = max(0.0, -dot(v, sunDir));
  let sss = sssStrength * (0.55 + 0.45 * towardSun * towardSun) * foamAcc.g * (1.0 - sbF);
  let refr = refract(-v, n, 0.752);
  let lateral = mix(1.0 / max(-refr.y, 0.05), min(1.0 / max(-refr.y, 0.05), 2.0), sbF);
  let pathLen = column * (lateral + 1.4);
  let trans = exp(-vec3f(0.25, 0.04, 0.02) * pathLen);
  let bottomXZ = world.xz + refr.xz * (column * lateral);
  let cs = textureSample(capTex, samp, bottomXZ / (13.0 * causticScale) + vec2f(0.023, 0.011) * timeSec).x
         + textureSample(capTex, samp, bottomXZ / (8.7 * causticScale) + vec2f(-0.017, 0.019) * timeSec).x;
  let web = pow(max(0.0, 1.0 - 0.6 * abs(cs)), 4.0);
  let focus = causticStrength * exp(-column * 0.12) * clamp(1.0 - dist / 120.0, 0.0, 1.0) * smoothstep(0.04, 0.25, column);
  let sand = vec3f(0.86, 0.78, 0.58) * (0.85 + focus * (1.6 * web - 0.18));
  let lightTint = mix(vec3f(1.0), sunTint(sunDir), 0.6);
  let sunLevel = mix(0.18, 1.0, smoothstep(0.0, 0.5, clamp(sunDir.y, 0.0, 1.0)));
  var water = mix(vec3f(0.004, 0.02, 0.05), sand, trans) * lightTint;
  water += vec3f(0.05, 0.45, 0.38) * sss;
  water *= sunLevel;
  var color = mix(water, skyColor(refl, sunDir), fresnel) + spec;
  let sandMatte = vec3f(0.86, 0.78, 0.58) * lightTint * sunLevel * (0.55 + 0.45 * max(n.y, 0.0));
  color = mix(sandMatte, color, waterM);
  let filmAcc = filmFoamAt(st.x, st.y, filmFoamTex).rgb;
  let patWave = textureSample(foamPatTex, samp, waveXZ / (5.0 * foamScale)).r;
  let patFilmUV = vec2f(st.x, colT(st.y, simZBase, islandArcStep)) / (5.0 * foamScale);
  let patFine = textureSample(foamPatTex, samp, vec2f(patFilmUV.x / 3.0, patFilmUV.y)).r;
  let patCoarse = textureSample(foamPatTex, samp, vec2f(patFilmUV.x / 9.0, patFilmUV.y)).r;
  let patFilm = mix(patFine, patCoarse, 1.0 - smoothstep(0.07, 0.4, stretch));
  let junctionFade = 1.0 - smoothstep(0.0, 6.0, st.x);
  let maskWave = smoothstep(0.0, 0.15, patWave - (1.05 - 1.15 * accR * junctionFade));
  let maskFilm = smoothstep(0.0, 0.15, patFilm - (1.05 - 1.15 * (filmAcc.b + filmAcc.r * 0.8)));
  let foamMask = min(maskWave + maskFilm, 1.0);
  let foamColor = lightTint * mix(0.45, 1.0, sunLevel) * (0.72 + 0.22 * max(n.y, 0.0));
  color = mix(color, foamColor, foamMask);
  let fog = 1.0 - exp(-dist * 3e-5);
  color = mix(color, skyColor(normalize(vec3f(-v.x, 0.02, -v.z)), sunDir), fog);
  // Tellux 色彩体系：不在这里做 gpuocean 自带的 tonemap + gamma，
  // 输出 linear HDR 交给 Tellux 的 AgX + sRGB output pass。
  return vec4f(color, 1.0);
}
`

export const filmFoamAtCode = `
fn filmFoamAt(b: f32, col: f32, filmFoamTex: texture_2d<f32>) -> vec4f {
  let fx = clamp((b + ${SIM_BAND}.0) / (${SIM_BAND}.0 + ${SIM_SPAN}.0) * 127.0, 0.0, 127.0);
  let c = wrapCol(col);
  var j0 = i32(floor(c));
  var j1 = j0 + 1;
  if (j0 >= ${MAIN_COLS}) {
    if (j1 >= ${SIM_COLS}) { j1 = ${MAIN_COLS}; }
  } else {
    j1 = min(j1, ${MAIN_COLS - 1});
  }
  let i0 = i32(floor(fx));
  let i1 = min(i0 + 1, 127);
  let a = fx - floor(fx);
  let fb = c - floor(c);
  return mix(
    mix(textureLoad(filmFoamTex, vec2i(i0, j0), 0), textureLoad(filmFoamTex, vec2i(i1, j0), 0), a),
    mix(textureLoad(filmFoamTex, vec2i(i0, j1), 0), textureLoad(filmFoamTex, vec2i(i1, j1), 0), a), fb);
}
`

export const ribbonVertexCode = `
fn ribbonVertexMain(
  pos: vec3f,
  cameraPos: vec3f,
  waveTex: texture_2d<f32>, samp: sampler,
  simTex: texture_2d<f32>,
  mainTable: texture_2d<f32>,
  sdfTex: texture_2d<f32>,
  d0: vec4f, s0: vec4f, d1: vec4f, s1: vec4f, d2: vec4f, s2: vec4f, d3: vec4f, s3: vec4f,
  d4: vec4f, s4: vec4f, d5: vec4f, s5: vec4f, d6: vec4f, s6: vec4f, d7: vec4f, s7: vec4f,
  numLayers: f32, choppiness: f32, hGrad: f32, slope: f32, seaDepth: f32,
  simZBase: f32, simTCam: f32, seaHalf: f32, waveK: f32, ampInv: f32, leanXY: vec2f
) -> vec4f {
  let t = simTCam + pos.y;
  let b = pos.x * (${SIM_SPAN}.0 + ${SIM_BAND}.0 + 2.0 * ${SKIRT_W}) - ${SIM_BAND}.0 - 2.0 * ${SKIRT_W};
  let col = clamp(((t - simZBase) / 160.0 + 0.5) * ${MAIN_COLS - 1}.0, 0.0, ${MAIN_COLS - 1}.0);

  let f = t / ${MAIN_TABLE_STEP} + ${MAIN_TABLE_N - 1}.0 * 0.5;
  let fc = clamp(f, 0.0, ${MAIN_TABLE_N - 1}.0);
  let j0 = min(i32(floor(fc)), ${MAIN_TABLE_N - 2});
  let a = fc - f32(j0);
  let c0 = textureLoad(mainTable, vec2i(j0, 0), 0);
  let c1 = textureLoad(mainTable, vec2i(j0 + 1, 0), 0);
  var c = mix(c0, c1, a);
  let n = normalize(c.zw);
  let over = (f - fc) * ${MAIN_TABLE_STEP};
  let coastP = c.xy + vec2f(-n.y, n.x) * over;
  let coastN = n;

  let fx = clamp(b / (${SIM_SPAN}.0 / ${SIM_NODES - 1}.0), 0.0, ${SIM_NODES - 1}.0);
  let cc = wrapCol(col);
  let i0 = i32(floor(fx));
  let i1 = min(i0 + 1, ${SIM_NODES - 1});
  var jA = i32(floor(cc));
  var jB = min(jA + 1, ${MAIN_COLS - 1});
  let fa = fx - floor(fx);
  let fb = cc - floor(cc);
  let chain = mix(
    mix(textureLoad(simTex, vec2i(i0, jA), 0), textureLoad(simTex, vec2i(i1, jA), 0), fa),
    mix(textureLoad(simTex, vec2i(i0, jB), 0), textureLoad(simTex, vec2i(i1, jB), 0), fa), fb);
  let chainJ = mix(
    textureLoad(simTex, vec2i(0, jA), 0),
    textureLoad(simTex, vec2i(0, jB), 0), fb);

  let matWorld = coastP + coastN * (-${REST_DEPTH} / slope + b);
  let cellW = max(pos.z, warpCellAt(distance(cameraPos.xz, matWorld)));
  var height = 0.0;
  var disp = vec2f(0.0);
  if (numLayers > 0.5) {
    let dir = d0.xy; let invL = d0.z; let amp = d0.w;
    let att = 1.0 - smoothstep(2.0, 6.0, cellW * invL * hGrad);
    let s = textureSampleLevel(waveTex, samp, layerUV(matWorld, dir, invL, s0.xy), 0.0);
    height += amp * att * s.x; disp += choppiness * amp * att * s.y * dir;
  }
  if (numLayers > 1.5) {
    let dir = d1.xy; let invL = d1.z; let amp = d1.w;
    let att = 1.0 - smoothstep(2.0, 6.0, cellW * invL * hGrad);
    let s = textureSampleLevel(waveTex, samp, layerUV(matWorld, dir, invL, s1.xy), 0.0);
    height += amp * att * s.x; disp += choppiness * amp * att * s.y * dir;
  }
  if (numLayers > 2.5) {
    let dir = d2.xy; let invL = d2.z; let amp = d2.w;
    let att = 1.0 - smoothstep(2.0, 6.0, cellW * invL * hGrad);
    let s = textureSampleLevel(waveTex, samp, layerUV(matWorld, dir, invL, s2.xy), 0.0);
    height += amp * att * s.x; disp += choppiness * amp * att * s.y * dir;
  }
  if (numLayers > 3.5) {
    let dir = d3.xy; let invL = d3.z; let amp = d3.w;
    let att = 1.0 - smoothstep(2.0, 6.0, cellW * invL * hGrad);
    let s = textureSampleLevel(waveTex, samp, layerUV(matWorld, dir, invL, s3.xy), 0.0);
    height += amp * att * s.x; disp += choppiness * amp * att * s.y * dir;
  }
  if (numLayers > 4.5) {
    let dir = d4.xy; let invL = d4.z; let amp = d4.w;
    let att = 1.0 - smoothstep(2.0, 6.0, cellW * invL * hGrad);
    let s = textureSampleLevel(waveTex, samp, layerUV(matWorld, dir, invL, s4.xy), 0.0);
    height += amp * att * s.x; disp += choppiness * amp * att * s.y * dir;
  }
  if (numLayers > 5.5) {
    let dir = d5.xy; let invL = d5.z; let amp = d5.w;
    let att = 1.0 - smoothstep(2.0, 6.0, cellW * invL * hGrad);
    let s = textureSampleLevel(waveTex, samp, layerUV(matWorld, dir, invL, s5.xy), 0.0);
    height += amp * att * s.x; disp += choppiness * amp * att * s.y * dir;
  }
  if (numLayers > 6.5) {
    let dir = d6.xy; let invL = d6.z; let amp = d6.w;
    let att = 1.0 - smoothstep(2.0, 6.0, cellW * invL * hGrad);
    let s = textureSampleLevel(waveTex, samp, layerUV(matWorld, dir, invL, s6.xy), 0.0);
    height += amp * att * s.x; disp += choppiness * amp * att * s.y * dir;
  }
  if (numLayers > 7.5) {
    let dir = d7.xy; let invL = d7.z; let amp = d7.w;
    let att = 1.0 - smoothstep(2.0, 6.0, cellW * invL * hGrad);
    let s = textureSampleLevel(waveTex, samp, layerUV(matWorld, dir, invL, s7.xy), 0.0);
    height += amp * att * s.x; disp += choppiness * amp * att * s.y * dir;
  }
  let eta = max(height * ampInv, 0.0);
  disp += leanXY * (eta * eta / (1.0 + eta) / ampInv);
  let ty0 = terrainHeight(matWorld, sdfTex, samp, seaHalf, slope, seaDepth);
  let wSea = 1.0 - smoothstep(-0.6, 0.1, ty0);
  let shallowAmp = clamp(1.0 / tanh(waveK * max(-ty0, 0.05)), 1.0, 2.5);
  disp *= shallowAmp * wSea;

  let sb = simBlend(b);
  let wS = smoothstep(0.0, 12.0, b);
  let chainWorld = coastP + coastN * (simRestS(b, slope) + mix(chainJ.x, chain.x, wS));
  let dispXZ = mix(matWorld + disp, chainWorld, sb);
  let ty = terrainHeight(dispXZ, sdfTex, samp, seaHalf, slope, seaDepth);
  let yWave = softClamp(height, ty);
  let sJ = -${REST_DEPTH} / slope + chainJ.x;
  let tyJ = slope * sJ;
  let tyF = max(ty, tyJ);
  let tTip = clamp(b / ${SIM_SPAN}.0, 0.0, 1.0);
  var y = mix(yWave, tyF + ${REST_DEPTH} * (1.0 - tTip), sb);
  y -= 0.1 * clamp((-${SIM_BAND}.0 - ${SKIRT_W} - b) / ${SKIRT_W}, 0.0, 1.0);
  return vec4f(dispXZ.x, y, dispXZ.y, col + (b + 40.0) / 200.0);
}
`

/** waveXZ.xy, stretch, band — 与原生 VSOut 一致，供片元与海面共用 fs。 */
export const ribbonWaveVaryingsCode = `
fn ribbonWaveVaryings(
  pos: vec3f,
  simTex: texture_2d<f32>,
  mainTable: texture_2d<f32>,
  slope: f32, simZBase: f32, simTCam: f32
) -> vec4f {
  let t = simTCam + pos.y;
  let b = pos.x * (${SIM_SPAN}.0 + ${SIM_BAND}.0 + 2.0 * ${SKIRT_W}) - ${SIM_BAND}.0 - 2.0 * ${SKIRT_W};
  let col = clamp(((t - simZBase) / 160.0 + 0.5) * ${MAIN_COLS - 1}.0, 0.0, ${MAIN_COLS - 1}.0);
  let f = t / ${MAIN_TABLE_STEP} + ${MAIN_TABLE_N - 1}.0 * 0.5;
  let fc = clamp(f, 0.0, ${MAIN_TABLE_N - 1}.0);
  let j0 = min(i32(floor(fc)), ${MAIN_TABLE_N - 2});
  let a = fc - f32(j0);
  let c0 = textureLoad(mainTable, vec2i(j0, 0), 0);
  let c1 = textureLoad(mainTable, vec2i(j0 + 1, 0), 0);
  var c = mix(c0, c1, a);
  let n = normalize(c.zw);
  let over = (f - fc) * ${MAIN_TABLE_STEP};
  let coastP = c.xy + vec2f(-n.y, n.x) * over;
  let coastN = n;
  let matWorld = coastP + coastN * (-${REST_DEPTH} / slope + b);
  let sb = simBlend(b);
  let waveXZ = mix(matWorld, coastP + coastN * simRestS(b, slope), sb);
  let cc = wrapCol(col);
  var jA = i32(floor(cc));
  var jB = min(jA + 1, ${MAIN_COLS - 1});
  let fb = cc - floor(cc);
  let chainJ = mix(textureLoad(simTex, vec2i(0, jA), 0), textureLoad(simTex, vec2i(0, jB), 0), fb);
  let eS = 1.0;
  let fxP = clamp((b + eS) / (${SIM_SPAN}.0 / ${SIM_NODES - 1}.0), 0.0, ${SIM_NODES - 1}.0);
  let fxM = clamp((b - eS) / (${SIM_SPAN}.0 / ${SIM_NODES - 1}.0), 0.0, ${SIM_NODES - 1}.0);
  let iP0 = i32(floor(fxP));
  let iP1 = min(iP0 + 1, ${SIM_NODES - 1});
  let iM0 = i32(floor(fxM));
  let iM1 = min(iM0 + 1, ${SIM_NODES - 1});
  let chainP = mix(
    mix(textureLoad(simTex, vec2i(iP0, jA), 0), textureLoad(simTex, vec2i(iP1, jA), 0), fxP - floor(fxP)),
    mix(textureLoad(simTex, vec2i(iP0, jB), 0), textureLoad(simTex, vec2i(iP1, jB), 0), fxP - floor(fxP)), fb);
  let chainM = mix(
    mix(textureLoad(simTex, vec2i(iM0, jA), 0), textureLoad(simTex, vec2i(iM1, jA), 0), fxM - floor(fxM)),
    mix(textureLoad(simTex, vec2i(iM0, jB), 0), textureLoad(simTex, vec2i(iM1, jB), 0), fxM - floor(fxM)), fb);
  let stretch = abs(
    simRestS(b + eS, slope) + mix(chainJ.x, chainP.x, smoothstep(0.0, 12.0, b + eS))
    - (simRestS(b - eS, slope) + mix(chainJ.x, chainM.x, smoothstep(0.0, 12.0, b - eS)))
  ) / (2.0 * eS);
  return vec4f(waveXZ.x, waveXZ.y, stretch, b);
}
`

/** ribbon 的 gridXZ：原版 VSOut 中 ribbon 的 gridXZ = matWorld（未压缩的材质坐标）。 */
export const ribbonGridXZCode = `
fn ribbonGridXZ(
  pos: vec3f,
  mainTable: texture_2d<f32>,
  slope: f32, simZBase: f32, simTCam: f32
) -> vec2f {
  let t = simTCam + pos.y;
  let b = pos.x * (${SIM_SPAN}.0 + ${SIM_BAND}.0 + 2.0 * ${SKIRT_W}) - ${SIM_BAND}.0 - 2.0 * ${SKIRT_W};
  let f = t / ${MAIN_TABLE_STEP} + ${MAIN_TABLE_N - 1}.0 * 0.5;
  let fc = clamp(f, 0.0, ${MAIN_TABLE_N - 1}.0);
  let j0 = min(i32(floor(fc)), ${MAIN_TABLE_N - 2});
  let a = fc - f32(j0);
  let c0 = textureLoad(mainTable, vec2i(j0, 0), 0);
  let c1 = textureLoad(mainTable, vec2i(j0 + 1, 0), 0);
  var c = mix(c0, c1, a);
  let n = normalize(c.zw);
  let over = (f - fc) * ${MAIN_TABLE_STEP};
  let coastP = c.xy + vec2f(-n.y, n.x) * over;
  return coastP + n * (-${REST_DEPTH} / slope + b);
}
`

export const ribbonFragmentCode = `
fn ribbonFragmentMain(unused: f32) -> vec4f {
  return vec4f(0.0, 0.0, 0.0, 1.0);
}
`

export const filmFoamCode = `
fn filmFoamMain(
  uvc: vec2f,
  // prevFoam 必须放在第一个 texture：TSL 会把 samp 绑到 nodeUniform0_sampler，
  // 而 simTex 是 rgba32float DataTexture（仅 textureLoad），不会生成 sampler。
  prevFoam: texture_2d<f32>, samp: sampler, simTex: texture_2d<f32>,
  slope: f32, foamDecay: f32, foamDecayG: f32, foamRise: f32,
  foamDecaySwallow: f32, simZShift: f32
) -> vec4f {
  let b = uvc.x * (${SIM_BAND}.0 + ${SIM_SPAN}.0) - ${SIM_BAND}.0;
  let col = uvc.y * ${SIM_COLS}.0 - 0.5;
  let fx = clamp(b / (${SIM_SPAN}.0 / ${SIM_NODES - 1}.0), 0.0, ${SIM_NODES - 1}.0);
  let c = wrapCol(col);
  let i0 = i32(floor(fx));
  let i1 = min(i0 + 1, ${SIM_NODES - 1});
  var j0 = i32(floor(c));
  var j1 = j0 + 1;
  if (j0 >= ${MAIN_COLS}) {
    if (j1 >= ${SIM_COLS}) { j1 = ${MAIN_COLS}; }
  } else {
    j1 = min(j1, ${MAIN_COLS - 1});
  }
  let a = fx - floor(fx);
  let fb = c - floor(c);
  let sim = mix(
    mix(textureLoad(simTex, vec2i(i0, j0), 0), textureLoad(simTex, vec2i(i1, j0), 0), a),
    mix(textureLoad(simTex, vec2i(i0, j1), 0), textureLoad(simTex, vec2i(i1, j1), 0), a), fb);
  let e = 0.8;
  let restScale = ${REST_DEPTH} / slope / ${SIM_SPAN}.0;
  let b0 = max(b - e, 0.0);
  let b1 = min(b + e, ${SIM_SPAN}.0);
  let fx0 = clamp(b0 / (${SIM_SPAN}.0 / ${SIM_NODES - 1}.0), 0.0, ${SIM_NODES - 1}.0);
  let fx1 = clamp(b1 / (${SIM_SPAN}.0 / ${SIM_NODES - 1}.0), 0.0, ${SIM_NODES - 1}.0);
  let sim0 = mix(
    mix(textureLoad(simTex, vec2i(i32(floor(fx0)), j0), 0), textureLoad(simTex, vec2i(min(i32(floor(fx0))+1, ${SIM_NODES - 1}), j0), 0), fx0 - floor(fx0)),
    mix(textureLoad(simTex, vec2i(i32(floor(fx0)), j1), 0), textureLoad(simTex, vec2i(min(i32(floor(fx0))+1, ${SIM_NODES - 1}), j1), 0), fx0 - floor(fx0)), fb);
  let sim1 = mix(
    mix(textureLoad(simTex, vec2i(i32(floor(fx1)), j0), 0), textureLoad(simTex, vec2i(min(i32(floor(fx1))+1, ${SIM_NODES - 1}), j0), 0), fx1 - floor(fx1)),
    mix(textureLoad(simTex, vec2i(i32(floor(fx1)), j1), 0), textureLoad(simTex, vec2i(min(i32(floor(fx1))+1, ${SIM_NODES - 1}), j1), 0), fx1 - floor(fx1)), fb);
  let compress = (sim0.x - sim1.x) / (max(b1 - b0, 0.01) * restScale);
  let sNow = simRestS(b, slope) + sim.x;
  let sb = simBlend(b);
  let inFilm = sb * (1.0 - smoothstep(sim.z - 0.3, sim.z + 0.1, sNow));
  let gen = inFilm * smoothstep(0.25, 0.7, compress) * smoothstep(0.0, 8.0, b);
  let sJ = -${REST_DEPTH} / slope + mix(textureLoad(simTex, vec2i(0, j0), 0), textureLoad(simTex, vec2i(0, j1), 0), fb).x;
  let tyM = slope * simRestS(b, slope);
  let swallowed = sb * smoothstep(0.3, -0.7, sNow - sJ) * smoothstep(-1.2, -0.3, tyM);
  let decayR = mix(foamDecay, foamDecaySwallow, swallowed);
  var prevUV = uvc;
  if (col < ${MAIN_COLS}.0) {
    prevUV.y += simZShift / ${SIM_COLS}.0;
  }
  var prev = textureSampleLevel(prevFoam, samp, prevUV, 0.0);
  let pCol = prevUV.y * ${SIM_COLS}.0 - 0.5;
  if (col < ${MAIN_COLS}.0 && (pCol < -0.5 || pCol >= ${MAIN_COLS}.0 - 0.5)) {
    prev = vec4f(0.0);
  }
  let smoothR = mix(gen, prev.b, foamRise);
  let smoothG = mix(gen, prev.a, foamRise);
  return vec4f(max(prev.r * decayR, smoothR), max(prev.g * foamDecayG, smoothG), smoothR, smoothG);
}
`
