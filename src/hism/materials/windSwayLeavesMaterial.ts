import * as THREE from 'three'
import type { RTCAutoUniforms } from '../../rendering/RTCAutoUniforms'
import { createInstancedVegetationPipeline, TELLUX_POSITION_PIPELINE_KEY } from '../pipeline/vegetationPipeline'
import {
  createWindSwayUniforms,
  type WindSwayUniformValues
} from '../pipeline/stages/windSwayStage'

export interface WindSwayLeavesMaterialOptions
  extends Omit<THREE.MeshPhongMaterialParameters, 'onBeforeCompile'> {
  rtcUniforms: RTCAutoUniforms
  wind?: WindSwayUniformValues
}

/**
 * 创建 Tellux 接管 shader 的 ez-tree 叶片材质：风摆 + RTC 均由 PositionPipeline 编排。
 *
 * Creates an ez-tree leaf material whose shaders are owned by Tellux PositionPipeline
 * (wind sway + RTC).
 */
export function createWindSwayLeavesMaterial(
  options: WindSwayLeavesMaterialOptions
): THREE.MeshPhongMaterial {
  const { rtcUniforms, wind, ...materialOptions } = options
  const windUniforms = createWindSwayUniforms(wind)
  const material = new THREE.MeshPhongMaterial({
    side: THREE.DoubleSide,
    ...materialOptions
  })

  const pipeline = createInstancedVegetationPipeline()
  pipeline.applyToMaterial(material, {
    ...windUniforms,
    ...rtcUniforms.uniforms
  } as Record<string, THREE.IUniform>)

  material.userData[TELLUX_POSITION_PIPELINE_KEY] = 'wind-rtc'
  material.userData.shader = null

  const previousOnBeforeCompile = material.onBeforeCompile?.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    if (previousOnBeforeCompile) {
      previousOnBeforeCompile(shader, renderer)
    }
    material.userData.shader = shader
  }

  return material
}

export function hasTelluxPositionPipeline(material: THREE.Material): boolean {
  return Boolean(material.userData[TELLUX_POSITION_PIPELINE_KEY])
}
