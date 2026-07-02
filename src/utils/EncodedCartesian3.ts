import * as THREE from 'three'

/**
 * 高/低双精度拆分结果。
 *
 * ECEF 坐标在地球尺度上达到 6.4×10⁶ m 量级，超出 Float32 的精确整数区间
 * （2²³ ≈ 8.4×10⁶）。把每个分量拆成 `high + low` 后，`high` 是 65536 的整数倍
 * 仍落在 Float32 精确区间内，`low` 是余数绝对值不超过 32768 也精确可表示。GPU
 * 端做 `(positionHigh - cameraHigh) + (positionLow - cameraLow)` 后落入相机周
 * 边的局部空间，Float32 完全可表示，消除地球尺度的精度抖动。
 *
 * 算法直接移植自 Cesium 的 `EncodedCartesian3`：
 * `Math.floor(|v| / 65536) * 65536`，符号单独保留。
 */
export interface EncodedCartesian3 {
  high: THREE.Vector3
  low: THREE.Vector3
}

const SHIFT = 65536 // 2^16，与 Cesium 一致

const scratchScalar = { high: 0, low: 0 }

function encodeScalar(value: number, out: { high: number; low: number }): void {
  const sign = value >= 0 ? 1 : -1
  const mag = Math.abs(value)
  const doubleHigh = Math.floor(mag / SHIFT) * SHIFT
  out.high = sign * doubleHigh
  out.low = value - out.high
}

export function encodeCartesian3(
  src: THREE.Vector3,
  out: EncodedCartesian3
): EncodedCartesian3 {
  encodeScalar(src.x, scratchScalar)
  out.high.x = scratchScalar.high
  out.low.x = scratchScalar.low
  encodeScalar(src.y, scratchScalar)
  out.high.y = scratchScalar.high
  out.low.y = scratchScalar.low
  encodeScalar(src.z, scratchScalar)
  out.high.z = scratchScalar.high
  out.low.z = scratchScalar.low
  return out
}

export function createEncodedCartesian3(): EncodedCartesian3 {
  return {
    high: new THREE.Vector3(),
    low: new THREE.Vector3()
  }
}
