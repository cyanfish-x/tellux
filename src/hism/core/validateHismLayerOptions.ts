import type { AddHismLayerOptions, HismArchetype } from '../../types/hism'
import { getArchetypeLodLevels } from '../lod/archetypeLod'

function validateArchetype(archetype: HismArchetype, index: number) {
  const hasParts = Boolean(archetype.parts?.length)
  const hasLodLevels = Boolean(archetype.lodLevels?.length)

  if (hasParts && hasLodLevels) {
    throw new Error(
      `HISM: archetype[${index}] must not define both "parts" and "lodLevels".`
    )
  }

  if (!hasParts && !hasLodLevels) {
    throw new Error(
      `HISM: archetype[${index}] must define either "parts" or "lodLevels".`
    )
  }

  getArchetypeLodLevels(archetype)
}

/**
 * 校验 HISM 图层配置，fail-fast 避免运行期 silent failure。
 *
 * Validates HISM layer options and fails fast to avoid silent runtime failures.
 */
export function validateHismLayerOptions(options: AddHismLayerOptions): void {
  if (options.archetypes.length === 0) {
    throw new Error('HISM: "archetypes" must contain at least one archetype.')
  }

  options.archetypes.forEach((archetype, index) => {
    validateArchetype(archetype, index)
  })

  for (const instance of options.instances) {
    if (
      instance.archetype < 0 ||
      instance.archetype >= options.archetypes.length
    ) {
      throw new Error(
        `HISM: instance archetype index ${instance.archetype} is out of range.`
      )
    }
  }
}
