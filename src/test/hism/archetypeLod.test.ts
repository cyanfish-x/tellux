import { describe, expect, it } from 'vitest'
import { getArchetypeLodLevels } from '../../hism/lod/archetypeLod'
import type { HismArchetype } from '../../types/hism'

describe('archetypeLod', () => {
  it('falls back to single Infinity LOD from parts', () => {
    const archetype: HismArchetype = {
      parts: [{ geometry: {} as any, material: {} as any }]
    }
    expect(getArchetypeLodLevels(archetype)).toEqual([
      {
        maxDistanceMeters: Number.POSITIVE_INFINITY,
        parts: archetype.parts
      }
    ])
  })

  it('sorts lodLevels by maxDistanceMeters', () => {
    const archetype: HismArchetype = {
      lodLevels: [
        { maxDistanceMeters: 1200, parts: [] },
        { maxDistanceMeters: 400, parts: [] }
      ]
    }
    expect(getArchetypeLodLevels(archetype).map((level) => level.maxDistanceMeters)).toEqual([
      400,
      1200
    ])
  })

  it('throws when neither parts nor lodLevels exist', () => {
    expect(() => getArchetypeLodLevels({})).toThrow(/must define/)
  })
})
