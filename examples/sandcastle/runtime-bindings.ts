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
  tree: boolean
  /** three/tsl 命名空间(示例里出现 TSL 标识符时注入) */
  tsl: boolean
  /** three/webgpu 命名空间(示例里出现 WEBGPU 标识符时注入) */
  webgpu: boolean
}

export function detectOptionalRuntimeBindings(
  source: string
): OptionalRuntimeBindings {
  return {
    gaussianSplat: hasIdentifier(source, 'GaussianSplatPlugin'),
    hism: HISM_RUNTIME_BINDING_NAMES.some((name) => hasIdentifier(source, name)),
    tree: hasIdentifier(source, 'Tree'),
    tsl: hasIdentifier(source, 'TSL'),
    webgpu: hasIdentifier(source, 'WEBGPU')
  }
}

function hasIdentifier(source: string, identifier: string) {
  return new RegExp(`\\b${identifier}\\b`).test(source)
}
