import type { LonLat, LonLatHeight, LonLatHeightLike, LonLatLike } from './types/spatial'

function isCoordinateTuple(
  input: LonLatLike | LonLatHeightLike
): input is readonly [number, number] | readonly [number, number, number] {
  return Array.isArray(input)
}

/**
 * 判断采样入口收到的是点列而不是单个 `[经度, 纬度]` 元组。
 *
 * Distinguishes a list of points from a single `[longitude, latitude]` tuple.
 */
export function isLonLatPointList(
  input: LonLatLike | readonly LonLatLike[]
): input is readonly LonLatLike[] {
  if (!Array.isArray(input)) return false
  if (input.length === 0) return true
  return typeof input[0] !== 'number'
}

/**
 * 输入是否显式携带高度。用于 `CameraDestination` 在「保持当前高度」与「使用给定高度」之间分支。
 *
 * Whether the input explicitly includes height. Used by `CameraDestination` to
 * choose between keeping the current camera height and using the given height.
 */
export function hasExplicitHeight(
  input: LonLatLike | LonLatHeightLike
): input is LonLatHeightLike {
  return isCoordinateTuple(input) ? input.length >= 3 : 'height' in input
}

/**
 * 把经纬度入参规范成对象。忽略可能存在的高度。
 *
 * Normalizes a longitude/latitude input to an object. Ignores height if present.
 */
export function readLonLat(input: LonLatLike | LonLatHeightLike): LonLat {
  if (isCoordinateTuple(input)) {
    return { longitude: input[0], latitude: input[1] }
  }

  return { longitude: input.longitude, latitude: input.latitude }
}

/**
 * 把经纬高入参规范成对象。高度必填，不会补 0。
 *
 * Normalizes a longitude/latitude/height input to an object. Height is required
 * and is never filled in as 0.
 */
export function readLonLatHeight(input: LonLatHeightLike): LonLatHeight {
  if (isCoordinateTuple(input)) {
    const height = input[2]
    if (height === undefined) {
      throw new Error('Tellux: LonLatHeightLike requires height.')
    }
    return { longitude: input[0], latitude: input[1], height }
  }

  return {
    longitude: input.longitude,
    latitude: input.latitude,
    height: input.height
  }
}
