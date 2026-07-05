import { describe, expect, it } from 'vitest'
import { validateHismLayerOptions } from '../../hism/core/validateHismLayerOptions'

describe('validateHismLayerOptions', () => {
  const baseArchetype = {
    parts: [{ geometry: {} as any, material: {} as any }]
  }

  it('rejects empty archetypes', () => {
    expect(() => validateHismLayerOptions({ archetypes: [], instances: [] })).toThrow(
      /at least one archetype/
    )
  })

  it('rejects both parts and lodLevels', () => {
    expect(() =>
      validateHismLayerOptions({
        archetypes: [
          {
            parts: baseArchetype.parts,
            lodLevels: [{ maxDistanceMeters: 100, parts: [] }]
          }
        ],
        instances: []
      })
    ).toThrow(/must not define both/)
  })

  it('rejects out-of-range instance archetype index', () => {
    expect(() =>
      validateHismLayerOptions({
        archetypes: [baseArchetype],
        instances: [{ coordinates: [0, 0, 0], archetype: 1 }]
      })
    ).toThrow(/out of range/)
  })
})
