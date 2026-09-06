import * as THREE from 'three'
import { SkyMaterial, type AerialPerspectiveEffect } from '@takram/three-atmosphere'
import { common, definitions, runtime } from '@takram/three-atmosphere/shaders/bruneton'
import type { SparkRenderer } from '@sparkjsdev/spark'
import { depthCheck, depthDeclarations, type TransparentStage } from './TransparentStage'

/** 复用上游 LUT 的高斯空气透视实验。 Splat aerial perspective experiment using upstream LUTs. */
export function attachSplatAtmosphere(spark: SparkRenderer, effect: AerialPerspectiveEffect, stage: TransparentStage) {
  const carrier = new SkyMaterial()
  const enabled = { value: true }
  const cameraECEF = { value: new THREE.Vector3() }
  const viewToECEF = { value: new THREE.Matrix4() }
  const inverseProjection = { value: new THREE.Matrix4() }
  const material = spark.material
  const anchor = '#ifdef PREMULTIPLIED_ALPHA'
  if (!material.fragmentShader.includes(anchor)) throw new Error('Unsupported Spark 2.1 fragment shader')
  delete carrier.defines.PI // Spark already declares PI as a GLSL constant in both shaders.
  Object.assign(material.defines, carrier.defines)
  Object.assign(material.uniforms, carrier.uniforms, {
    prototypeDepth: stage.depth, prototypeSize: stage.size, prototypeActive: stage.active,
    prototypeAtmosphere: enabled, prototypeCamera: cameraECEF,
    prototypeViewToECEF: viewToECEF, prototypeInverseProjection: inverseProjection,
  })
  const prefix = `
precision highp sampler3D;
#define PI 3.14159265358979323846
${depthDeclarations.replace('texture2D', 'texture')}
${definitions}
uniform AtmosphereParameters ATMOSPHERE;
uniform vec3 SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform vec3 SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform sampler2D transmittance_texture;
uniform sampler3D scattering_texture;
uniform sampler2D irradiance_texture;
uniform sampler3D single_mie_scattering_texture;
uniform sampler3D higher_order_scattering_texture;
${common}
${runtime}
uniform bool prototypeAtmosphere;
uniform vec3 prototypeCamera;
uniform mat4 prototypeViewToECEF;
uniform mat4 prototypeInverseProjection;
uniform vec3 sunDirection;
`
  // Spark's depth is the rasterized splat depth, not a reconstructed volumetric surface.
  // This experiment deliberately retains that approximation and normal alpha blending.
  material.fragmentShader = material.fragmentShader.replace('void main()', `${prefix}\nvoid main()`)
    .replace(anchor, `
${depthCheck.replace('texture2D', 'texture')}
if (prototypeActive && prototypeAtmosphere) {
  vec4 view = prototypeInverseProjection * vec4(gl_FragCoord.xy / prototypeSize * 2.0 - 1.0, gl_FragCoord.z * 2.0 - 1.0, 1.0);
  vec3 pointECEF = prototypeCamera + (prototypeViewToECEF * vec4(view.xyz / view.w, 0.0)).xyz * 0.001;
  vec3 transmittance;
  vec3 scatter = GetSkyRadianceToPoint(prototypeCamera, pointECEF, 0.0, sunDirection, transmittance);
  rgba.rgb = rgba.rgb * transmittance + scatter;
}
${anchor}`)
  material.needsUpdate = true
  return {
    enabled,
    update(camera: THREE.PerspectiveCamera) {
      carrier.irradianceTexture = effect.irradianceTexture
      carrier.scatteringTexture = effect.scatteringTexture
      carrier.transmittanceTexture = effect.transmittanceTexture
      carrier.singleMieScatteringTexture = effect.singleMieScatteringTexture
      carrier.higherOrderScatteringTexture = effect.higherOrderScatteringTexture
      carrier.sunDirection.copy(effect.sunDirection)
      cameraECEF.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(effect.worldToECEFMatrix)
      const correction = effect.uniforms.get('altitudeCorrection')?.value as THREE.Vector3 | undefined
      if (correction) cameraECEF.value.add(correction)
      cameraECEF.value.multiplyScalar(0.001)
      viewToECEF.value.multiplyMatrices(effect.worldToECEFMatrix, camera.matrixWorld)
      inverseProjection.value.copy(camera.projectionMatrixInverse)
      enabled.value = enabled.value && !!effect.scatteringTexture
      const nextDefines = { ...material.defines, ...carrier.defines }
      if (JSON.stringify(nextDefines) !== JSON.stringify(material.defines)) { material.defines = nextDefines; material.needsUpdate = true }
    },
    dispose() { carrier.dispose() },
  }
}
