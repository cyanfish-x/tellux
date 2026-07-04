import { describe, expect, it } from 'vitest'
import { computeSignedDistanceField } from '../entities/sdf'

describe('computeSignedDistanceField', () => {
  it('正负距离以边缘为 0 对称（5×5 仅中心内部）', () => {
    const w = 5
    const h = 5
    const mask = new Uint8Array(w * h)
    mask[2 * w + 2] = 1 // 中心 (2,2) 内部
    const sd = computeSignedDistanceField(mask, w, h)

    const at = (x: number, y: number) => sd[y * w + x]
    // 中心：到最近外部 = 1（相邻），内部正。
    expect(at(2, 2)).toBeCloseTo(1, 5)
    // 紧邻外部的像素：到最近内部 = 1，外部负。
    expect(at(2, 1)).toBeCloseTo(-1, 5)
    expect(at(1, 2)).toBeCloseTo(-1, 5)
    // 角点 (0,0)：到中心 = sqrt(8)。
    expect(at(0, 0)).toBeCloseTo(-Math.SQRT2 * 2, 4)
    // (2,0)：到中心 = 2。
    expect(at(2, 0)).toBeCloseTo(-2, 5)
  })

  it('无内部像素的列仍给出有限距离（finite-big 防 NaN 下溢）', () => {
    // 仅第 2 列有内部像素；第 0 列整列无内部，验证 EDT 不产生 NaN / 下溢。
    const w = 5
    const h = 5
    const mask = new Uint8Array(w * h)
    mask[0 * w + 2] = 1
    mask[2 * w + 2] = 1
    mask[4 * w + 2] = 1
    const sd = computeSignedDistanceField(mask, w, h)

    // (0,2)：第 0 列无内部，最近内部在第 2 列同行，距离 2。
    expect(sd[2 * w + 0]).toBeCloseTo(-2, 5)
    // 全场有限（无 NaN）。
    for (let i = 0; i < w * h; i += 1) {
      expect(Number.isFinite(sd[i])).toBe(true)
    }
  })

  it('全外 / 全内掩码给出有限值（不崩）', () => {
    const w = 3
    const h = 3
    const allOutside = new Uint8Array(w * h) // 全 0
    const sdOut = computeSignedDistanceField(allOutside, w, h)
    for (let i = 0; i < w * h; i += 1) {
      expect(Number.isFinite(sdOut[i])).toBe(true)
      expect(sdOut[i]).toBeLessThan(0) // 全外部 → 负
    }

    const allInside = new Uint8Array(w * h).fill(1)
    const sdIn = computeSignedDistanceField(allInside, w, h)
    for (let i = 0; i < w * h; i += 1) {
      expect(Number.isFinite(sdIn[i])).toBe(true)
      expect(sdIn[i]).toBeGreaterThan(0) // 全内部 → 正
    }
  })

  it('矩形内部的边距正确', () => {
    // 7×7，中心 3×3 内部（x∈[2,4], y∈[2,4]）。
    const w = 7
    const h = 7
    const mask = new Uint8Array(w * h)
    for (let y = 2; y <= 4; y += 1) {
      for (let x = 2; x <= 4; x += 1) {
        mask[y * w + x] = 1
      }
    }
    const sd = computeSignedDistanceField(mask, w, h)
    const at = (x: number, y: number) => sd[y * w + x]
    // 中心 (3,3)：3×3 内部，中心到最近外部 = 2（边缘像素仍内部，外部再外一格）。
    expect(at(3, 3)).toBeCloseTo(2, 5)
    // 内部边缘 (2,3)：到最近外部 = 1（相邻）。
    expect(at(2, 3)).toBeCloseTo(1, 5)
    // 外部紧邻 (1,3)：到最近内部 = 1。
    expect(at(1, 3)).toBeCloseTo(-1, 5)
    // 外部远点 (0,0)：到最近内部 (2,2) = sqrt(8)。
    expect(at(0, 0)).toBeCloseTo(-Math.SQRT2 * 2, 4)
  })
})
