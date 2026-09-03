import type { GltfModelLightingMode, GltfModelOptions } from '../types'

/**
 * `preserve` 默认局部光照（灯/自发光走 forward）；`auto` 默认地球后处理光照。
 *
 * `preserve` defaults to local lighting (lights / emissive stay in forward);
 * `auto` defaults to globe post-process lighting.
 */
export function resolveGltfModelLighting(
  options: Pick<GltfModelOptions, 'lighting' | 'materialMode'>
): GltfModelLightingMode {
  if (options.lighting === 'globe' || options.lighting === 'local') {
    return options.lighting
  }
  return options.materialMode === 'preserve' ? 'local' : 'globe'
}

export function shouldPreserveGltfModelMaterial(
  options: Pick<GltfModelOptions, 'lighting' | 'materialMode'>
) {
  return options.materialMode === 'preserve' || resolveGltfModelLighting(options) === 'local'
}
