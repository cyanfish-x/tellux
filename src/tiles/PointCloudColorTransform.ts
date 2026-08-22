import * as THREE from 'three'
import {
  invertAgxEncodedColor,
  type ToneMappingColorState
} from '../entities/invertToneMapping'

const POINT_COLOR_LUT_SIZE = 33
const MIN_POINT_COLOR_EXPOSURE = 1e-3
const POINT_COLOR_SHADER_CACHE_KEY = 'tellux-point-color-transform-v1'
const COLOR_PARS_VERTEX = '#include <color_pars_vertex>'
const COLOR_VERTEX = '#include <color_vertex>'

type Shader = Parameters<THREE.PointsMaterial['onBeforeCompile']>[0]

/**
 * 点云顶点色的全屏色调映射适配器。
 *
 * WebGL `setEffects()` 会在场景渲染后对整帧统一执行 AgX，因此
 * `PointsMaterial.toneMapped = false` 无法保留 3D Tiles 点云的显示 RGB。
 * 该适配器用标准 33³ 3D LUT 在顶点阶段反求 AgX，既不改写大体量颜色属性，
 * 也不引入任何非标准光照；最终 output pass 会把颜色还原为数据原色。
 *
 * Full-frame tone-mapping adapter for point-cloud vertex colors.
 *
 * WebGL `setEffects()` applies AgX to the complete frame after scene rendering,
 * so `PointsMaterial.toneMapped = false` cannot preserve display RGB from 3D
 * Tiles. This adapter uses a standard 33³ 3D LUT to invert AgX in the vertex
 * stage without rewriting large color buffers or introducing non-standard
 * lighting. The final output pass then restores the source display color.
 */
export class PointCloudColorTransform {
  private readonly enabledUniform: THREE.IUniform<number> = { value: 0 }
  private readonly exposureUniform: THREE.IUniform<number> = { value: 1 }
  private readonly patchedMaterials = new WeakSet<THREE.PointsMaterial>()
  private lut: THREE.Data3DTexture | null = null

  constructor(private readonly getToneMappingState: () => ToneMappingColorState) {
    this.update()
  }

  apply(root: THREE.Object3D) {
    root.traverse((object) => {
      if (!(object as THREE.Points).isPoints) return
      const points = object as THREE.Points
      if (!points.geometry.getAttribute('color')) return
      const materials = Array.isArray(points.material)
        ? points.material
        : [points.material]
      materials.forEach((material) => {
        if (material instanceof THREE.PointsMaterial) {
          this.patchMaterial(material)
        }
      })
    })
  }

  update() {
    const state = this.getToneMappingState()
    this.enabledUniform.value = state.toneMapping === THREE.AgXToneMapping ? 1 : 0
    this.exposureUniform.value = Math.max(state.exposure, MIN_POINT_COLOR_EXPOSURE)
  }

  dispose() {
    this.lut?.dispose()
    this.lut = null
  }

  private patchMaterial(material: THREE.PointsMaterial) {
    if (this.patchedMaterials.has(material)) return
    this.patchedMaterials.add(material)

    const previousHook = material.onBeforeCompile
    const previousCacheKey = material.customProgramCacheKey()
    const lut = this.getLut()
    const enabledUniform = this.enabledUniform
    const exposureUniform = this.exposureUniform

    material.onBeforeCompile = function (shader, renderer) {
      previousHook.call(this, shader, renderer)
      injectPointColorTransform(shader, lut, enabledUniform, exposureUniform)
    }
    material.customProgramCacheKey = () =>
      `${previousCacheKey}|${POINT_COLOR_SHADER_CACHE_KEY}`
    material.needsUpdate = true
  }

  private getLut() {
    if (!this.lut) {
      this.lut = createAgxInverseLut()
    }
    return this.lut
  }
}

function injectPointColorTransform(
  shader: Shader,
  lut: THREE.Data3DTexture,
  enabledUniform: THREE.IUniform<number>,
  exposureUniform: THREE.IUniform<number>
) {
  if (
    !shader.vertexShader.includes(COLOR_PARS_VERTEX) ||
    !shader.vertexShader.includes(COLOR_VERTEX)
  ) {
    return
  }

  shader.uniforms.telluxPointColorLut = { value: lut }
  shader.uniforms.telluxPointColorTransformEnabled = enabledUniform
  shader.uniforms.telluxPointToneMappingExposure = exposureUniform
  shader.vertexShader = shader.vertexShader
    .replace(
      COLOR_PARS_VERTEX,
      `${COLOR_PARS_VERTEX}
#ifdef USE_COLOR
uniform highp sampler3D telluxPointColorLut;
uniform float telluxPointColorTransformEnabled;
uniform float telluxPointToneMappingExposure;
#endif`
    )
    .replace(
      COLOR_VERTEX,
      `${COLOR_VERTEX}
#ifdef USE_COLOR
if (telluxPointColorTransformEnabled > 0.5) {
  vec3 telluxPointColorLutUv = clamp(vColor.rgb, 0.0, 1.0)
    * (${POINT_COLOR_LUT_SIZE - 1}.0 / ${POINT_COLOR_LUT_SIZE}.0)
    + (0.5 / ${POINT_COLOR_LUT_SIZE}.0);
  vColor.rgb = texture(telluxPointColorLut, telluxPointColorLutUv).rgb
    / telluxPointToneMappingExposure;
}
#endif`
    )
}

function createAgxInverseLut() {
  const size = POINT_COLOR_LUT_SIZE
  const data = new Float32Array(size * size * size * 4)
  const maxIndex = size - 1
  let offset = 0

  for (let blue = 0; blue < size; blue++) {
    for (let green = 0; green < size; green++) {
      for (let red = 0; red < size; red++) {
        const inverted = invertAgxEncodedColor(
          [red / maxIndex, green / maxIndex, blue / maxIndex],
          1
        )
        data[offset++] = inverted[0]
        data[offset++] = inverted[1]
        data[offset++] = inverted[2]
        data[offset++] = 1
      }
    }
  }

  const texture = new THREE.Data3DTexture(data, size, size, size)
  texture.name = 'Tellux AgX inverse point-color LUT'
  texture.format = THREE.RGBAFormat
  texture.type = THREE.FloatType
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.wrapR = THREE.ClampToEdgeWrapping
  texture.generateMipmaps = false
  texture.unpackAlignment = 1
  texture.needsUpdate = true
  return texture
}
