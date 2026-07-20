import type { HismLodLevel } from '../../types/hism'

/**
 * 根据相机到簇中心的距离（米）解析当前 LOD 级别索引。
 *
 * Resolves the active LOD level index from camera-to-cluster distance in meters.
 */
export function resolveLodLevel(
  distanceMeters: number,
  levels: Pick<HismLodLevel, 'maxDistanceMeters'>[]
): number {
  if (levels.length === 0) return 0

  for (let index = 0; index < levels.length; index += 1) {
    const level = levels[index]
    if (level && distanceMeters <= level.maxDistanceMeters) {
      return index
    }
  }

  return levels.length - 1
}
