import * as THREE from 'three'

const GLOBE_OPACITY_PARAMS = Symbol('telluxGlobeOpacity')
const GLOBE_OPACITY_SHADER_CACHE_KEY = 'tellux-globe-opacity'

type GlobeOpacityParams = {
  telluxGlobeOpacity: THREE.IUniform<number>
}

type WrappedOnBeforeCompile = {
  (
    this: THREE.Material,
    shader: THREE.WebGLProgramParametersWithUniforms,
    renderer: THREE.WebGLRenderer
  ): void
  [GLOBE_OPACITY_PARAMS]?: GlobeOpacityParams
}

type GlobeOpacityMaterial = THREE.Material & {
  opacity: number
  transparent: boolean
  depthWrite: boolean
  [GLOBE_OPACITY_PARAMS]?: GlobeOpacityParams
}

export function getGlobeOpacityParams(material: THREE.Material): GlobeOpacityParams | undefined {
  return (material as GlobeOpacityMaterial)[GLOBE_OPACITY_PARAMS]
}

/**
 * 在 overlay 混色之后再乘地球皮肤透明度。
 *
 * `ImageOverlayPlugin` 在 `color_fragment` 之后用卫星纹理替换 `diffuseColor`
 *（含 alpha），会冲掉 Three 的 `material.opacity`。独立 uniform 写在
 * `alphamap_fragment` 之后，overlay 后包材质时仍生效。
 *
 * Apply globe-skin opacity after overlay compositing.
 *
 * `ImageOverlayPlugin` replaces `diffuseColor` (including alpha) after
 * `color_fragment`, which overwrites Three's `material.opacity`. A dedicated
 * uniform after `alphamap_fragment` restores the globe fade.
 */
export function wrapGlobeOpacityMaterial(material: THREE.Material): GlobeOpacityParams {
  const globeMaterial = material as GlobeOpacityMaterial
  const existing = globeMaterial[GLOBE_OPACITY_PARAMS]
    ?? (globeMaterial.onBeforeCompile as WrappedOnBeforeCompile | undefined)?.[GLOBE_OPACITY_PARAMS]
  if (existing) {
    globeMaterial[GLOBE_OPACITY_PARAMS] = existing
    return existing
  }

  const params: GlobeOpacityParams = {
    telluxGlobeOpacity: { value: 1 }
  }
  const previousOnBeforeCompile = globeMaterial.onBeforeCompile
  const previousCacheKey = globeMaterial.customProgramCacheKey.bind(globeMaterial)

  const hook: WrappedOnBeforeCompile = function (shader, renderer) {
    previousOnBeforeCompile?.call(this, shader, renderer)
    injectGlobeOpacity(shader, params)
  }
  hook[GLOBE_OPACITY_PARAMS] = params

  globeMaterial[GLOBE_OPACITY_PARAMS] = params
  globeMaterial.onBeforeCompile = hook
  globeMaterial.customProgramCacheKey = () =>
    `${previousCacheKey()}|${GLOBE_OPACITY_SHADER_CACHE_KEY}`
  globeMaterial.needsUpdate = true
  return params
}

export function applyGlobeOpacityToMaterial(
  material: THREE.Material,
  opacity: number,
  applyThreeMaterialOpacity: boolean
) {
  const globeMaterial = material as GlobeOpacityMaterial
  const transparent = opacity < 1
  const pipelineChanged =
    globeMaterial.transparent !== transparent || globeMaterial.depthWrite !== !transparent

  globeMaterial.transparent = transparent
  globeMaterial.depthWrite = !transparent

  if (applyThreeMaterialOpacity) {
    globeMaterial.opacity = opacity
  } else {
    globeMaterial.opacity = 1
    wrapGlobeOpacityMaterial(globeMaterial).telluxGlobeOpacity.value = opacity
  }

  if (pipelineChanged) {
    globeMaterial.needsUpdate = true
  }
}

function injectGlobeOpacity(
  shader: THREE.WebGLProgramParametersWithUniforms,
  params: GlobeOpacityParams
) {
  shader.uniforms.telluxGlobeOpacity = params.telluxGlobeOpacity
  if (shader.fragmentShader.includes('telluxGlobeOpacity')) return

  shader.fragmentShader = `uniform float telluxGlobeOpacity;\n${shader.fragmentShader}`

  const alphamap = '#include <alphamap_fragment>'
  if (shader.fragmentShader.includes(alphamap)) {
    shader.fragmentShader = shader.fragmentShader.replace(
      alphamap,
      `${alphamap}\ndiffuseColor.a *= telluxGlobeOpacity;`
    )
    return
  }

  shader.fragmentShader = shader.fragmentShader.replace(
    /void main\(\s*\)\s*{/,
    (value) => `${value}\ndiffuseColor.a *= telluxGlobeOpacity;`
  )
}
