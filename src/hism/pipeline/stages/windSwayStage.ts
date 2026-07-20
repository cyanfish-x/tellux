import * as THREE from 'three'
import type { PositionPipelineStage } from '../PositionPipeline'
import { SIMPLEX_NOISE_3D_GLSL } from './simplexNoise3.glsl'

/** Wind sway stage 名称。Wind sway stage name. */
export const WIND_SWAY_STAGE_NAME = 'wind-sway'

/** Wind sway stage 执行顺序（pre-instancing）。Wind sway stage order. */
export const WIND_SWAY_STAGE_ORDER = 50

export interface WindSwayUniforms {
  uTime: THREE.IUniform<number>
  uWindStrength: THREE.IUniform<THREE.Vector3>
  uWindFrequency: THREE.IUniform<number>
  uWindScale: THREE.IUniform<number>
}

export interface WindSwayUniformValues {
  time?: number
  windStrength?: THREE.Vector3 | [x: number, y: number, z: number]
  windFrequency?: number
  windScale?: number
}

/**
 * 创建风摆 stage 所需的 uniform。
 *
 * Creates uniforms required by the wind sway stage.
 */
export function createWindSwayUniforms(
  values: WindSwayUniformValues = {}
): WindSwayUniforms {
  const windStrength = values.windStrength ?? new THREE.Vector3(0.5, 0, 0.5)
  return {
    uTime: { value: values.time ?? 0 },
    uWindStrength: {
      value: Array.isArray(windStrength)
        ? new THREE.Vector3(...windStrength)
        : windStrength
    },
    uWindFrequency: { value: values.windFrequency ?? 0.5 },
    uWindScale: { value: values.windScale ?? 70 }
  }
}

/**
 * 创建 ez-tree 等价的风摆 position stage（在 instancing 之前执行）。
 *
 * Creates an ez-tree-equivalent wind sway position stage (runs before instancing).
 */
export function createWindSwayStage(): PositionPipelineStage {
  return {
    name: WIND_SWAY_STAGE_NAME,
    order: WIND_SWAY_STAGE_ORDER,
    phase: 'pre-instancing',
    declarations: `
uniform float uTime;
uniform vec3 uWindStrength;
uniform float uWindFrequency;
uniform float uWindScale;

${SIMPLEX_NOISE_3D_GLSL}`.trim(),
    transform(mvPosition) {
      return `
float windOffset = 2.0 * 3.14 * simplex3(${mvPosition}.xyz / uWindScale);
vec3 windSway = uv.y * uWindStrength * (
  0.5 * sin(uTime * uWindFrequency + windOffset) +
  0.3 * sin(2.0 * uTime * uWindFrequency + 1.3 * windOffset) +
  0.2 * sin(5.0 * uTime * uWindFrequency + 1.5 * windOffset)
);
${mvPosition}.xyz += windSway;`.trim()
    }
  }
}
