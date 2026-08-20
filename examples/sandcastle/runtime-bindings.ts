export const HISM_RUNTIME_BINDING_NAMES = [
  'HISM_DEMO_CENTER',
  'HISM_DEMO_VIEW_POSE',
  'HISM_TREE_PRESETS',
  'buildHismTreeTemplate',
  'buildLegacyTreeTemplate',
  'buildLodTreeArchetypes',
  'buildSimpleTreeArchetypes',
  'createHismDemoViewerOptions',
  'generateFastPlacements',
  'generatePoissonPlacements'
] as const

export interface OptionalRuntimeBindings {
  gaussianSplat: boolean
  hism: boolean
  ocean: boolean
  tree: boolean
}

export function detectOptionalRuntimeBindings(
  source: string
): OptionalRuntimeBindings {
  return {
    gaussianSplat: hasIdentifier(source, 'GaussianSplatPlugin'),
    hism: HISM_RUNTIME_BINDING_NAMES.some((name) => hasIdentifier(source, name)),
    ocean: hasIdentifier(source, 'createRiyueBayOceanDemo'),
    tree: hasIdentifier(source, 'Tree')
  }
}

function hasIdentifier(source: string, identifier: string) {
  return new RegExp(`\\b${identifier}\\b`).test(source)
}
