import * as THREE from 'three'

/**
 * SDF 生成结果。
 *
 * Result of {@link generateSDF}.
 */
export interface SDFResult {
  /** 单通道距离场纹理（R 通道 = [0,1] 编码距离，0.5 在边缘）。Single-channel distance-field texture (R = [0,1], 0.5 at the edge). */
  readonly texture: THREE.Texture
  /** 纹理像素宽（含 spread 边距）。Texture width in px (including spread padding). */
  readonly width: number
  /** 纹理像素高（含 spread 边距）。Texture height in px (including spread padding). */
  readonly height: number
  /** 编码的距离场半径（纹理像素）。Encoded distance-field radius in texture px. */
  readonly spread: number
}

/**
 * 把任意带 alpha 的位图源（图标 / canvas 光栅化的文字）转换成单通道有符号距离场纹理。
 *
 * 距离场约定：采样值 `r`，像素距离 `pxDist = (r - 0.5) * spread`，`pxDist > 0` 在形状内部，
 * `= 0` 在边缘，`< 0` 在外部。`spread` 是能精确编码的最大距离（纹理像素），超出被钳制。
 * 形状由源 alpha > 0.5 定义。源会被居中绘制到一张 `(contentW + 2*spread) × (contentH + 2*spread)`
 * 的画布上，四周留 `spread` 边距，使距离场在形状外仍有 `spread` 的有效范围供描边 / halo 使用。
 *
 * 距离变换用 Felzenszwalb-Huttenlocher 的可分离一维抛物线下包络算法（O(n)，精确），
 * 内 / 外各算一次相减得到有符号距离。
 *
 * Converts any alpha-bearing raster source (icon / canvas-rasterized text) into a
 * single-channel signed distance field texture. Sampling convention: pixel distance
 * `pxDist = (r - 0.5) * spread`; `> 0` inside, `0` at edge, `< 0` outside. The shape
 * is defined by source alpha > 0.5. The source is centered on a padded canvas so the
 * field stays accurate for `spread` px beyond the edge (room for outline / halo).
 *
 * Distance transform uses Felzenszwalb-Huttenlocher's separable 1D parabola lower
 * envelope (O(n), exact); inside and outside are computed separately and subtracted.
 *
 * @param source 已就绪的位图源（图片须已加载完成）。A ready raster source (images must be fully loaded).
 * @param spread 距离场半径（源像素）。Distance-field radius in source px.
 */
export function generateSDF(
  source: HTMLCanvasElement | HTMLImageElement | ImageData,
  spread: number
): SDFResult {
  const radius = Math.max(1, Math.round(spread))
  // HTMLImageElement.width 在未挂载 DOM 时虽等于 naturalWidth，但显式取 natural 更稳。
  // HTMLImageElement.width equals naturalWidth when off-DOM, but prefer natural explicitly.
  const contentW = source instanceof HTMLImageElement ? source.naturalWidth : source.width
  const contentH = source instanceof HTMLImageElement ? source.naturalHeight : source.height
  const width = contentW + radius * 2
  const height = contentH + radius * 2

  // 把源居中绘制到带边距的画布，读回 alpha 通道作为内外判定。
  // Center the source on a padded canvas and read back alpha as the in/out mask.
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.clearRect(0, 0, width, height)
  if (source instanceof ImageData) {
    context.putImageData(source, radius, radius)
  } else {
    context.drawImage(source, radius, radius)
  }
  const { data } = context.getImageData(0, 0, width, height)

  const inside = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i += 1) {
    inside[i] = data[i * 4 + 3] > 127 ? 1 : 0
  }

  const signed = computeSignedDistanceField(inside, width, height)
  const output = context.createImageData(width, height)
  for (let i = 0; i < width * height; i += 1) {
    const encoded = 0.5 + 0.5 * clamp(signed[i] / radius, -1, 1)
    const byte = Math.round(encoded * 255)
    output.data[i * 4 + 0] = byte // R = 距离场
    output.data[i * 4 + 1] = 0
    output.data[i * 4 + 2] = 0
    output.data[i * 4 + 3] = 255 // A 不参与采样，置满
  }
  context.putImageData(output, 0, 0)

  const texture = new THREE.CanvasTexture(canvas)
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  // 距离场是数据而非颜色，必须按线性使用，禁用 sRGB 解码。
  // The field is data, not color: keep it linear and disable sRGB decode.
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true
  return { texture, width, height, spread: radius }
}

/**
 * 二值掩码的有符号距离场（内部为正，像素单位）。`mask[i] === 1` 为内部像素。
 * 纯函数（无 canvas / THREE 依赖），便于单测。内 / 外各算一次平方距离场相减。
 *
 * Signed distance field (inside positive, in pixels) of a binary mask where
 * `mask[i] === 1` is inside. Pure (no canvas / THREE), for unit testing. Inside and
 * outside squared distance fields are computed separately and subtracted.
 */
export function computeSignedDistanceField(
  mask: Uint8Array,
  width: number,
  height: number
): Float64Array {
  // 外距离 = 到最近内部像素；内距离 = 到最近外部像素；有符号距离（内正）= 内 - 外。
  // Outside distance = nearest inside pixel; inside distance = nearest outside pixel;
  // signed distance (inside positive) = inside - outside.
  const outsideSq = squaredDistanceField(mask, width, height, /* feature */ 1)
  const insideSq = squaredDistanceField(mask, width, height, /* feature */ 0)
  const result = new Float64Array(width * height)
  for (let i = 0; i < width * height; i += 1) {
    result[i] = Math.sqrt(insideSq[i]) - Math.sqrt(outsideSq[i])
  }
  return result
}

/**
 * 二值图上「到最近特征像素」的平方距离场。特征值由 `feature` 指定（`1` = 内部像素，
 * `0` = 外部像素）。两遍可分离 1D EDT（先行后列），返回每个像素到最近特征像素的平方欧氏距离。
 *
 * Squared distance field to the nearest feature pixel on a binary mask (`feature`
 * selects 1 = inside or 0 = outside). Two-pass separable 1D EDT (columns then rows);
 * returns squared Euclidean distance to the nearest feature pixel.
 */
function squaredDistanceField(
  mask: Uint8Array,
  width: number,
  height: number,
  feature: 0 | 1
): Float64Array {
  const n = width * height
  const maxDim = Math.max(width, height)
  // 用一个大于任意真实平方距离的有限值代替 Infinity：Felzenszwalb 1D EDT 在 f 含 Inf
  // 且首像素非特征时会因 Inf-Inf=NaN / s=-Inf 使 k 下溢到 -1。有限大值让算法始终良态。
  // Use a finite value larger than any real squared distance instead of Infinity: the
  // Felzenszwalb 1D EDT underflows k to -1 when f contains Inf and the first pixel is not
  // a feature (Inf-Inf=NaN / s=-Inf). A finite large value keeps the algorithm well-behaved.
  const big = (width + height) * (width + height)
  const f = new Float64Array(maxDim)
  const d = new Float64Array(maxDim)
  const v = new Int32Array(maxDim)
  const z = new Float64Array(maxDim + 1)

  // grid: 特征像素 = 0，其余 = big（1D EDT 的输入函数）。
  // grid: 0 at feature pixels, big elsewhere (input to the 1D EDT).
  const grid = new Float64Array(n)
  for (let i = 0; i < n; i += 1) {
    grid[i] = mask[i] === feature ? 0 : big
  }

  // 第一遍：逐列沿 y 做 1D EDT。
  // Pass 1: 1D EDT along y for each column.
  const tmp = new Float64Array(n)
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) f[y] = grid[y * width + x]
    edt1d(height, f, d, v, z)
    for (let y = 0; y < height; y += 1) tmp[y * width + x] = d[y]
  }

  // 第二遍：逐行沿 x 做 1D EDT，得到二维平方距离。
  // Pass 2: 1D EDT along x for each row → 2D squared distance.
  const out = new Float64Array(n)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) f[x] = tmp[y * width + x]
    edt1d(width, f, d, v, z)
    for (let x = 0; x < width; x += 1) out[y * width + x] = d[x]
  }
  return out
}

/**
 * 一维距离变换：`d[i] = min_j (f[j] + (i - j)^2)`，Felzenszwalb-Huttenlocher 抛物线下包络。
 *
 * 1D distance transform via the Felzenszwalb-Huttenlocher parabola lower envelope.
 */
function edt1d(
  n: number,
  f: Float64Array,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array
): void {
  z[0] = -Infinity
  z[1] = Infinity
  let k = 0
  v[0] = 0
  for (let q = 1; q < n; q += 1) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k -= 1
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k += 1
    v[k] = q
    z[k] = s
    z[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1] < q) k += 1
    const dist = q - v[k]
    d[q] = f[v[k]] + dist * dist
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

const sampleContextCache = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>()

function getSampleContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | undefined {
  let ctx = sampleContextCache.get(canvas)
  if (!ctx) {
    ctx = canvas.getContext('2d', { willReadFrequently: true }) ?? undefined
    if (ctx) sampleContextCache.set(canvas, ctx)
  }
  return ctx
}

/**
 * CPU 端复刻 AnchorQuadGraphic FS 的 alpha 计算，供屏幕空间拾取按命中 uv 判定可见性。
 * `spread` / `outlineWidth` / `smoothing` 均为绘制缓冲像素（与 shader uniform 同口径）。
 *
 * Mirrors the AnchorQuadGraphic FS alpha on the CPU so screen-space picking can decide
 * visibility at the hit uv. `spread` / `outlineWidth` / `smoothing` are in drawing-buffer
 * px (same units as the shader uniforms).
 */
export function sampleSdfAlpha(
  canvas: HTMLCanvasElement,
  uvX: number,
  uvY: number,
  spread: number,
  outlineWidth: number,
  smoothing: number
): number {
  const ctx = getSampleContext(canvas)
  if (!ctx) return 1
  const w = canvas.width
  const h = canvas.height
  const px = Math.min(w - 1, Math.max(0, Math.round(uvX * (w - 1))))
  // CanvasTexture flipY=true：uv.v=0 对应画布底行 (h-1)。
  const py = Math.min(h - 1, Math.max(0, Math.round((1 - uvY) * (h - 1))))
  const r = ctx.getImageData(px, py, 1, 1).data[0] / 255
  const pxDist = (r - 0.5) * spread
  const fill = smoothstep(-smoothing, smoothing, pxDist)
  const outer = smoothstep(-outlineWidth - smoothing, -outlineWidth + smoothing, pxDist)
  const ring = Math.max(outer - fill, 0)
  return Math.max(fill, ring)
}

/**
 * CPU 端复刻程序化圆角矩形背景的 alpha，供拾取判定。`sizeX/Y` / `cornerRadius` /
 * `smoothing` 均为绘制缓冲像素。
 *
 * Mirrors the procedural rounded-rect background alpha on the CPU for picking.
 * `sizeX/Y` / `cornerRadius` / `smoothing` are in drawing-buffer px.
 */
export function sampleRoundedRectAlpha(
  uvX: number,
  uvY: number,
  sizeX: number,
  sizeY: number,
  cornerRadius: number,
  smoothing: number
): number {
  const halfX = sizeX / 2
  const halfY = sizeY / 2
  const px = (uvX - 0.5) * sizeX
  const py = (uvY - 0.5) * sizeY
  const d0x = Math.abs(px) - halfX + cornerRadius
  const d0y = Math.abs(py) - halfY + cornerRadius
  const outerLen = Math.hypot(Math.max(d0x, 0), Math.max(d0y, 0))
  const inner = Math.min(Math.max(d0x, d0y), 0)
  const edgeDist = outerLen + inner - cornerRadius // <0 内部
  const pxDist = -edgeDist // 内正外负 / inside positive
  return smoothstep(-smoothing, smoothing, pxDist)
}
