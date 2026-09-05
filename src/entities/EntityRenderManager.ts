import * as THREE from 'three'
import type { ThreeEffectPass } from '../effects'
import type { EntityTransparencyMode } from '../types'
import { isSymbolOcclusionObject } from './SymbolOcclusionPass'

export interface EntityRenderModeResult {
  mode: Exclude<EntityTransparencyMode, 'auto'>
  fallbackReason: string | null
}

export interface EntityRenderManagerOptions {
  root: THREE.Object3D
  camera: THREE.PerspectiveCamera
  requestedMode: EntityTransparencyMode
  supportsWeightedOit: boolean
}

type MaterialPurpose = 'accumulation' | 'revealage'

const DEPTH_EPSILON = 1e-6

export function resolveEntityTransparencyMode(
  requestedMode: EntityTransparencyMode,
  supportsWeightedOit: boolean
): EntityRenderModeResult {
  if (requestedMode === 'sorted') {
    return { mode: 'sorted', fallbackReason: null }
  }

  if (supportsWeightedOit) {
    return { mode: 'weighted-oit', fallbackReason: null }
  }

  return {
    mode: 'sorted',
    fallbackReason: requestedMode === 'weighted-oit'
      ? 'Entity weighted OIT is only available in the WebGL post-processing pipeline.'
      : null
  }
}

export class EntityRenderManager implements ThreeEffectPass {
  enabled = true
  needsSwap = false

  private requestedMode: EntityTransparencyMode
  private resolvedMode: EntityRenderModeResult
  private readonly mainSceneHiddenObjects: Array<{ object: THREE.Object3D, visible: boolean }> = []
  private readonly accumulationMaterials = new WeakMap<THREE.Material, THREE.Material>()
  private readonly revealageMaterials = new WeakMap<THREE.Material, THREE.Material>()
  private readonly derivedMaterials = new Set<THREE.Material>()
  private readonly fullscreenScene = new THREE.Scene()
  private readonly fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly compositeMaterial: THREE.ShaderMaterial
  private readonly compositeMesh: THREE.Mesh
  private accumulationTarget: THREE.WebGLRenderTarget | null = null
  private revealageTarget: THREE.WebGLRenderTarget | null = null
  private width = 1
  private height = 1

  constructor(private readonly options: EntityRenderManagerOptions) {
    this.requestedMode = options.requestedMode
    this.resolvedMode = resolveEntityTransparencyMode(options.requestedMode, options.supportsWeightedOit)
    if (this.resolvedMode.fallbackReason) {
      console.warn(`[tellux] ${this.resolvedMode.fallbackReason} Falling back to sorted entity transparency.`)
    }

    // 合成不采样主色（tBase）再写入另一个 buffer，而是以 alpha 混合直接叠加回
    // readBuffer（成图）：mix(base, c, a) ≡ 普通 SrcAlpha/OneMinusSrcAlpha 混合。
    // 本 pass 排在大气之后、就地叠加无需 swap——readBuffer 可能是大气 swap 后的
    // targetB（无深度），但颜色本就要画在成图上；OIT 遮挡剔除所需的场景深度另从
    // read/write 两侧探测（见 render()）。alpha 通道用 Zero/One 保持 base 的 alpha 不变。
    //
    // The composite does not sample the base color into another buffer; it
    // alpha-blends straight onto readBuffer (the frame): mix(base, c, a) is exactly
    // SrcAlpha/OneMinusSrcAlpha blending. Running after the atmosphere pass, it
    // composites in place and stays swap-free — readBuffer may be the depth-less
    // targetB after the atmosphere swap, but the color belongs on the frame anyway;
    // the scene depth for OIT occlusion is probed from both read/write buffers
    // (see render()). Alpha writes use Zero/One so the base alpha is preserved.
    this.compositeMaterial = new THREE.ShaderMaterial({
      name: 'TelluxEntityOITComposite',
      depthTest: false,
      depthWrite: false,
      transparent: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      uniforms: {
        tAccumulation: { value: null },
        tRevealage: { value: null }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tAccumulation;
        uniform sampler2D tRevealage;
        varying vec2 vUv;

        void main() {
          vec4 accumulation = texture2D(tAccumulation, vUv);
          float revealage = clamp(texture2D(tRevealage, vUv).a, 0.0, 1.0);
          float alpha = 1.0 - revealage;
          vec3 transparentColor = accumulation.a > 0.0001
            ? accumulation.rgb / accumulation.a
            : vec3(0.0);
          gl_FragColor = vec4(transparentColor, alpha);
        }
      `
    })
    this.compositeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMaterial)
    this.fullscreenScene.add(this.compositeMesh)
  }

  get mode() {
    return this.resolvedMode.mode
  }

  setRequestedMode(requestedMode: EntityTransparencyMode) {
    if (this.requestedMode === requestedMode) return

    const previousResolved = this.resolvedMode.mode
    this.requestedMode = requestedMode
    this.resolvedMode = resolveEntityTransparencyMode(requestedMode, this.options.supportsWeightedOit)
    if (previousResolved === 'weighted-oit' && this.resolvedMode.mode !== 'weighted-oit') {
      this.restoreMainSceneVisibility()
      this.options.root.visible = true
    }
    if (this.resolvedMode.fallbackReason) {
      console.warn(`[tellux] ${this.resolvedMode.fallbackReason} Falling back to sorted entity transparency.`)
    }
  }

  beginFrame() {
    this.restoreMainSceneVisibility()
    if (this.mode === 'weighted-oit') {
      this.hideTransparentObjectsForMainScene()
    } else {
      this.options.root.visible = true
    }
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ) {
    this.restoreMainSceneVisibility()
    // 本 pass 排在大气之后：大气 swap 后 readBuffer 是不带深度的 targetB，深度纹理
    // 只在 targetA 上。read/write 两侧探测取场景深度（同 GroundClamp/SymbolOcclusion），
    // 供 OIT 遮挡剔除采样；颜色则就地叠加到 readBuffer（成图）上。
    const depthTexture = readBuffer.depthTexture ?? writeBuffer.depthTexture ?? null
    if (this.mode !== 'weighted-oit' || !depthTexture || !this.hasTransparentRenderableEntities()) {
      this.needsSwap = false
      this.options.root.visible = true
      return
    }

    this.ensureTargets(readBuffer.width, readBuffer.height)
    const accumulationTarget = this.accumulationTarget!
    const revealageTarget = this.revealageTarget!
    const previousRenderTarget = renderer.getRenderTarget()
    const previousAutoClear = renderer.autoClear
    const previousClearColor = new THREE.Color()
    const previousClearAlpha = renderer.getClearAlpha()
    renderer.getClearColor(previousClearColor)

    try {
      this.options.root.visible = true
      this.options.root.updateWorldMatrix(true, true)
      renderer.autoClear = false

      this.renderEntities(renderer, accumulationTarget, depthTexture, 'accumulation')
      this.renderEntities(renderer, revealageTarget, depthTexture, 'revealage')
      this.renderComposite(renderer, readBuffer, accumulationTarget, revealageTarget)
    } finally {
      renderer.setRenderTarget(previousRenderTarget)
      renderer.setClearColor(previousClearColor, previousClearAlpha)
      renderer.autoClear = previousAutoClear
      this.options.root.visible = true
    }
  }

  setSize(width: number, height: number) {
    this.width = Math.max(1, Math.floor(width))
    this.height = Math.max(1, Math.floor(height))
    this.accumulationTarget?.setSize(this.width, this.height)
    this.revealageTarget?.setSize(this.width, this.height)
  }

  dispose() {
    this.accumulationTarget?.dispose()
    this.revealageTarget?.dispose()
    this.compositeMesh.geometry.dispose()
    this.compositeMaterial.dispose()
    this.derivedMaterials.forEach((material) => material.dispose())
    this.derivedMaterials.clear()
  }

  private hideTransparentObjectsForMainScene() {
    this.options.root.traverse((object) => {
      if (isSymbolOcclusionObject(object)) return
      const renderable = object as THREE.Object3D & { material?: unknown }
      if (!object.visible || !hasTransparentMaterial(renderable.material)) return
      this.mainSceneHiddenObjects.push({ object, visible: object.visible })
      object.visible = false
    })
  }

  private restoreMainSceneVisibility() {
    this.mainSceneHiddenObjects.forEach(({ object, visible }) => {
      object.visible = visible
    })
    this.mainSceneHiddenObjects.length = 0
  }

  private hasTransparentRenderableEntities() {
    let hasRenderable = false
    this.options.root.traverseVisible((object) => {
      if (isSymbolOcclusionObject(object)) return
      const renderable = object as THREE.Object3D & { material?: unknown }
      if (hasTransparentMaterial(renderable.material)) {
        hasRenderable = true
      }
    })
    return hasRenderable
  }

  private ensureTargets(width: number, height: number) {
    const nextWidth = Math.max(1, Math.floor(width))
    const nextHeight = Math.max(1, Math.floor(height))
    this.width = nextWidth
    this.height = nextHeight
    if (!this.accumulationTarget) {
      this.accumulationTarget = createOitTarget(nextWidth, nextHeight)
      this.revealageTarget = createOitTarget(nextWidth, nextHeight)
      return
    }
    if (this.accumulationTarget.width !== nextWidth || this.accumulationTarget.height !== nextHeight) {
      this.accumulationTarget.setSize(nextWidth, nextHeight)
      this.revealageTarget!.setSize(nextWidth, nextHeight)
    }
  }

  private renderEntities(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget,
    sceneDepthTexture: THREE.Texture,
    purpose: MaterialPurpose
  ) {
    const clearColor = purpose === 'accumulation' ? new THREE.Color(0, 0, 0) : new THREE.Color(1, 1, 1)
    const clearAlpha = purpose === 'accumulation' ? 0 : 1
    const replacements: Array<{ object: THREE.Object3D & { material?: unknown }, material: unknown }> = []
    const visibilityRestores: Array<{ object: THREE.Object3D, visible: boolean }> = []

    this.options.root.traverse((object) => {
      if (isSymbolOcclusionObject(object)) return
      const renderable = object as THREE.Object3D & { material?: unknown }
      if (!renderable.material) return
      if (!hasTransparentMaterial(renderable.material)) {
        visibilityRestores.push({ object, visible: object.visible })
        object.visible = false
        return
      }
      replacements.push({ object: renderable, material: renderable.material })
      renderable.material = replaceMaterial(renderable.material, (material) =>
        shouldRenderWithOit(material)
          ? this.getDerivedMaterial(material, purpose, sceneDepthTexture)
          : material
      )
    })

    try {
      renderer.setRenderTarget(target)
      renderer.setClearColor(clearColor, clearAlpha)
      renderer.clear(true, true, true)
      renderer.render(this.options.root, this.options.camera)
    } finally {
      replacements.forEach(({ object, material }) => {
        object.material = material
      })
      visibilityRestores.forEach(({ object, visible }) => {
        object.visible = visible
      })
    }
  }

  private renderComposite(
    renderer: THREE.WebGLRenderer,
    readBuffer: THREE.WebGLRenderTarget,
    accumulationTarget: THREE.WebGLRenderTarget,
    revealageTarget: THREE.WebGLRenderTarget
  ) {
    this.compositeMaterial.uniforms.tAccumulation.value = accumulationTarget.texture
    this.compositeMaterial.uniforms.tRevealage.value = revealageTarget.texture
    // 混合叠加到 readBuffer 上，不清屏、不 swap（见 compositeMaterial 注释）。
    // Blend onto readBuffer without clearing or swapping (see compositeMaterial).
    renderer.setRenderTarget(readBuffer)
    renderer.render(this.fullscreenScene, this.fullscreenCamera)
  }

  private getDerivedMaterial(material: THREE.Material, purpose: MaterialPurpose, sceneDepthTexture: THREE.Texture) {
    const cache = purpose === 'accumulation' ? this.accumulationMaterials : this.revealageMaterials
    let derived = cache.get(material)
    if (!derived) {
      derived = material.clone()
      configureDerivedMaterial(derived, purpose)
      cache.set(material, derived)
      this.derivedMaterials.add(derived)
    }
    derived.visible = material.visible
    derived.opacity = material.opacity
    derived.transparent = true
    derived.depthTest = true
    derived.depthWrite = false
    if (!derived.userData.telluxSceneDepthUniform) {
      derived.userData.telluxSceneDepthUniform = { value: null }
    }
    derived.userData.telluxSceneDepthUniform.value = sceneDepthTexture
    if (!derived.userData.telluxResolution) {
      derived.userData.telluxResolution = new THREE.Vector2()
    }
    ;(derived.userData.telluxResolution as THREE.Vector2).set(this.width, this.height)
    return derived
  }
}

function createOitTarget(width: number, height: number) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false
  })
  target.texture.name = 'TelluxEntityOIT'
  target.texture.minFilter = THREE.NearestFilter
  target.texture.magFilter = THREE.NearestFilter
  target.texture.generateMipmaps = false
  return target
}

function replaceMaterial(material: unknown, replaceOne: (material: THREE.Material) => THREE.Material): unknown {
  if (Array.isArray(material)) return material.map((item) => replaceOne(item))
  return material instanceof THREE.Material ? replaceOne(material) : material
}

function hasTransparentMaterial(material: unknown): boolean {
  if (Array.isArray(material)) return material.some((item) => shouldRenderWithOit(item))
  return shouldRenderWithOit(material)
}

function shouldRenderWithOit(material: unknown): material is THREE.Material {
  return material instanceof THREE.Material && (material.transparent || material.opacity < 1)
}

function configureDerivedMaterial(material: THREE.Material, purpose: MaterialPurpose) {
  material.name = `TelluxEntityOIT:${purpose}:${material.name}`
  material.blending = THREE.CustomBlending
  material.blendEquation = THREE.AddEquation
  material.blendEquationAlpha = THREE.AddEquation
  material.blendSrc = purpose === 'accumulation' ? THREE.OneFactor : THREE.ZeroFactor
  material.blendSrcAlpha = purpose === 'accumulation' ? THREE.OneFactor : THREE.ZeroFactor
  material.blendDst = purpose === 'accumulation' ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor
  material.blendDstAlpha = purpose === 'accumulation' ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor

  const previousOnBeforeCompile = material.onBeforeCompile
  const previousCustomProgramCacheKey = material.customProgramCacheKey.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile.call(material, shader, renderer)
    shader.uniforms.telluxSceneDepth = material.userData.telluxSceneDepthUniform
    shader.uniforms.telluxResolution = { value: material.userData.telluxResolution }
    shader.fragmentShader = patchFragmentShader(shader.fragmentShader, purpose)
  }
  material.customProgramCacheKey = () => `${previousCustomProgramCacheKey()}:tellux-entity-oit-${purpose}`
}

function patchFragmentShader(fragmentShader: string, purpose: MaterialPurpose) {
  const header = `
    uniform sampler2D telluxSceneDepth;
    uniform vec2 telluxResolution;
    void telluxDepthDiscard() {
      vec2 telluxUv = gl_FragCoord.xy / telluxResolution;
      float telluxSceneDepthValue = texture2D(telluxSceneDepth, telluxUv).x;
      if (gl_FragCoord.z > telluxSceneDepthValue + ${DEPTH_EPSILON.toFixed(8)}) {
        discard;
      }
    }
    void telluxOitOutput() {
      telluxDepthDiscard();
      float telluxAlpha = clamp(gl_FragColor.a, 0.0, 1.0);
      ${purpose === 'accumulation'
        ? 'gl_FragColor = vec4(gl_FragColor.rgb * telluxAlpha, telluxAlpha);'
        : 'gl_FragColor = vec4(vec3(1.0), telluxAlpha);'}
    }
  `
  const body = fragmentShader.includes('#include <opaque_fragment>')
    ? fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n      telluxOitOutput();')
    : fragmentShader.match(/gl_FragColor\s*=\s*vec4\(\s*diffuseColor\.rgb\s*,\s*alpha\s*\)\s*;/)
      ? fragmentShader.replace(/gl_FragColor\s*=\s*vec4\(\s*diffuseColor\.rgb\s*,\s*alpha\s*\)\s*;/, 'gl_FragColor = vec4(diffuseColor.rgb, alpha);\n      telluxOitOutput();')
      : fragmentShader.replace(/}\s*$/, '  telluxOitOutput();\n}')

  return `${header}\n${body}`
}
