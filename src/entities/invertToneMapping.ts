import * as THREE from 'three'
import type { ColorInput } from '../types'

/**
 * 颜色调映射反求工具。
 *
 * Tellux 的 WebGLRenderer 使用 `THREE.AgXToneMapping` 配合 r184 的内置
 * `setEffects()` 后处理管线：场景渲染阶段 `renderer.toneMapping` 被强制设为
 * NoToneMapping（材质原色写入离屏缓冲），最后由内置 output material 对整张
 * 画面统一应用 AgX 色调映射 + sRGB 编码。这意味着任何材质的 `toneMapped`
 * 开关在该管线里都不生效——实体颜色会被 AgX 曲线无差别压扁（纯红变橘等）。
 *
 * 为了让实体颜色"所见即所得"，这里对用户输入的 sRGB 目标色做 AgX 解析反求，
 * 得到一个会被 AgX 还原回目标色的预补偿 linear 颜色，作为材质 color 使用。
 *
 * 反求是 AgX 各步骤的解析逆运算：sRGB→linear → REC2020 → pow(1/2.2) →
 * AgX outset 逆 → contrast 逆（单调多项式二分）→ log2 逆 → AgX inset 逆 →
 * linear-sRGB，最后除以 exposure。clamp 步骤不可逆，纯色会有轻微损失，
 * 但回代验证显示色与目标色几乎一致。
 *
 * Color tone-mapping inversion utility.
 *
 * Tellux's WebGLRenderer uses `THREE.AgXToneMapping` with r184's built-in
 * `setEffects()` post-processing pipeline: during scene rendering
 * `renderer.toneMapping` is forced to NoToneMapping (raw linear colors go to
 * the offscreen buffer), then a built-in output material applies AgX tone
 * mapping + sRGB encoding to the whole frame. As a result, the per-material
 * `toneMapped` flag has no effect in this pipeline, and entity colors get
 * flattened by the AgX curve (pure red turns orange, etc.).
 *
 * To make entity colors WYSIWYG, this module analytically inverts AgX for a
 * given target sRGB color and returns a precompensated linear color that AgX
 * will map back to the target. Inversion is the analytical inverse of each AgX
 * step; the clamp step is not invertible so highly saturated colors lose a
 * little precision, but round-trip verification shows the displayed color
 * matches the target almost exactly.
 */

type Vec3 = [number, number, number]
type Mat3 = number[] // 行主序 9 元素 / row-major 9 elements

function mulMat3Vec3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
  ]
}

function invertMat3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const invDet = 1 / (a * A + b * B + c * C)
  return [
    A * invDet,
    -(b * i - c * h) * invDet,
    (b * f - c * e) * invDet,
    B * invDet,
    (a * i - c * g) * invDet,
    -(a * f - c * d) * invDet,
    C * invDet,
    -(a * h - b * g) * invDet,
    (a * e - b * d) * invDet
  ]
}

// 取自 three.module.js tonemapping_pars_fragment（行主序化）。
// From three.module.js tonemapping_pars_fragment (row-major).
const M_SRGB2REC2020: Mat3 = [
  0.6274, 0.0691, 0.0164,
  0.3293, 0.9195, 0.0880,
  0.0433, 0.0113, 0.8956
]
const M_AGX_INSET: Mat3 = [
  0.856627153315983, 0.0951212405381588, 0.0482516061458583,
  0.137318972929847, 0.761241990602591, 0.101439036467562,
  0.11189821299995, 0.0767994186031903, 0.811302368396859
]
const M_AGX_OUTSET: Mat3 = [
  1.1271005818144368, -0.11060664309660323, -0.016493938717834573,
  -0.1413297634984383, 1.157823702216272, -0.016493938717834257,
  -0.14132976349843826, -0.11060664309660294, 1.2519364065950405
]
const M_REC20202SRGB: Mat3 = [
  1.6605, -0.1246, -0.0182,
  -0.5876, 1.1329, -0.1006,
  -0.0728, -0.0083, 1.1187
]

// 解析求逆（three.js 的 outset/inset 数值并非严格互逆，必须解析求逆）。
// Analytical inverse (three.js outset/inset values are not exact inverses).
const INV_REC20202SRGB = invertMat3(M_REC20202SRGB)
const INV_AGX_OUTSET = invertMat3(M_AGX_OUTSET)
const INV_AGX_INSET = invertMat3(M_AGX_INSET)
const INV_SRGB2REC2020 = invertMat3(M_SRGB2REC2020)

const AGX_MIN_EV = -12.47393
const AGX_MAX_EV = 4.026069

function agxContrast(x: number): number {
  const x2 = x * x
  const x4 = x2 * x2
  return (
    15.5 * x4 * x2 -
    40.14 * x4 * x +
    31.96 * x4 -
    6.868 * x2 * x +
    0.4298 * x2 +
    0.1191 * x -
    0.00232
  )
}

// 单调多项式的二分反求 / bisection inverse of the monotonic polynomial.
function agxContrastInv(y: number): number {
  let lo = -0.05
  let hi = 1.05
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (agxContrast(mid) < y) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function srgbOETFInv(enc: number): number {
  return enc <= 0.04045 ? enc / 12.92 : Math.pow((enc + 0.055) / 1.055, 2.4)
}

/**
 * 把目标 sRGB（0-1 编码值）反求成会被 AgX 还原回该色的 linear-sRGB 材质色。
 * 返回值未做 [0,1] 裁剪，可能有负分量，直接作为 THREE.Color linear 分量。
 *
 * Inverts a target sRGB color (0-1 encoded) into a linear-sRGB material color
 * that AgX will map back to the target. The result is not clamped and may have
 * negative components; use it directly as THREE.Color linear components.
 */
function invertAgx(targetEncoded: Vec3, exposure: number): Vec3 {
  const targetLinear: Vec3 = [
    srgbOETFInv(targetEncoded[0]),
    srgbOETFInv(targetEncoded[1]),
    srgbOETFInv(targetEncoded[2])
  ]
  let c = targetLinear
  c = mulMat3Vec3(INV_REC20202SRGB, c)
  c = c.map((v) => Math.pow(Math.max(v, 0), 1 / 2.2)) as Vec3
  c = mulMat3Vec3(INV_AGX_OUTSET, c)
  c = c.map(agxContrastInv) as Vec3
  c = c.map((v) => (v * (AGX_MAX_EV - AGX_MIN_EV) + AGX_MIN_EV)) as Vec3
  c = c.map((v) => Math.pow(2, v)) as Vec3
  c = mulMat3Vec3(INV_AGX_INSET, c)
  c = mulMat3Vec3(INV_SRGB2REC2020, c)
  return [c[0] / exposure, c[1] / exposure, c[2] / exposure]
}

// ----- 模块级色调映射状态，由 Viewer 同步 / module-level state synced by Viewer -----
let activeToneMapping: THREE.ToneMapping = THREE.AgXToneMapping
let activeToneMappingExposure = 1

/**
 * @internal 同步当前 renderer 的色调映射状态，供颜色反求使用。
 * 仅 AgX 走反求；其它 tone mapping 不补偿。
 *
 * @internal Syncs the renderer's current tone-mapping state for color inversion.
 * Only AgX is inverted; other tone mappings are left uncompensated.
 */
export function setToneMappingState(toneMapping: THREE.ToneMapping, exposure: number): void {
  activeToneMapping = toneMapping
  activeToneMappingExposure = exposure
}

/**
 * 把任意 ColorInput 反求补偿后，返回一个会被当前色调映射还原回目标色的
 * linear THREE.Color 实例。AgX 之外（含 NoToneMapping）直接返回目标色。
 * `undefined` 视为白色。
 *
 * 解析实体颜色（点 / 线 / 面 / 描边）的统一入口：用户传入的 sRGB 目标色
 * 经 AgX 反求后，得到会被后处理 output pass 还原回目标色的预补偿 linear 色，
 * 从而抵消内置 setEffects 管线对整张画面的色调映射压扁（纯红变橘等）。
 *
 * Given any ColorInput, returns a linear THREE.Color that the current tone
 * mapping will map back to the target color. Non-AgX mappings (including
 * NoToneMapping) return the target color as-is. `undefined` is treated as white.
 *
 * Unified entry for resolving entity colors (point / polyline / polygon /
 * outline): the user-supplied sRGB target is analytically inverted through AgX
 * to a precompensated linear color that the built-in setEffects output pass
 * will map back to the target, cancelling the pipeline's whole-frame tone
 * mapping (which otherwise turns pure red orange, etc.).
 */
export function resolveColor(input: ColorInput | undefined): THREE.Color {
  if (input === undefined) {
    input = 0xffffff
  }
  const source = new THREE.Color(input)
  if (activeToneMapping !== THREE.AgXToneMapping) {
    return source
  }
  // Color.getRGB 返回 linear-sRGB；但反求需要 sRGB 编码值作为"目标显示色"。
  // Three.js 的 set(hex/string) 默认按 sRGB 解码到 linear，所以这里把目标
  // 重新编码回 sRGB，再交由 invertAgx 反求。
  // Color.getRGB returns linear-sRGB; inversion needs the sRGB-encoded target.
  // set(hex/string) decodes sRGB to linear, so re-encode to sRGB before inverting.
  const encoded: Vec3 = [
    srgbEncode(source.r),
    srgbEncode(source.g),
    srgbEncode(source.b)
  ]
  const inverted = invertAgx(encoded, activeToneMappingExposure)
  return new THREE.Color(inverted[0], inverted[1], inverted[2])
}

function srgbEncode(linear: number): number {
  return linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055
}

/**
 * 把 ColorInput 解析成 display sRGB 编码色（不做任何 tone mapping 补偿）。
 *
 * 供 symbol（文字 / 图标）后合成路径使用：symbol 在整帧 tone mapping + sRGB 输出
 * **之后**直接向 canvas 混合，shader 的 uniform 值即最终显示字节，因此需要
 * sRGB 编码值而非工作空间 linear 值。`THREE.Color.set` 会把 sRGB 输入解码到
 * linear，这里重新编码回去。`undefined` 视为白色。
 *
 * Resolves a ColorInput to display-encoded sRGB with no tone-mapping compensation.
 * For the symbol post-composite path: symbols blend straight into the canvas after
 * whole-frame tone mapping, so shader uniforms are final display bytes and must be
 * sRGB-encoded. `THREE.Color.set` decodes sRGB input to linear; re-encode it here.
 */
export function resolveDisplayColor(input: ColorInput | undefined): THREE.Color {
  const color = new THREE.Color(input ?? 0xffffff)
  return color.convertLinearToSRGB()
}
