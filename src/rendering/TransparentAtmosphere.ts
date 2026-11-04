import * as THREE from 'three'
import type { AerialPerspectiveEffect } from '@takram/three-atmosphere'
import { common, definitions, runtime } from '@takram/three-atmosphere/shaders/bruneton'
import {
  INSCATTER_INTENSITY_UNIFORM, INSCATTER_HORIZON_BLEND_UNIFORM,
  INSCATTER_HORIZON_RANGE_UNIFORM, POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM,
  POST_PROCESS_NIGHT_MOON_INTENSITY_UNIFORM, POST_PROCESS_NIGHT_AMBIENT_INTENSITY_UNIFORM,
  POST_PROCESS_NIGHT_COLOR_UNIFORM,
} from './AtmosphereShaderPatches'
import { LOCAL_LIGHTING_LAYER } from './localLighting'

const sharedUniformNames = [
  'ATMOSPHERE', 'SUN_SPECTRAL_RADIANCE_TO_LUMINANCE', 'SKY_SPECTRAL_RADIANCE_TO_LUMINANCE',
  'transmittance_texture', 'scattering_texture', 'irradiance_texture',
  'single_mie_scattering_texture', 'higher_order_scattering_texture', 'sunDirection',
  INSCATTER_INTENSITY_UNIFORM, INSCATTER_HORIZON_BLEND_UNIFORM,
  INSCATTER_HORIZON_RANGE_UNIFORM, POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM,
  'albedoScale', 'moonDirection', POST_PROCESS_NIGHT_MOON_INTENSITY_UNIFORM,
  POST_PROCESS_NIGHT_AMBIENT_INTENSITY_UNIFORM, POST_PROCESS_NIGHT_COLOR_UNIFORM,
] as const

// A material may be reused by independent Viewers. Keep one composed hook on it;
// each renderer retains its own compiled program/uniforms through Three's cache.
const materialAttachments = new WeakMap<THREE.Material, { restore(): void }>()

function appendToShaderMain(source: string, statement: string) {
  const syntax = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, text => ' '.repeat(text.length))
  const main = /\bvoid\s+main\s*\(\s*(?:void)?\s*\)\s*\{/.exec(syntax)
  if (!main) return source
  const start = main.index + main[0].length
  let depth = 1, end = start
  for (; end < syntax.length && depth; end++) {
    if (syntax[end] === '{') depth++
    else if (syntax[end] === '}') depth--
  }
  if (depth) return source
  // Each return exits main before its tail; apply once on every completed color path.
  const returns = [...syntax.slice(start, end - 1).matchAll(/\breturn\s*;/g)]
    .map(match => ({ index: start + match.index!, length: match[0].length }))
  let result = source.slice(0, end - 1) + statement + source.slice(end - 1)
  for (const { index, length } of returns.reverse()) {
    result = result.slice(0, index) + '{' + statement + result.slice(index, index + length) + '}' + result.slice(index + length)
  }
  return result
}

const header = `
precision highp sampler3D;
#ifndef PI
#define PI 3.14159265358979323846
#endif
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
uniform vec3 sunDirection;
uniform bool telluxTransparentAtmosphereActive;
uniform vec2 telluxTransparentAtmosphereSize;
uniform vec3 telluxTransparentAtmosphereCamera;
uniform mat4 telluxTransparentAtmosphereViewToECEF;
uniform mat4 telluxTransparentAtmosphereInverseProjection;
uniform bool telluxTransparentTransmittance;
uniform bool telluxTransparentInscatter;
uniform float ${INSCATTER_INTENSITY_UNIFORM};
uniform float ${INSCATTER_HORIZON_BLEND_UNIFORM};
uniform vec2 ${INSCATTER_HORIZON_RANGE_UNIFORM};
uniform float ${POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM};
uniform float albedoScale;
uniform vec3 moonDirection;
uniform float ${POST_PROCESS_NIGHT_MOON_INTENSITY_UNIFORM};
uniform float ${POST_PROCESS_NIGHT_AMBIENT_INTENSITY_UNIFORM};
uniform vec3 ${POST_PROCESS_NIGHT_COLOR_UNIFORM};
uniform bool telluxTransparentSunLight;
uniform bool telluxTransparentSkyLight;
uniform bool telluxTransparentPostProcessLighting;
void telluxEvaluateTransparentAtmosphere(vec3 viewPosition, out vec3 transmittance, out vec3 scatter) {
  transmittance = vec3(1.0); scatter = vec3(0.0);
  if (!telluxTransparentAtmosphereActive || (!telluxTransparentTransmittance && !telluxTransparentInscatter)) return;
  vec3 point = telluxTransparentAtmosphereCamera +
    (telluxTransparentAtmosphereViewToECEF * vec4(viewPosition, 0.0)).xyz * METER_TO_LENGTH_UNIT;
  scatter = GetSkyRadianceToPoint(telluxTransparentAtmosphereCamera, point, 0.0, sunDirection, transmittance);
  float viewNormalCos = clamp(dot(normalize(point), normalize(telluxTransparentAtmosphereCamera - point)), 0.0, 1.0);
  float horizon = 1.0 - smoothstep(${INSCATTER_HORIZON_RANGE_UNIFORM}.x, ${INSCATTER_HORIZON_RANGE_UNIFORM}.y, viewNormalCos);
  float strength = ${INSCATTER_INTENSITY_UNIFORM} * ${POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM} *
    mix(1.0, horizon, ${INSCATTER_HORIZON_BLEND_UNIFORM});
  transmittance = telluxTransparentTransmittance ? transmittance : vec3(1.0);
  scatter = telluxTransparentInscatter ? scatter * strength : vec3(0.0);
}
`
const fragmentQuery = `
vec3 telluxApplyTransparentAtmosphere(vec3 color) {
  vec4 view = telluxTransparentAtmosphereInverseProjection * vec4(
    gl_FragCoord.xy / telluxTransparentAtmosphereSize * 2.0 - 1.0,
    gl_FragCoord.z * 2.0 - 1.0, 1.0);
  vec3 transmittance, scatter;
  telluxEvaluateTransparentAtmosphere(view.xyz / view.w, transmittance, scatter);
  return color * transmittance + scatter;
}
vec3 telluxApplyTransparentLighting(vec3 color, vec3 viewNormal) {
  #ifdef TELLUX_TRANSPARENT_LOCAL_LIGHTING
  return color;
  #else
  if (!telluxTransparentAtmosphereActive || !telluxTransparentPostProcessLighting) return color;
  vec4 view = telluxTransparentAtmosphereInverseProjection * vec4(
    gl_FragCoord.xy / telluxTransparentAtmosphereSize * 2.0 - 1.0, gl_FragCoord.z * 2.0 - 1.0, 1.0);
  vec3 point = telluxTransparentAtmosphereCamera +
    (telluxTransparentAtmosphereViewToECEF * vec4(view.xyz / view.w, 0.0)).xyz * METER_TO_LENGTH_UNIT;
  vec3 normalECEF = normalize(mat3(telluxTransparentAtmosphereViewToECEF) * viewNormal);
  vec3 diffuse = color * albedoScale / PI;
  vec3 result = color;
  if (telluxTransparentSunLight || telluxTransparentSkyLight) {
    vec3 sky;
    vec3 sun = GetSunAndSkyIrradiance(point, normalECEF, sunDirection, sky);
    result = diffuse * ((telluxTransparentSunLight ? sun : vec3(0.0)) +
      (telluxTransparentSkyLight ? sky : vec3(0.0))) * ${POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM};
  }
  result += diffuse * ${POST_PROCESS_NIGHT_COLOR_UNIFORM} * (${POST_PROCESS_NIGHT_AMBIENT_INTENSITY_UNIFORM} +
    ${POST_PROCESS_NIGHT_MOON_INTENSITY_UNIFORM} * max(dot(normalECEF, moonDirection), 0.0));
  return result;
  #endif
}
`

/**
 * 透明片元复用不透明大气的 LUT、昼夜与散射设置，先于 alpha 混合求值。
 * Transparent fragments reuse opaque-atmosphere LUTs and appearance settings before alpha blending.
 * 本适配器不分配 LUT，也不改变对象自身的光照或显示色补偿。
 * This adapter owns no LUTs and preserves object lighting and display-color compensation.
 */
export class TransparentAtmosphere {
  readonly active = new THREE.Uniform(false)
  readonly postProcessLighting = new THREE.Uniform(false)
  private readonly uniforms: Record<string, THREE.IUniform> = {
    telluxTransparentAtmosphereActive: this.active,
    telluxTransparentAtmosphereSize: new THREE.Uniform(new THREE.Vector2()),
    telluxTransparentAtmosphereCamera: new THREE.Uniform(new THREE.Vector3()),
    telluxTransparentAtmosphereViewToECEF: new THREE.Uniform(new THREE.Matrix4()),
    telluxTransparentAtmosphereInverseProjection: new THREE.Uniform(new THREE.Matrix4()),
    telluxTransparentTransmittance: new THREE.Uniform(true),
    telluxTransparentInscatter: new THREE.Uniform(true),
    telluxTransparentSunLight: new THREE.Uniform(false),
    telluxTransparentSkyLight: new THREE.Uniform(false),
    telluxTransparentPostProcessLighting: this.postProcessLighting,
  }
  private readonly attached = new Map<THREE.Material, { restore(): void; syncDefines(): void }>()
  private lutDefines: Record<string, string> = {}
  private lutDefinesKey = ''
  private centerSampling = true

  /** 内部对照开关：高斯中心与逐片元求值。 Internal reference switch: Gaussian-center versus per-fragment evaluation. */
  setSplatCenterSampling(enabled: boolean) {
    if (this.centerSampling === enabled) return
    this.centerSampling = enabled
    for (const material of this.attached.keys()) material.needsUpdate = true
  }

  constructor(private readonly effect: AerialPerspectiveEffect) {
    for (const name of sharedUniformNames) {
      const uniform = effect.uniforms.get(name as never)
      if (uniform) this.uniforms[name] = uniform
    }
    this.syncLutDefines()
  }

  update(camera: THREE.Camera, width: number, height: number) {
    const effect = this.effect
    this.syncLutDefines()
    this.uniforms.telluxTransparentAtmosphereSize.value.set(width, height)
    this.uniforms.telluxTransparentAtmosphereInverseProjection.value.copy(camera.projectionMatrixInverse)
    this.uniforms.telluxTransparentAtmosphereViewToECEF.value.multiplyMatrices(effect.worldToECEFMatrix, camera.matrixWorld)
    const origin = this.uniforms.telluxTransparentAtmosphereCamera.value as THREE.Vector3
    origin.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(effect.worldToECEFMatrix)
    const correction = effect.uniforms.get('altitudeCorrection')?.value as THREE.Vector3 | undefined
    if (correction) origin.add(correction)
    origin.multiplyScalar(0.001)
    this.uniforms.telluxTransparentTransmittance.value = effect.transmittance
    this.uniforms.telluxTransparentInscatter.value = effect.inscatter
    this.uniforms.telluxTransparentSunLight.value = effect.sunLight
    this.uniforms.telluxTransparentSkyLight.value = effect.skyLight
    this.active.value = !!effect.scatteringTexture && !!effect.transmittanceTexture
  }

  private syncLutDefines() {
    const next: Record<string, string> = {}
    for (const [name, value] of this.effect.defines) {
      if (/^(TRANSMITTANCE_TEXTURE_|SCATTERING_TEXTURE_|IRRADIANCE_TEXTURE_|METER_TO_LENGTH_UNIT$|COMBINED_SCATTERING_TEXTURES$|HAS_HIGHER_ORDER_SCATTERING_TEXTURE$)/.test(name)) next[name] = value
    }
    const key = JSON.stringify(next)
    if (key === this.lutDefinesKey) return
    this.lutDefines = next; this.lutDefinesKey = key
    for (const attachment of this.attached.values()) attachment.syncDefines()
  }

  attach(material: THREE.Material) {
    if (this.attached.has(material)) return
    materialAttachments.get(material)?.restore()
    const shaderMaterial = material as THREE.ShaderMaterial
    // Upstream sky/stars and existing explicitly adapted shaders already own atmospheric terms.
    if (shaderMaterial.fragmentShader?.includes('GetSkyRadiance')) return
    const before = material.onBeforeCompile, key = material.customProgramCacheKey
    const beforeRender = material.onBeforeRender
    const originalDefines = shaderMaterial.defines
    const ownedDefines = new Set<string>()
    const syncDefines = () => {
      shaderMaterial.defines ??= {}
      for (const name of ownedDefines) {
        if (!(name in this.lutDefines)) {
          if (originalDefines && name in originalDefines) shaderMaterial.defines[name] = originalDefines[name]
          else delete shaderMaterial.defines[name]
        }
      }
      for (const [name, value] of Object.entries(this.lutDefines)) {
        ownedDefines.add(name); shaderMaterial.defines[name] = value
      }
      material.needsUpdate = true
    }
    shaderMaterial.defines = { ...originalDefines }
    syncDefines()
    const compile: THREE.Material['onBeforeCompile'] = (shader, renderer) => {
      before.call(material, shader, renderer)
      Object.assign(shader.uniforms, this.uniforms)
      let fragment = shader.fragmentShader
      const sparkAnchor = '#ifdef PREMULTIPLIED_ALPHA'
      if (this.centerSampling && fragment.includes('vec4 rgba') && fragment.includes(sparkAnchor)
        && shader.vertexShader.includes('vRgba = rgba;') && shader.vertexShader.includes('vec3 viewCenter')) {
        shader.vertexShader = shader.vertexShader.replace(/void main\s*\(\s*(?:void)?\s*\)\s*{/, `${header}
out vec3 telluxSplatTransmittance;
out vec3 telluxSplatScatter;
void main() {`).replace('vRgba = rgba;', `vRgba = rgba;
telluxEvaluateTransparentAtmosphere(viewCenter, telluxSplatTransmittance, telluxSplatScatter);`)
        shader.fragmentShader = fragment.replace(/void main\s*\(\s*(?:void)?\s*\)\s*{/, `
in vec3 telluxSplatTransmittance;
in vec3 telluxSplatScatter;
void main() {`).replace(sparkAnchor, `rgba.rgb = rgba.rgb * telluxSplatTransmittance + telluxSplatScatter;\n${sparkAnchor}`)
        return
      }
      if (fragment.includes('vec4 rgba') && fragment.includes(sparkAnchor)) {
        fragment = fragment.replace(sparkAnchor, `rgba.rgb = telluxApplyTransparentAtmosphere(rgba.rgb);\n${sparkAnchor}`)
      } else if (fragment.includes('telluxOitOutput();')) {
        fragment = fragment.replace('telluxOitOutput();', 'gl_FragColor.rgb = telluxApplyTransparentAtmosphere(gl_FragColor.rgb);\ntelluxOitOutput();')
      } else if (fragment.includes('#include <opaque_fragment>')) {
        const hasNormal = shader.vertexShader.includes('#include <defaultnormal_vertex>')
        if (hasNormal) {
          shader.vertexShader = 'varying vec3 telluxTransparentNormal;\n' + shader.vertexShader
            .replace('#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )', '#if 1')
            .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\ntelluxTransparentNormal = transformedNormal;')
          fragment = 'varying vec3 telluxTransparentNormal;\n' + fragment
        }
        fragment = fragment.replace('#include <opaque_fragment>', `#include <opaque_fragment>
${hasNormal ? 'gl_FragColor.rgb = telluxApplyTransparentLighting(gl_FragColor.rgb, normalize(telluxTransparentNormal) * (gl_FrontFacing ? 1.0 : -1.0));' : ''}
gl_FragColor.rgb = telluxApplyTransparentAtmosphere(gl_FragColor.rgb);`)
      } else {
        const outputs = [...fragment.matchAll(/\bout\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+(\w+)\s*;/g)]
        const locationZero = /layout\s*\(\s*location\s*=\s*0\s*\)\s*out\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+(\w+)/.exec(fragment)
        const output = fragment.includes('gl_FragColor') ? 'gl_FragColor'
          : locationZero?.[1] ?? (outputs.length === 1 ? outputs[0][1] : null)
        if (!output) return // Preserve unsupported custom outputs instead of creating invalid GLSL.
        fragment = appendToShaderMain(fragment, `${output}.rgb = telluxApplyTransparentAtmosphere(${output}.rgb);\n`)
      }
      shader.fragmentShader = fragment.replace(/void main\s*\(\s*(?:void)?\s*\)\s*{/, `${header}\n${fragmentQuery}\nvoid main() {`)
    }
    const cacheKey = () => `${key.call(material)}:tellux-transparent-atmosphere-v1:${this.centerSampling}`
    material.onBeforeCompile = compile
    material.customProgramCacheKey = cacheKey
    const render: THREE.Material['onBeforeRender'] = function (this: THREE.Material, renderer, scene, camera, geometry, object, group) {
      beforeRender.call(this, renderer, scene, camera, geometry, object, group)
      const local = object.layers.isEnabled(LOCAL_LIGHTING_LAYER)
      const name = 'TELLUX_TRANSPARENT_LOCAL_LIGHTING'
      if (local !== (name in shaderMaterial.defines)) {
        if (local) shaderMaterial.defines[name] = 1
        else delete shaderMaterial.defines[name]
        ownedDefines.add(name)
        material.needsUpdate = true
      }
    }
    material.onBeforeRender = render
    material.needsUpdate = true
    const restore = () => {
      if (material.onBeforeCompile === compile) material.onBeforeCompile = before
      if (material.customProgramCacheKey === cacheKey) material.customProgramCacheKey = key
      if (material.onBeforeRender === render) material.onBeforeRender = beforeRender
      for (const name of ownedDefines) {
        if (originalDefines && name in originalDefines) shaderMaterial.defines[name] = originalDefines[name]
        else delete shaderMaterial.defines[name]
      }
      if (originalDefines) {
        Object.assign(originalDefines, shaderMaterial.defines)
        shaderMaterial.defines = originalDefines
      }
      material.removeEventListener('dispose', restore)
      this.attached.delete(material)
      materialAttachments.delete(material)
      material.needsUpdate = true
    }
    const attachment = { restore, syncDefines }
    this.attached.set(material, attachment)
    materialAttachments.set(material, attachment)
    material.addEventListener('dispose', restore)
  }

  dispose() {
    this.active.value = false
    for (const attachment of this.attached.values()) attachment.restore()
  }
}
