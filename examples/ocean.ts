// ============================================================================
// Ocean (gpuocean × tellux) — WebGPU 集成示例
//
// 移植自 D:\demo\MyProjects\gpuocean:
//   - CPU 部分(noise 生成 / 相位推进):原样移植
//   - GPU 部分(波场混合 / 泡沫 / 海洋着色):WGSL 经 three.js TSL 的
//     wgslFn 原样内嵌,渲染壳换成 QuadMesh + RenderTarget / NodeMaterial
//
// 单文件约束:tellux 的 sandcastle 会自动收录 examples 根目录 .ts 并剥离
// import,只注入 tellux / THREE / exampleMapServiceConfig 等固定绑定,
// 因此 three/tsl 与 three/webgpu 通过动态 import() 获取(不被剥离)。
// ============================================================================

import tellux from "../src"
import * as THREE from "three"
// 正式页面(ocean.html)走真实 import;sandcastle 剥离 import 后由 runner 注入同名绑定
import { exampleMapServiceConfig } from "./shared"
import {
  uv,
  uniform,
  texture,
  wgslFn,
  vec4,
  positionGeometry,
  modelWorldMatrix,
  cameraProjectionMatrix,
  renderGroup,
} from "three/tsl"
import { NodeMaterial, QuadMesh } from "three/webgpu"

// sandcastle 沙盒里 import 全部被剥离,runner 会注入 TSL / WEBGPU 两个命名空间参数;
// 真实页面上二者未定义,回退到上方静态 import。
declare const TSL: any
declare const WEBGPU: any

const tsl = typeof TSL !== "undefined" ? TSL : {
  uv,
  uniform,
  texture,
  wgslFn,
  vec4,
  positionGeometry,
  modelWorldMatrix,
  cameraProjectionMatrix,
  renderGroup,
}
const wgpu = typeof WEBGPU !== "undefined" ? WEBGPU : { NodeMaterial, QuadMesh }

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------
const OCEAN_LON = 122.0
const OCEAN_LAT = 30.0
const OCEAN_HEIGHT = 40
const SEA_HALF = 800
const GRID_N = 256
const GRAVITY = 9.81
const FOAM_SIZE = 512

const SCALE_RATIO = 0.68
const DIR_FRACS = [0, 0.9, -0.75, 0.45, -0.35, 0.7, -1, 0.2]
const UV_OFFSETS = [
  [0.11, 0.63], [0.42, 0.17], [0.78, 0.55], [0.05, 0.91],
  [0.33, 0.4], [0.66, 0.08], [0.9, 0.77], [0.24, 0.31],
]
const COPY_FACTORS = [-0.65, -0.3, 0.1, 0.4, 0.7]
const COPY_FACTORS_Y = [0.5, -0.35, -0.65, 0.2, 0.35]
const COPY_OFFSETS = [
  [0.13, 0.71], [0.53, 0.29], [0.87, 0.61], [0.31, 0.07], [0.67, 0.43],
]

// ---------------------------------------------------------------------------
// CPU 噪声生成(移植自 gpuocean/src/noise.js)
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let s = seed >>> 0
  return () => {
    let t = (s += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function fft1d(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      let t = re[i]
      re[i] = re[j]
      re[j] = t
      t = im[i]
      im[i] = im[j]
      im[j] = t
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let j = 0; j < len >> 1; j++) {
        const a = i + j
        const b = a + (len >> 1)
        const tr = re[b] * cr - im[b] * ci
        const ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
        const t = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = t
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n
      im[i] /= n
    }
  }
}

function fft2d(re: Float64Array, im: Float64Array, size: number, inverse: boolean) {
  const lr = new Float64Array(size)
  const li = new Float64Array(size)
  for (let y = 0; y < size; y++) {
    const off = y * size
    lr.set(re.subarray(off, off + size))
    li.set(im.subarray(off, off + size))
    fft1d(lr, li, inverse)
    re.set(lr, off)
    im.set(li, off)
  }
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      lr[y] = re[y * size + x]
      li[y] = im[y * size + x]
    }
    fft1d(lr, li, inverse)
    for (let y = 0; y < size; y++) {
      re[y * size + x] = lr[y]
      im[y * size + x] = li[y]
    }
  }
}

function comboSmoothLine(line: Float32Array, out: Float32Array, sigma: number, tmp: Float32Array) {
  const a = Math.exp(-1 / sigma)
  const decays = [a, a * a, a * a * a]
  const coeffs = [5, -4, 1]
  const n = line.length
  out.fill(0)
  let gain = 0
  for (let k = 0; k < 3; k++) {
    const decay = decays[k]
    const coeff = coeffs[k]
    gain += coeff * ((1 + decay) / (1 - decay))
    let s = 0
    for (let i = 0; i < n; i++) s = s * decay + line[i]
    for (let i = 0; i < n; i++) {
      s = s * decay + line[i]
      tmp[i] = s
    }
    s = 0
    for (let i = n - 1; i >= 0; i--) s = s * decay + line[i]
    for (let i = n - 1; i >= 0; i--) {
      s = s * decay + line[i]
      tmp[i] += s
    }
    for (let i = 0; i < n; i++) out[i] += coeff * (tmp[i] - line[i])
  }
  for (let i = 0; i < n; i++) out[i] /= gain
}

function smoothAxisX(src: Float32Array, size: number, sigma: number) {
  const dst = new Float32Array(src.length)
  const line = new Float32Array(size)
  const out = new Float32Array(size)
  const tmp = new Float32Array(size)
  for (let y = 0; y < size; y++) {
    const off = y * size
    line.set(src.subarray(off, off + size))
    comboSmoothLine(line, out, sigma, tmp)
    dst.set(out, off)
  }
  return dst
}

function smoothAxisYInPlace(data: Float32Array, size: number, sigma: number) {
  const line = new Float32Array(size)
  const out = new Float32Array(size)
  const tmp = new Float32Array(size)
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) line[y] = data[y * size + x]
    comboSmoothLine(line, out, sigma, tmp)
    for (let y = 0; y < size; y++) data[y * size + x] = out[y]
  }
}

function comboTransferAt(sigma: number, w: number) {
  const a = Math.exp(-1 / sigma)
  const cw = Math.cos(w)
  let num = 0
  let gain = 0
  const coeffs = [5, -4, 1]
  for (let k = 0; k < 3; k++) {
    const d = a ** (k + 1)
    num += (coeffs[k] * (1 - d * d)) / (1 - 2 * d * cw + d * d)
    gain += (coeffs[k] * (1 + d)) / (1 - d)
  }
  return num / gain
}

function randomArray(random: () => number, n: number) {
  const data = new Float32Array(n)
  for (let i = 0; i < n; i++) data[i] = random() * 2 - 1
  return data
}

function normalizeVariance(data: Float32Array) {
  let sq = 0
  for (let i = 0; i < data.length; i++) sq += data[i] * data[i]
  const sigma = Math.sqrt(sq / data.length)
  for (let i = 0; i < data.length; i++) data[i] /= sigma
}

function bandpass2D(src: Float32Array, size: number, sigmaSmall: number, sigmaLarge: number) {
  const a = smoothAxisX(src, size, sigmaSmall)
  smoothAxisYInPlace(a, size, sigmaSmall)
  const b = smoothAxisX(src, size, sigmaLarge)
  smoothAxisYInPlace(b, size, sigmaLarge)
  for (let i = 0; i < a.length; i++) a[i] -= b[i]
  normalizeVariance(a)
  return a
}

function gradients(h: Float32Array, size: number): [Float32Array, Float32Array] {
  const n = size * size
  const hx = new Float32Array(n)
  const hy = new Float32Array(n)
  for (let y = 0; y < size; y++) {
    const up = ((y + size - 1) % size) * size
    const down = ((y + 1) % size) * size
    const row = y * size
    for (let x = 0; x < size; x++) {
      const left = row + ((x + size - 1) % size)
      const right = row + ((x + 1) % size)
      hx[row + x] = (h[right] - h[left]) * 0.5
      hy[row + x] = (h[down + x] - h[up + x]) * 0.5
    }
  }
  return [hx, hy]
}

function wavesPerTile(h: Float32Array, hx: Float32Array, size: number) {
  let hSq = 0
  let hxSq = 0
  for (let i = 0; i < h.length; i++) {
    hSq += h[i] * h[i]
    hxSq += hx[i] * hx[i]
  }
  return (size * Math.sqrt(hxSq / hSq)) / (2 * Math.PI)
}

function gravityChannels(size: number, opts: any, seed: number, angle: number) {
  const sigmaAlong = opts.sigmaAlong ?? 3
  const sigmaAlongWide = opts.sigmaAlongWide ?? 9
  const sigmaCross = opts.sigmaCross ?? 14
  const random = mulberry32(seed)

  const n = size * size
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  re.set(randomArray(random, n))
  fft2d(re, im, size, false)

  const ca = Math.cos(angle)
  const sa = Math.sin(angle)
  const dRe = new Float64Array(n)
  const dIm = new Float64Array(n)
  for (let ky = 0; ky < size; ky++) {
    const wy = (2 * Math.PI * (ky > size / 2 ? ky - size : ky)) / size
    for (let kx = 0; kx < size; kx++) {
      const i = ky * size + kx
      const wx = (2 * Math.PI * (kx > size / 2 ? kx - size : kx)) / size
      const wAlong = wx * ca + wy * sa
      const wCross = -wx * sa + wy * ca
      const g =
        (comboTransferAt(sigmaAlong, wAlong) - comboTransferAt(sigmaAlongWide, wAlong)) *
        comboTransferAt(sigmaCross, wCross)
      const hr = re[i] * g
      const hi = im[i] * g
      re[i] = hr
      im[i] = hi
      const ar = 1 - Math.cos(wAlong)
      const ai = Math.sin(wAlong)
      const m = ar * ar + ai * ai
      if (m > 1e-12) {
        dRe[i] = (hr * ar + hi * ai) / m
        dIm[i] = (hi * ar - hr * ai) / m
      } else {
        re[i] = 0
        im[i] = 0
      }
    }
  }
  fft2d(re, im, size, true)
  fft2d(dRe, dIm, size, true)

  const h = new Float32Array(n)
  for (let i = 0; i < n; i++) h[i] = re[i]
  let hSq = 0
  for (let i = 0; i < n; i++) hSq += h[i] * h[i]
  const sigmaH = Math.sqrt(hSq / n)
  const d = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    h[i] /= sigmaH
    d[i] = dRe[i] / sigmaH
  }
  let dSq = 0
  for (let i = 0; i < n; i++) dSq += d[i] * d[i]
  return { h, d, sigmaD: Math.sqrt(dSq / n) }
}

function generateGravityNoiseData(opts: any = {}) {
  const size = opts.size ?? 256
  const angles = opts.angles ?? [-10, -5, 0, 5, 10].map((a) => (a * Math.PI) / 180)
  const seeds = [23456, 45678, 12345, 34567, 56789]
  const variants = angles.map((angle: number, i: number) => gravityChannels(size, opts, seeds[i], angle))
  const center = angles.indexOf(0)
  const sigmaD = variants[center].sigmaD
  const out: any[] = []
  for (const v of variants) {
    for (let i = 0; i < v.d.length; i++) v.d[i] /= -sigmaD
    const [hx, hy] = gradients(v.h, size)
    out.push({ h: v.h, d: v.d, hx, hy })
  }
  const [hx0] = gradients(variants[center].h, size)
  return {
    size,
    variants: out,
    wavesPerTile: wavesPerTile(variants[center].h, hx0, size),
    dispGradPerTexel: -1 / sigmaD,
  }
}

function generateCapillaryNoiseData(opts: any = {}) {
  const size = opts.size ?? 256
  const sigmaSmall = opts.sigmaSmall ?? 2
  const sigmaLarge = opts.sigmaLarge ?? 6
  const random = mulberry32(opts.seed ?? 54321)
  const n = size * size
  const h = bandpass2D(randomArray(random, n), size, sigmaSmall, sigmaLarge)
  const [hx, hy] = gradients(h, size)
  return { size, h, hx, hy, wavesPerTile: wavesPerTile(h, hx, size) }
}

function generateFoamPatternData(opts: any = {}) {
  const size = opts.size ?? 256
  const random = mulberry32(opts.seed ?? 777)
  const n = size * size
  const web = bandpass2D(randomArray(random, n), size, 2, 6)
  const mid = bandpass2D(randomArray(random, n), size, 3, 9)
  const fine = bandpass2D(randomArray(random, n), size, 1, 2.5)
  const density = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const w = Math.max(0, 1 - 1.2 * Math.abs(web[i]))
    density[i] = Math.min(Math.max(0.55 * w * w + 0.25 + 0.18 * mid[i] + 0.12 * fine[i], 0), 1)
  }
  const mips: Float32Array[] = [density]
  let cur = density
  let s = size
  while (s > 1) {
    const half = s / 2
    const next = new Float32Array(half * half)
    for (let y = 0; y < half; y++) {
      for (let x = 0; x < half; x++) {
        const o = 2 * y * s + 2 * x
        next[y * half + x] = (cur[o] + cur[o + 1] + cur[o + s] + cur[o + s + 1]) / 4
      }
    }
    mips.push(next)
    cur = next
    s = half
  }
  return { size, mips }
}

// ---------------------------------------------------------------------------
// 半精度打包与 DataTexture(移植自 gpuocean/src/gpu.js + noise.js)
// ---------------------------------------------------------------------------
const f32buf = new Float32Array(1)
const u32buf = new Uint32Array(f32buf.buffer)

function floatToHalf(value: number): number {
  f32buf[0] = value
  const bits = u32buf[0]
  const sign = (bits >>> 16) & 0x8000
  const e = ((bits >>> 23) & 0xff) - 112
  if (e <= 0) return sign
  if (e >= 31) return sign | 0x7bff
  return sign | (e << 10) | ((bits & 0x7fffff) >>> 13)
}

function packRGBA16F(r: Float32Array, g: Float32Array | null, b: Float32Array, a: Float32Array): Uint16Array {
  const n = r.length
  const data = new Uint16Array(n * 4)
  for (let i = 0; i < n; i++) {
    data[i * 4] = floatToHalf(r[i])
    data[i * 4 + 1] = g ? floatToHalf(g[i]) : 0
    data[i * 4 + 2] = floatToHalf(b[i])
    data[i * 4 + 3] = floatToHalf(a[i])
  }
  return data
}

function configureDataTarget(rt: THREE.RenderTarget, wrap: THREE.Wrapping = THREE.ClampToEdgeWrapping) {
  rt.texture.colorSpace = THREE.NoColorSpace
  rt.texture.minFilter = THREE.LinearFilter
  rt.texture.magFilter = THREE.LinearFilter
  rt.texture.generateMipmaps = false
  rt.texture.wrapS = rt.texture.wrapT = wrap
}

/** 与 `src/utils/EncodedCartesian3.ts` 相同的 Cesium 高低位拆分，对抗 ECEF Float32 抖动。 */
const ECEF_ENCODE_SHIFT = 65536
function encodeEcefComponent(value: number): [number, number] {
  const sign = value >= 0 ? 1 : -1
  const high = sign * Math.floor(Math.abs(value) / ECEF_ENCODE_SHIFT) * ECEF_ENCODE_SHIFT
  return [high, value - high]
}
function encodeEcef(src: THREE.Vector3, high: THREE.Vector3, low: THREE.Vector3) {
  const [hx, lx] = encodeEcefComponent(src.x)
  const [hy, ly] = encodeEcefComponent(src.y)
  const [hz, lz] = encodeEcefComponent(src.z)
  high.set(hx, hy, hz)
  low.set(lx, ly, lz)
}

function floatDataTexture(data: Uint16Array, size: number, opts: any = {}) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.HalfFloatType)
  tex.wrapS = tex.wrapT = opts.repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = opts.mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter
  tex.generateMipmaps = false
  tex.colorSpace = THREE.NoColorSpace
  if (opts.mipmaps) tex.mipmaps = opts.mipmaps
  tex.needsUpdate = true
  return tex
}

function buildOceanTextures() {
  const g = generateGravityNoiseData()
  const gravity = g.variants.map((v: any) => floatDataTexture(packRGBA16F(v.h, v.d, v.hx, v.hy), g.size))
  const cap = generateCapillaryNoiseData()
  const capillary = floatDataTexture(packRGBA16F(cap.h, null, cap.hx, cap.hy), cap.size)
  const pat = generateFoamPatternData()
  const mips = pat.mips.map((m: Float32Array, i: number) => {
    const s = pat.size >> i
    const data = new Uint16Array(s * s * 4)
    for (let j = 0; j < m.length; j++) data[j * 4] = floatToHalf(m[j])
    return { data, width: s, height: s }
  })
  const foamPattern = floatDataTexture(mips[0].data, pat.size, { repeat: false, mipmaps: mips.slice(1) })
  return {
    gravity,
    gravitySize: g.size,
    gravityWavesPerTile: g.wavesPerTile,
    gravityDispGrad: g.dispGradPerTexel,
    capillary,
    capillarySize: cap.size,
    capillaryWavesPerTile: cap.wavesPerTile,
    foamPattern,
  }
}

// ---------------------------------------------------------------------------
// WGSL(与 gpuocean shaders 一致,展开 8 层;经 wgslFn 内嵌)
// ---------------------------------------------------------------------------
const layerUVCode = `
fn layerUV(xz: vec2f, dir: vec2f, invL: f32, scroll: vec2f) -> vec2f {
  return vec2f(dot(xz, dir), dot(xz, vec2f(-dir.y, dir.x))) * invL + scroll;
}
`

const waveFieldCode = `
fn waveFieldMain(uvc: vec2f,
                 c0: vec4f, c1: vec4f, c2: vec4f, c3: vec4f, c4: vec4f,
                 n0: texture_2d<f32>, n1: texture_2d<f32>, n2: texture_2d<f32>, n3: texture_2d<f32>, n4: texture_2d<f32>,
                 samp: sampler) -> vec4f {
  var acc = c0.z * textureSampleLevel(n0, samp, uvc + c0.xy, 0.0);
  acc += c1.z * textureSampleLevel(n1, samp, uvc + c1.xy, 0.0);
  acc += c2.z * textureSampleLevel(n2, samp, uvc + c2.xy, 0.0);
  acc += c3.z * textureSampleLevel(n3, samp, uvc + c3.xy, 0.0);
  acc += c4.z * textureSampleLevel(n4, samp, uvc + c4.xy, 0.0);
  return acc;
}
`

const vertexCode = `
fn oceanVertex(xz: vec2f,
               waveTex: texture_2d<f32>, samp: sampler,
               d0: vec4f, s0: vec4f, d1: vec4f, s1: vec4f, d2: vec4f, s2: vec4f, d3: vec4f, s3: vec4f,
               d4: vec4f, s4: vec4f, d5: vec4f, s5: vec4f, d6: vec4f, s6: vec4f, d7: vec4f, s7: vec4f,
               numLayers: f32, choppiness: f32, dGrad: f32, hGrad: f32, ampInv: f32) -> vec3f {
  var height = 0.0;
  var disp = vec2f(0.0);
  if (numLayers > 0.5) {
    let dir = d0.xy; let invL = d0.z; let amp = d0.w;
    let s = textureSampleLevel(waveTex, samp, layerUV(xz, dir, invL, s0.xy), 0.0);
    height += amp * s.x;
    disp += choppiness * amp * s.y * dir;
  }
  if (numLayers > 1.5) {
    let dir = d1.xy; let invL = d1.z; let amp = d1.w;
    let s = textureSampleLevel(waveTex, samp, layerUV(xz, dir, invL, s1.xy), 0.0);
    height += amp * s.x;
    disp += choppiness * amp * s.y * dir;
  }
  if (numLayers > 2.5) {
    let dir = d2.xy; let invL = d2.z; let amp = d2.w;
    let s = textureSampleLevel(waveTex, samp, layerUV(xz, dir, invL, s2.xy), 0.0);
    height += amp * s.x;
    disp += choppiness * amp * s.y * dir;
  }
  if (numLayers > 3.5) {
    let dir = d3.xy; let invL = d3.z; let amp = d3.w;
    let s = textureSampleLevel(waveTex, samp, layerUV(xz, dir, invL, s3.xy), 0.0);
    height += amp * s.x;
    disp += choppiness * amp * s.y * dir;
  }
  if (numLayers > 4.5) {
    let dir = d4.xy; let invL = d4.z; let amp = d4.w;
    let s = textureSampleLevel(waveTex, samp, layerUV(xz, dir, invL, s4.xy), 0.0);
    height += amp * s.x;
    disp += choppiness * amp * s.y * dir;
  }
  if (numLayers > 5.5) {
    let dir = d5.xy; let invL = d5.z; let amp = d5.w;
    let s = textureSampleLevel(waveTex, samp, layerUV(xz, dir, invL, s5.xy), 0.0);
    height += amp * s.x;
    disp += choppiness * amp * s.y * dir;
  }
  if (numLayers > 6.5) {
    let dir = d6.xy; let invL = d6.z; let amp = d6.w;
    let s = textureSampleLevel(waveTex, samp, layerUV(xz, dir, invL, s6.xy), 0.0);
    height += amp * s.x;
    disp += choppiness * amp * s.y * dir;
  }
  if (numLayers > 7.5) {
    let dir = d7.xy; let invL = d7.z; let amp = d7.w;
    let s = textureSampleLevel(waveTex, samp, layerUV(xz, dir, invL, s7.xy), 0.0);
    height += amp * s.x;
    disp += choppiness * amp * s.y * dir;
  }
  // gpuocean 与 Tellux 当地架都是 Y-up：X/Z 水平，Y 为波高。
  // 不要写成 vec3(xz + disp, height)（那是 Z-up，海面会立起来）。
  return vec3f(xz.x + disp.x, height, xz.y + disp.y);
}
`

const fragmentCode = `
fn oceanFragment(world: vec3f, waveXZ: vec2f,
                 waveTex: texture_2d<f32>, foamTex: texture_2d<f32>, foamPatTex: texture_2d<f32>, samp: sampler,
                 d0: vec4f, s0: vec4f, d1: vec4f, s1: vec4f, d2: vec4f, s2: vec4f, d3: vec4f, s3: vec4f,
                 d4: vec4f, s4: vec4f, d5: vec4f, s5: vec4f, d6: vec4f, s6: vec4f, d7: vec4f, s7: vec4f,
                 numLayers: f32, choppiness: f32, dGrad: f32, hGrad: f32, ampInv: f32,
                 foamRegion: f32, foamScale: f32,
                 cameraPos: vec3f, sunDir: vec3f) -> vec4f {
  var dPx = vec3f(1.0, 0.0, 0.0);
  var dPz = vec3f(0.0, 0.0, 1.0);
  if (numLayers > 0.5) {
    let dir = d0.xy; let invL = d0.z; let amp = d0.w;
    let s = textureSample(waveTex, samp, layerUV(waveXZ, dir, invL, s0.xy));
    let duvdx = vec2f(dir.x, -dir.y) * invL;
    let duvdz = vec2f(dir.y, dir.x) * invL;
    let grad = vec2f(s.z, s.w) * hGrad;
    let dDdu = choppiness * amp * s.x * dGrad;
    dPx += vec3f(dir.x * dDdu * duvdx.x, amp * dot(grad, duvdx), dir.y * dDdu * duvdx.x);
    dPz += vec3f(dir.x * dDdu * duvdz.x, amp * dot(grad, duvdz), dir.y * dDdu * duvdz.x);
  }
  if (numLayers > 1.5) {
    let dir = d1.xy; let invL = d1.z; let amp = d1.w;
    let s = textureSample(waveTex, samp, layerUV(waveXZ, dir, invL, s1.xy));
    let duvdx = vec2f(dir.x, -dir.y) * invL;
    let duvdz = vec2f(dir.y, dir.x) * invL;
    let grad = vec2f(s.z, s.w) * hGrad;
    let dDdu = choppiness * amp * s.x * dGrad;
    dPx += vec3f(dir.x * dDdu * duvdx.x, amp * dot(grad, duvdx), dir.y * dDdu * duvdx.x);
    dPz += vec3f(dir.x * dDdu * duvdz.x, amp * dot(grad, duvdz), dir.y * dDdu * duvdz.x);
  }
  if (numLayers > 2.5) {
    let dir = d2.xy; let invL = d2.z; let amp = d2.w;
    let s = textureSample(waveTex, samp, layerUV(waveXZ, dir, invL, s2.xy));
    let duvdx = vec2f(dir.x, -dir.y) * invL;
    let duvdz = vec2f(dir.y, dir.x) * invL;
    let grad = vec2f(s.z, s.w) * hGrad;
    let dDdu = choppiness * amp * s.x * dGrad;
    dPx += vec3f(dir.x * dDdu * duvdx.x, amp * dot(grad, duvdx), dir.y * dDdu * duvdx.x);
    dPz += vec3f(dir.x * dDdu * duvdz.x, amp * dot(grad, duvdz), dir.y * dDdu * duvdz.x);
  }
  if (numLayers > 3.5) {
    let dir = d3.xy; let invL = d3.z; let amp = d3.w;
    let s = textureSample(waveTex, samp, layerUV(waveXZ, dir, invL, s3.xy));
    let duvdx = vec2f(dir.x, -dir.y) * invL;
    let duvdz = vec2f(dir.y, dir.x) * invL;
    let grad = vec2f(s.z, s.w) * hGrad;
    let dDdu = choppiness * amp * s.x * dGrad;
    dPx += vec3f(dir.x * dDdu * duvdx.x, amp * dot(grad, duvdx), dir.y * dDdu * duvdx.x);
    dPz += vec3f(dir.x * dDdu * duvdz.x, amp * dot(grad, duvdz), dir.y * dDdu * duvdz.x);
  }
  if (numLayers > 4.5) {
    let dir = d4.xy; let invL = d4.z; let amp = d4.w;
    let s = textureSample(waveTex, samp, layerUV(waveXZ, dir, invL, s4.xy));
    let duvdx = vec2f(dir.x, -dir.y) * invL;
    let duvdz = vec2f(dir.y, dir.x) * invL;
    let grad = vec2f(s.z, s.w) * hGrad;
    let dDdu = choppiness * amp * s.x * dGrad;
    dPx += vec3f(dir.x * dDdu * duvdx.x, amp * dot(grad, duvdx), dir.y * dDdu * duvdx.x);
    dPz += vec3f(dir.x * dDdu * duvdz.x, amp * dot(grad, duvdz), dir.y * dDdu * duvdz.x);
  }
  if (numLayers > 5.5) {
    let dir = d5.xy; let invL = d5.z; let amp = d5.w;
    let s = textureSample(waveTex, samp, layerUV(waveXZ, dir, invL, s5.xy));
    let duvdx = vec2f(dir.x, -dir.y) * invL;
    let duvdz = vec2f(dir.y, dir.x) * invL;
    let grad = vec2f(s.z, s.w) * hGrad;
    let dDdu = choppiness * amp * s.x * dGrad;
    dPx += vec3f(dir.x * dDdu * duvdx.x, amp * dot(grad, duvdx), dir.y * dDdu * duvdx.x);
    dPz += vec3f(dir.x * dDdu * duvdz.x, amp * dot(grad, duvdz), dir.y * dDdu * duvdz.x);
  }
  if (numLayers > 6.5) {
    let dir = d6.xy; let invL = d6.z; let amp = d6.w;
    let s = textureSample(waveTex, samp, layerUV(waveXZ, dir, invL, s6.xy));
    let duvdx = vec2f(dir.x, -dir.y) * invL;
    let duvdz = vec2f(dir.y, dir.x) * invL;
    let grad = vec2f(s.z, s.w) * hGrad;
    let dDdu = choppiness * amp * s.x * dGrad;
    dPx += vec3f(dir.x * dDdu * duvdx.x, amp * dot(grad, duvdx), dir.y * dDdu * duvdx.x);
    dPz += vec3f(dir.x * dDdu * duvdz.x, amp * dot(grad, duvdz), dir.y * dDdu * duvdz.x);
  }
  if (numLayers > 7.5) {
    let dir = d7.xy; let invL = d7.z; let amp = d7.w;
    let s = textureSample(waveTex, samp, layerUV(waveXZ, dir, invL, s7.xy));
    let duvdx = vec2f(dir.x, -dir.y) * invL;
    let duvdz = vec2f(dir.y, dir.x) * invL;
    let grad = vec2f(s.z, s.w) * hGrad;
    let dDdu = choppiness * amp * s.x * dGrad;
    dPx += vec3f(dir.x * dDdu * duvdx.x, amp * dot(grad, duvdx), dir.y * dDdu * duvdx.x);
    dPz += vec3f(dir.x * dDdu * duvdz.x, amp * dot(grad, duvdz), dir.y * dDdu * duvdz.x);
  }
  var n = normalize(cross(dPz, dPx));
  let v = normalize(cameraPos - world);
  if (dot(n, v) < 0.0) { n = -n; }
  let fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  let r = reflect(-v, n);
  let t = pow(clamp(r.y, 0.0, 1.0), 0.6);
  let horizon = vec3f(0.62, 0.72, 0.83);
  let zenith = vec3f(0.11, 0.30, 0.60);
  let skyC = mix(horizon, zenith, t) + vec3f(1.0, 0.97, 0.9) * pow(max(dot(r, sunDir), 0.0), 40.0) * 0.25;
  let water = vec3f(0.004, 0.02, 0.05);
  var color = mix(water, skyC, fresnel);
  color += vec3f(1.0, 0.97, 0.9) * pow(max(dot(r, sunDir), 0.0), 600.0) * 8.0;
  let fuv = waveXZ / (2.0 * foamRegion) + 0.5;
  let foamRaw = textureSample(foamTex, samp, fuv).r;
  let pat = textureSample(foamPatTex, samp, waveXZ / (5.0 * foamScale)).r;
  let mask = smoothstep(0.0, 0.15, pat - (1.05 - 1.15 * foamRaw));
  color = mix(color, vec3f(1.0, 0.97, 0.9) * 0.72, mask);
  // gpuocean 的显示端 tonemap；Tellux 的 AgX 不再套一层（材质 toneMapped=false）。
  color = 1.0 - exp(-1.8 * color);
  return vec4f(color, 1.0);
}
`

const foamCode = `
fn foamMain(uvc: vec2f,
            waveTex: texture_2d<f32>, prevFoam: texture_2d<f32>, samp: sampler,
            d0: vec4f, s0: vec4f, d1: vec4f, s1: vec4f, d2: vec4f, s2: vec4f, d3: vec4f, s3: vec4f,
            d4: vec4f, s4: vec4f, d5: vec4f, s5: vec4f, d6: vec4f, s6: vec4f, d7: vec4f, s7: vec4f,
            numLayers: f32, choppiness: f32, dGrad: f32, hGrad: f32, ampInv: f32,
            foamCX: f32, foamCZ: f32, foamDX: f32, foamDZ: f32,
            foamThreshold: f32, foamRegion: f32, foamDecay: f32, foamDecayG: f32, foamRise: f32,
            seaDepth: f32) -> vec4f {
  var dxx = 1.0;
  var dxz = 0.0;
  var dzx = 0.0;
  var dzz = 1.0;
  var height = 0.0;
  var gradH = vec2f(0.0);
  let xz = vec2f(foamCX, foamCZ) + (uvc - 0.5) * (2.0 * foamRegion);
  if (numLayers > 0.5) {
    let dir = d0.xy; let invL = d0.z; let amp = d0.w;
    let s = textureSampleLevel(waveTex, samp, layerUV(xz, dir, invL, s0.xy), 0.0);
    let duvdx = vec2f(dir.x, -dir.y) * invL;
    let duvdz = vec2f(dir.y, dir.x) * invL;
    let grad = vec2f(s.z, s.w) * hGrad;
    let dDdu = choppiness * amp * s.x * dGrad;
    height += amp * s.x;
    gradH += amp * vec2f(dot(grad, duvdx), dot(grad, duvdz));
    dxx += dir.x * dDdu * duvdx.x;
    dxz += dir.y * dDdu * duvdx.x;
    dzx += dir.x * dDdu * duvdz.x;
    dzz += dir.y * dDdu * duvdz.x;
  }
  if (numLayers > 1.5) {
    let dir = d1.xy; let invL = d1.z; let amp = d1.w;
    let s = textureSampleLevel(waveTex, samp, layerUV(xz, dir, invL, s1.xy), 0.0);
    let duvdx = vec2f(dir.x, -dir.y) * invL;
    let duvdz = vec2f(dir.y, dir.x) * invL;
    let grad = vec2f(s.z, s.w) * hGrad;
    let dDdu = choppiness * amp * s.x * dGrad;
    height += amp * s.x;
    gradH += amp * vec2f(dot(grad, duvdx), dot(grad, duvdz));
    dxx += dir.x * dDdu * duvdx.x;
    dxz += dir.y * dDdu * duvdx.x;
    dzx += dir.x * dDdu * duvdz.x;
    dzz += dir.y * dDdu * duvdz.x;
  }
  if (numLayers > 2.5) {
    let dir = d2.xy; let invL = d2.z; let amp = d2.w;
    let s = textureSampleLevel(waveTex, samp, layerUV(xz, dir, invL, s2.xy), 0.0);
    let duvdx = vec2f(dir.x, -dir.y) * invL;
    let duvdz = vec2f(dir.y, dir.x) * invL;
    let grad = vec2f(s.z, s.w) * hGrad;
    let dDdu = choppiness * amp * s.x * dGrad;
    height += amp * s.x;
    gradH += amp * vec2f(dot(grad, duvdx), dot(grad, duvdz));
    dxx += dir.x * dDdu * duvdx.x;
    dxz += dir.y * dDdu * duvdx.x;
    dzx += dir.x * dDdu * duvdz.x;
    dzz += dir.y * dDdu * duvdz.x;
  }
  if (numLayers > 3.5) {
    let dir = d3.xy; let invL = d3.z; let amp = d3.w;
    let s = textureSampleLevel(waveTex, samp, layerUV(xz, dir, invL, s3.xy), 0.0);
    let duvdx = vec2f(dir.x, -dir.y) * invL;
    let duvdz = vec2f(dir.y, dir.x) * invL;
    let grad = vec2f(s.z, s.w) * hGrad;
    let dDdu = choppiness * amp * s.x * dGrad;
    height += amp * s.x;
    gradH += amp * vec2f(dot(grad, duvdx), dot(grad, duvdz));
    dxx += dir.x * dDdu * duvdx.x;
    dxz += dir.y * dDdu * duvdx.x;
    dzx += dir.x * dDdu * duvdz.x;
    dzz += dir.y * dDdu * duvdz.x;
  }
  if (numLayers > 4.5) {
    let dir = d4.xy; let invL = d4.z; let amp = d4.w;
    let s = textureSampleLevel(waveTex, samp, layerUV(xz, dir, invL, s4.xy), 0.0);
    let duvdx = vec2f(dir.x, -dir.y) * invL;
    let duvdz = vec2f(dir.y, dir.x) * invL;
    let grad = vec2f(s.z, s.w) * hGrad;
    let dDdu = choppiness * amp * s.x * dGrad;
    height += amp * s.x;
    gradH += amp * vec2f(dot(grad, duvdx), dot(grad, duvdz));
    dxx += dir.x * dDdu * duvdx.x;
    dxz += dir.y * dDdu * duvdx.x;
    dzx += dir.x * dDdu * duvdz.x;
    dzz += dir.y * dDdu * duvdz.x;
  }
  if (numLayers > 5.5) {
    let dir = d5.xy; let invL = d5.z; let amp = d5.w;
    let s = textureSampleLevel(waveTex, samp, layerUV(xz, dir, invL, s5.xy), 0.0);
    let duvdx = vec2f(dir.x, -dir.y) * invL;
    let duvdz = vec2f(dir.y, dir.x) * invL;
    let grad = vec2f(s.z, s.w) * hGrad;
    let dDdu = choppiness * amp * s.x * dGrad;
    height += amp * s.x;
    gradH += amp * vec2f(dot(grad, duvdx), dot(grad, duvdz));
    dxx += dir.x * dDdu * duvdx.x;
    dxz += dir.y * dDdu * duvdx.x;
    dzx += dir.x * dDdu * duvdz.x;
    dzz += dir.y * dDdu * duvdz.x;
  }
  if (numLayers > 6.5) {
    let dir = d6.xy; let invL = d6.z; let amp = d6.w;
    let s = textureSampleLevel(waveTex, samp, layerUV(xz, dir, invL, s6.xy), 0.0);
    let duvdx = vec2f(dir.x, -dir.y) * invL;
    let duvdz = vec2f(dir.y, dir.x) * invL;
    let grad = vec2f(s.z, s.w) * hGrad;
    let dDdu = choppiness * amp * s.x * dGrad;
    height += amp * s.x;
    gradH += amp * vec2f(dot(grad, duvdx), dot(grad, duvdz));
    dxx += dir.x * dDdu * duvdx.x;
    dxz += dir.y * dDdu * duvdx.x;
    dzx += dir.x * dDdu * duvdz.x;
    dzz += dir.y * dDdu * duvdz.x;
  }
  if (numLayers > 7.5) {
    let dir = d7.xy; let invL = d7.z; let amp = d7.w;
    let s = textureSampleLevel(waveTex, samp, layerUV(xz, dir, invL, s7.xy), 0.0);
    let duvdx = vec2f(dir.x, -dir.y) * invL;
    let duvdz = vec2f(dir.y, dir.x) * invL;
    let grad = vec2f(s.z, s.w) * hGrad;
    let dDdu = choppiness * amp * s.x * dGrad;
    height += amp * s.x;
    gradH += amp * vec2f(dot(grad, duvdx), dot(grad, duvdz));
    dxx += dir.x * dDdu * duvdx.x;
    dxz += dir.y * dDdu * duvdx.x;
    dzx += dir.x * dDdu * duvdz.x;
    dzz += dir.y * dDdu * duvdz.x;
  }
  let jac = dxx * dzz - dxz * dzx;
  let waterGate = 1.0;
  let dNow = max(seaDepth, 0.05);
  let genSurf = smoothstep(0.55, 0.9, height / dNow) * smoothstep(0.0, 0.5, dNow) * waterGate;
  let genR = max(smoothstep(foamThreshold, foamThreshold - 0.25, jac) * waterGate, genSurf);
  let genG = max(smoothstep(foamThreshold - 0.15, foamThreshold - 0.45, jac) * waterGate, genSurf);
  var prev = textureSampleLevel(prevFoam, samp, uvc + vec2f(foamDX, foamDZ), 0.0);
  let smoothR = mix(genR, prev.b, foamRise);
  let smoothG = mix(genG, prev.a, foamRise);
  return vec4f(max(prev.r * foamDecay, smoothR), max(prev.g * foamDecayG, smoothG), smoothR, smoothG);
}
`

// ---------------------------------------------------------------------------
// 海洋网格
// ---------------------------------------------------------------------------
function buildSeaGeometry(seaHalf: number, gridN: number): THREE.BufferGeometry {
  const n = gridN
  const cell = (2 * seaHalf) / n
  const positions = new Float32Array((n + 1) * (n + 1) * 3)
  const indices = new Uint32Array(n * n * 6)
  let p = 0
  for (let iz = 0; iz <= n; iz++) {
    for (let ix = 0; ix <= n; ix++) {
      positions[p++] = (ix - n / 2) * cell
      positions[p++] = 0
      positions[p++] = (iz - n / 2) * cell
    }
  }
  let t = 0
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const a = z * (n + 1) + x
      const b = a + 1
      const c = a + n + 1
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

// ---------------------------------------------------------------------------
// 波场模拟(QuadMesh + RenderTarget)
// ---------------------------------------------------------------------------
class WaveFieldSim {
  texture: THREE.Texture
  size: number
  private rt: THREE.RenderTarget
  private quad: any
  private copies: any[]
  private phases = new Float64Array(COPY_FACTORS.length)
  private phasesY = new Float64Array(COPY_FACTORS.length)

  constructor(tsl: any, wgpu: any, noiseTextures: THREE.Texture[], size: number) {
    const { uniform, texture, wgslFn, uv } = tsl
    const { NodeMaterial, QuadMesh } = wgpu
    this.size = size
    this.rt = new THREE.RenderTarget(size, size, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      samples: 0,
    })
    configureDataTarget(this.rt, THREE.RepeatWrapping)
    this.texture = this.rt.texture

    this.copies = COPY_FACTORS.map(() => uniform(new THREE.Vector4()))
    const texNodes = noiseTextures.map((t) => texture(t))
    const fn = wgslFn(waveFieldCode)
    const mat = new NodeMaterial()
    mat.lights = false
    mat.toneMapped = false
    mat.fragmentNode = fn(
      uv(),
      ...this.copies,
      ...texNodes,
      texNodes[0]
    )
    this.quad = new QuadMesh(mat)
  }

  update(dt: number, texFreq: number, dispersion: number) {
    const weight = 1 / Math.sqrt(COPY_FACTORS.length)
    for (let i = 0; i < COPY_FACTORS.length; i++) {
      this.phases[i] += COPY_FACTORS[i] * dispersion * texFreq * dt
      this.phasesY[i] += COPY_FACTORS_Y[i] * dispersion * texFreq * dt
      this.copies[i].value.set(
        COPY_OFFSETS[i][0] - this.phases[i],
        COPY_OFFSETS[i][1] - this.phasesY[i],
        weight,
        0
      )
    }
  }

  render(renderer: any) {
    renderer.setRenderTarget(this.rt)
    renderer.render(this.quad, this.quad.camera)
    renderer.setRenderTarget(null)
  }
}

// ---------------------------------------------------------------------------
// 泡沫模拟(ping-pong)
// ---------------------------------------------------------------------------
class FoamSim {
  texture: THREE.Texture
  size: number
  private views: THREE.Texture[]
  private rts: THREE.RenderTarget[]
  private quad: any
  private prevTexNode: any
  private d: any[]
  private s: any[]
  private numLayersU: any
  private choppinessU: any
  private ampInvU: any
  private hGradU: any
  private dGradU: any
  private thresholdU: any
  private decayU: any
  private decayGU: any
  private riseU: any
  private index = 0

  constructor(tsl: any, wgpu: any, waveTexture: THREE.Texture, noiseSize: number, dispGrad: number, size = FOAM_SIZE) {
    const { uniform, texture, wgslFn, uv } = tsl
    const { NodeMaterial, QuadMesh } = wgpu
    this.size = size
    this.rts = [0, 1].map(() => {
      const rt = new THREE.RenderTarget(size, size, {
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
        depthBuffer: false,
        samples: 0,
      })
      configureDataTarget(rt)
      return rt
    })
    this.views = this.rts.map((rt) => rt.texture)
    this.texture = this.views[0]

    this.d = Array.from({ length: 8 }, () => uniform(new THREE.Vector4()))
    this.s = Array.from({ length: 8 }, () => uniform(new THREE.Vector4()))
    this.numLayersU = uniform(5)
    this.choppinessU = uniform(1.5)
    this.ampInvU = uniform(1)
    this.hGradU = uniform(noiseSize * dispGrad)
    this.dGradU = uniform(dispGrad)
    this.thresholdU = uniform(0.6)
    this.decayU = uniform(0.99)
    this.decayGU = uniform(0.99)
    this.riseU = uniform(0.5)

    this.prevTexNode = texture(this.views[0])
    const waveTexNode = texture(waveTexture)
    const fn = wgslFn(foamCode, [tsl.wgslFn(layerUVCode)])
    const mat = new NodeMaterial()
    mat.lights = false
    mat.toneMapped = false
    mat.fragmentNode = fn(
      uv(),
      waveTexNode,
      this.prevTexNode,
      waveTexNode,
      ...this.d, ...this.s,
      this.numLayersU, this.choppinessU, this.dGradU, this.hGradU, this.ampInvU,
      uniform(0), uniform(0), uniform(0), uniform(0),
      this.thresholdU,
      uniform(80),
      this.decayU,
      this.decayGU,
      this.riseU,
      uniform(8)
    )
    this.quad = new QuadMesh(mat)
  }

  syncLayers(d: any[], s: any[], numLayers: number, choppiness: number, ampInv: number) {
    for (let i = 0; i < 8; i++) {
      this.d[i].value.copy(d[i].value)
      this.s[i].value.copy(s[i].value)
    }
    this.numLayersU.value = numLayers
    this.choppinessU.value = choppiness
    this.ampInvU.value = ampInv
  }

  setParams(foam: number, foamLife: number, dt: number) {
    this.thresholdU.value = foam
    this.decayU.value = Math.exp(-dt / foamLife)
    this.decayGU.value = Math.exp(-dt / (foamLife * 0.25))
    this.riseU.value = Math.exp(-dt / 0.08)
  }

  render(renderer: any) {
    const dst = this.index ^ 1
    this.prevTexNode.value = this.views[this.index]
    renderer.setRenderTarget(this.rts[dst])
    renderer.render(this.quad, this.quad.camera)
    renderer.setRenderTarget(null)
    this.index = dst
    this.texture = this.views[dst]
  }
}

// ---------------------------------------------------------------------------
// 海洋表面(网格 + NodeMaterial)
// ---------------------------------------------------------------------------
interface OceanParams {
  wavelength: number
  amplitude: number
  choppiness: number
  layers: number
  spread: number
  waveDir: number
  dispersion: number
}

class OceanSurface {
  readonly mesh: THREE.Mesh
  readonly material: any
  private time = 0
  private phases = new Float64Array(8)
  private d: any[]
  private s: any[]
  private numLayersU: any
  private choppinessU: any
  private ampInvU: any
  private sunDirU: any
  private cameraPosU: any
  private foamTexNode: any
  private foamRegionU: any
  private foamScaleU: any
  private hGradU: any
  private dGradU: any
  private wavesPerTile: number
  private dispGrad: number
  private fullMatrix = new THREE.Matrix4()
  private invFull = new THREE.Matrix4()

  constructor(
    tsl: any,
    wgpu: any,
    geometry: THREE.BufferGeometry,
    waveTexture: THREE.Texture,
    wavesPerTile: number,
    dispGrad: number,
    noiseSize: number,
    lon: number,
    lat: number,
    viewer: any,
    foamPatternTexture: THREE.Texture,
    rtc: { uniforms: any; update: () => void }
  ) {
    const {
      uniform,
      texture,
      wgslFn,
      vec4,
      positionGeometry,
      modelWorldMatrix,
      cameraProjectionMatrix,
      renderGroup,
    } = tsl
    const { NodeMaterial } = wgpu
    this.wavesPerTile = wavesPerTile
    this.dispGrad = dispGrad

    this.d = Array.from({ length: 8 }, () => uniform(new THREE.Vector4()))
    this.s = Array.from({ length: 8 }, () => uniform(new THREE.Vector4()))
    this.numLayersU = uniform(5)
    this.choppinessU = uniform(1.5)
    this.ampInvU = uniform(1)
    this.hGradU = uniform(noiseSize * dispGrad)
    this.dGradU = uniform(dispGrad)
    this.sunDirU = uniform(new THREE.Vector3(0.35, 0.72, -0.28).normalize())
    this.cameraPosU = uniform(new THREE.Vector3(0, 700, 0))
    const dummyFoam = new THREE.DataTexture(new Uint8Array(4), 1, 1)
    dummyFoam.needsUpdate = true
    this.foamTexNode = texture(dummyFoam)
    this.foamRegionU = uniform(80)
    this.foamScaleU = uniform(1)

    this.fullMatrix.copy(viewer.cartographicToMatrix4([lon, lat, OCEAN_HEIGHT]))
    const origin = new THREE.Vector3().setFromMatrixPosition(this.fullMatrix)
    const originHigh = new THREE.Vector3()
    const originLow = new THREE.Vector3()
    encodeEcef(origin, originHigh, originLow)
    const originHighU = uniform(originHigh)
    const originLowU = uniform(originLow)
    const cameraHighU = uniform(rtc.uniforms.u_cameraHigh.value).setGroup(renderGroup)
    const cameraLowU = uniform(rtc.uniforms.u_cameraLow.value).setGroup(renderGroup)
    const viewRTEU = uniform(rtc.uniforms.u_viewMatrixRTE.value).setGroup(renderGroup)

    const waveTexNode = texture(waveTexture)
    const foamPatNode = texture(foamPatternTexture)
    const vertexFn = wgslFn(vertexCode, [tsl.wgslFn(layerUVCode)])
    const fragmentFn = wgslFn(fragmentCode, [tsl.wgslFn(layerUVCode)])
    const restXZ = positionGeometry.xz.toVarying("oceanRestXZ")
    const restPos = positionGeometry.toVarying("oceanRestPos")
    const displaced = vertexFn(
      positionGeometry.xz,
      waveTexNode,
      waveTexNode,
      ...this.d, ...this.s,
      this.numLayersU, this.choppinessU, this.dGradU, this.hGradU, this.ampInvU
    )
    // mesh.matrix 只留旋转（平移拆到 high/low）。RTE 与 applyRTCInstancing 相同：
    // (originHigh - cameraHigh) + (originLow - cameraLow) + R * local
    const worldOffset = modelWorldMatrix.mul(vec4(displaced, 1)).xyz
    const rte = originHighU.sub(cameraHighU).add(originLowU.sub(cameraLowU)).add(worldOffset)
    const mat = new NodeMaterial()
    mat.lights = false
    mat.toneMapped = false
    mat.positionNode = displaced
    mat.vertexNode = cameraProjectionMatrix.mul(viewRTEU).mul(vec4(rte, 1))
    mat.fragmentNode = fragmentFn(
      restPos,
      restXZ,
      waveTexNode,
      this.foamTexNode,
      foamPatNode,
      waveTexNode,
      ...this.d, ...this.s,
      this.numLayersU, this.choppinessU, this.dGradU, this.hGradU, this.ampInvU,
      this.foamRegionU, this.foamScaleU,
      this.cameraPosU, this.sunDirU
    )
    this.material = mat

    this.mesh = new THREE.Mesh(geometry, mat)
    this.mesh.frustumCulled = false
    this.mesh.matrixAutoUpdate = false
    this.mesh.matrix.copy(this.fullMatrix)
    this.mesh.matrix.setPosition(0, 0, 0)
    this.mesh.matrixWorldNeedsUpdate = true
    this.mesh.onBeforeRender = (_renderer, _scene, camera) => {
      rtc.update()
      this.invFull.copy(this.fullMatrix).invert()
      this.cameraPosU.value.copy(camera.position).applyMatrix4(this.invFull)
    }
  }

  exportLayerUniforms() {
    return {
      d: this.d,
      s: this.s,
      numLayers: this.numLayersU.value as number,
      choppiness: this.choppinessU.value as number,
      ampInv: this.ampInvU.value as number,
    }
  }

  update(dt: number, params: OceanParams, cameraPos: THREE.Vector3, sunDir: THREE.Vector3) {
    this.time += dt
    const count = Math.round(params.layers)
    this.numLayersU.value = count
    this.choppinessU.value = params.choppiness
    this.ampInvU.value = 1 / Math.max(params.amplitude, 0.01)

    const spread = (params.spread * Math.PI) / 180
    let sq = 0
    for (let i = 0; i < count; i++) sq += SCALE_RATIO ** (2 * i)
    const ampNorm = params.amplitude / Math.sqrt(sq)
    const waveDir = (params.waveDir * Math.PI) / 180
    for (let i = 0; i < count; i++) {
      const lambda = params.wavelength * SCALE_RATIO ** i
      const tile = lambda * this.wavesPerTile
      const omega = Math.sqrt((9.81 * lambda) / (2 * Math.PI))
      this.phases[i] += (omega / tile) * dt
      const angle = waveDir + DIR_FRACS[i] * spread
      this.d[i].value.set(Math.cos(angle), Math.sin(angle), 1 / tile, ampNorm * SCALE_RATIO ** i)
      this.s[i].value.set(UV_OFFSETS[i][0] - this.phases[i], UV_OFFSETS[i][1], 0, 0)
    }
    this.sunDirU.value.copy(sunDir)
  }

  setFoamTexture(foamTexture: THREE.Texture) {
    this.foamTexNode.value = foamTexture
  }
}

// ---------------------------------------------------------------------------
// UI 参数
// ---------------------------------------------------------------------------
interface UiParams extends OceanParams {
  foam: number
  pause: boolean
}

const el = (id: string) => document.getElementById(id) as HTMLInputElement

function readParams(): UiParams {
  const num = (id: string) => parseFloat(el(id).value)
  return {
    wavelength: num("wavelength"),
    amplitude: num("amplitude"),
    choppiness: num("choppiness"),
    layers: num("layers"),
    spread: num("spread"),
    waveDir: num("waveDir"),
    dispersion: num("dispersion"),
    foam: num("foam"),
    pause: el("pause").checked,
  }
}

function bindSlider(id: string) {
  const input = el(id)
  const span = input.nextElementSibling as HTMLElement
  const sync = () => (span.textContent = input.value)
  input.addEventListener("input", sync)
  sync()
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------
async function main() {
  const viewer = await tellux.Viewer.create("viewer", {
    renderer: { type: "webgpu" },
    layers: [{ source: exampleMapServiceConfig.createImagerySource() }],
    terrain: exampleMapServiceConfig.createTerrainOptions(),
    camera: {
      longitude: OCEAN_LON,
      latitude: OCEAN_LAT,
      height: 2500,
      heading: 0,
      pitch: -45,
      far: 30000000,
    },
    scene: {
      atmosphere: { show: true, lighting: { mode: "light-source" } },
      clouds: { show: false },
    },
    widgets: { timeline: true },
  })
  ;(window as any).viewer = viewer

  const rtcUniforms = new tellux.RTCAutoUniforms(viewer.camera.threeCamera)

  const renderer = viewer.renderer

  // --- 数据纹理(CPU 生成) ---
  const tex = buildOceanTextures()

  // --- 波场模拟 ---
  const waveField = new WaveFieldSim(tsl, wgpu, tex.gravity, tex.gravitySize)

  // --- 泡沫模拟 ---
  const foam = new FoamSim(tsl, wgpu, waveField.texture, tex.gravitySize, tex.gravityDispGrad)

  // --- 海洋表面 ---
  const surface = new OceanSurface(
    tsl,
    wgpu,
    buildSeaGeometry(SEA_HALF, GRID_N),
    waveField.texture,
    tex.gravityWavesPerTile,
    tex.gravityDispGrad,
    tex.gravitySize,
    OCEAN_LON,
    OCEAN_LAT,
    viewer,
    tex.foamPattern,
    rtcUniforms
  )
  viewer.scene.threeScene.add(surface.mesh)

  ;["wavelength", "amplitude", "choppiness", "layers", "spread", "waveDir", "dispersion", "foam"].forEach(bindSlider)

  viewer.flyToTarget(
    { longitude: OCEAN_LON, latitude: OCEAN_LAT, height: OCEAN_HEIGHT },
    { distance: 700, pitch: -35, duration: 1.5 }
  )

  // --- 手动渲染循环:模拟 pass 在 tellux 渲染前跑 ---
  viewer.useDefaultRenderLoop = false
  let last = performance.now()
  const sunDir = new THREE.Vector3(0.35, 0.72, -0.28).normalize()
  function animate(time: number) {
    const dt = Math.min((time - last) / 1000, 0.1)
    last = time
    const params = readParams()

    if (!params.pause) {
      const lambda = params.wavelength
      const texFreq = Math.sqrt((GRAVITY * lambda) / (2 * Math.PI)) / (lambda * tex.gravityWavesPerTile)
      waveField.update(dt, texFreq, params.dispersion)
    }
    waveField.render(renderer)

    surface.update(dt, params, viewer.camera.threeCamera.position, sunDir)
    const layers = surface.exportLayerUniforms()
    foam.syncLayers(layers.d, layers.s, layers.numLayers, layers.choppiness, layers.ampInv)
    if (!params.pause) foam.setParams(params.foam, 4, dt)
    foam.render(renderer)
    surface.setFoamTexture(foam.texture)

    rtcUniforms.update()
    viewer.render(time)
    requestAnimationFrame(animate)
  }
  requestAnimationFrame(animate)

  window.addEventListener("beforeunload", () => {
    viewer.destroy()
  })
}

void main().catch((e) => {
  const elErr = document.getElementById("error")
  if (elErr) {
    elErr.style.display = "grid"
    elErr.textContent = String(e?.message ?? e)
  }
  throw e
})
