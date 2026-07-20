import type { HismArchetype, HismLodLevel } from '../../types/hism'

/**
 * 解析 archetype 的 LOD 层级；无 lodLevels 时退化为单级 Infinity。
 *
 * Resolves archetype LOD levels; falls back to a single Infinity level when
 * `lodLevels` is omitted.
 */
export function getArchetypeLodLevels(archetype: HismArchetype): HismLodLevel[] {
  if (archetype.lodLevels?.length) {
    return [...archetype.lodLevels].sort(
      (left, right) => left.maxDistanceMeters - right.maxDistanceMeters
    )
  }

  if (archetype.parts?.length) {
    return [
      {
        maxDistanceMeters: Number.POSITIVE_INFINITY,
        parts: archetype.parts
      }
    ]
  }

  throw new Error('HISM: archetype must define `parts` or `lodLevels`.')
}

export function getMaxArchetypeLodCount(archetypes: HismArchetype[]): number {
  return Math.max(
    1,
    ...archetypes.map((archetype) => getArchetypeLodLevels(archetype).length)
  )
}
