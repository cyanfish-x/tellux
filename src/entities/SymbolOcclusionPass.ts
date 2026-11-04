import * as THREE from 'three'
import type { SceneDepthResources } from '../rendering/SceneFrameResources'

const SYMBOL_OCCLUSION_KEY = 'telluxSymbolOcclusion'

export interface SymbolOcclusionController {
  setDepthTexture(texture: THREE.Texture | null, texelSize?: THREE.Vector2 | null): void
  setEnabled(enabled: boolean): void
}

interface VisibilityState {
  object: THREE.Object3D
  visible: boolean
}

interface MaterialDepthState {
  material: THREE.Material
  depthTest: boolean
}

/**
 * Symbol 遮挡与后合成绘制。
 *
 * symbol（文字 / 图标）必须在整帧 tone mapping + sRGB 输出**之后**、直接向 canvas
 * 以 display 色彩空间做 alpha 混合——这是 Mapbox 等地图渲染器的标准做法。若像普通
 * 实体一样画进 HDR linear 离屏缓冲，链尾的 AgX 会把字形边缘的 coverage 渐变非线性
 * 压扁（半透明边缘像素被映射得远比预期亮/暗），文字看起来膨胀、发糊、带脏边；
 * 后续 SMAA 还会把小字形再模糊一遍。
 *
 * 管线在主绘制前隐藏标注，最终输出后调用 renderAfterComposite，并显式传入本帧深度。
 * 标注直接以 display 色彩空间混合到 canvas，锚点使用场景深度做全有／全无遮挡。
 * The pipeline hides symbols before the scene draw and supplies explicit current-frame depth
 * to renderAfterComposite. Symbols blend in display space after tone mapping, using scene
 * depth for all-or-nothing anchor occlusion. They do not participate in the effects chain.
 */
export class SymbolOcclusionPass {

  private readonly hiddenSymbols: VisibilityState[] = []
  private readonly hiddenNonSymbols: VisibilityState[] = []
  private readonly materialDepthStates: MaterialDepthState[] = []
  private readonly depthTexelSize = new THREE.Vector2(1, 1)

  constructor(
    private readonly root: THREE.Object3D,
    private readonly camera: THREE.PerspectiveCamera
  ) {}

  beginFrame() {
    this.restoreHiddenSymbols()
    this.root.traverse((object) => {
      if (!object.visible || !getSymbolOcclusionController(object)) return
      this.hiddenSymbols.push({ object, visible: object.visible })
      object.visible = false
    })
  }

  /** 恢复本帧所有临时状态。 Restores all temporary frame state. */
  endFrame() {
    this.restoreHiddenSymbols()
    this.restoreNonSymbolVisibility()
    this.restoreMaterialDepthTests()
    this.disableSymbolOcclusion()
  }

  /**
   * 后合成绘制：在 effects 链 + tone mapping 输出完成后，把 symbol 直接画到 canvas。
   * 调用方需保证此时 renderer 的 effects 链已被旁路（否则会递归触发整条链）。
   *
   * Post-composite draw: renders symbols straight to the canvas after the effects
   * chain and tone-mapped output finished. The caller must bypass the renderer's
   * effects chain around this call.
   */
  renderAfterComposite(renderer: THREE.WebGLRenderer, resources: SceneDepthResources | null) {
    this.restoreHiddenSymbols()
    const depth = resources?.depth ?? null
    if (resources) this.depthTexelSize.set(1 / resources.width, 1 / resources.height)
    if (!this.hasRenderableSymbols()) {
      this.disableSymbolOcclusion()
      return
    }

    const previousRenderTarget = renderer.getRenderTarget()
    const previousAutoClear = renderer.autoClear

    this.configureSymbolRender(depth)
    try {
      renderer.autoClear = false
      renderer.setRenderTarget(null)
      renderer.render(this.root, this.camera)
    } finally {
      renderer.setRenderTarget(previousRenderTarget)
      renderer.autoClear = previousAutoClear
      this.restoreNonSymbolVisibility()
      this.restoreMaterialDepthTests()
      this.disableSymbolOcclusion()
    }
  }

  dispose() {
    this.endFrame()
  }

  private configureSymbolRender(depth: THREE.Texture | null) {
    this.root.traverse((object) => {
      const controller = getSymbolOcclusionController(object)
      if (controller) {
        // 无深度纹理时仍然绘制 symbol，只是不做锚点遮挡。
        // Without a depth texture symbols still draw, just without anchor occlusion.
        controller.setDepthTexture(depth, depth ? this.depthTexelSize : null)
        controller.setEnabled(depth !== null)
        this.disableMaterialDepthTest(object)
        return
      }

      if (!object.visible || !isRenderable(object)) return
      this.hiddenNonSymbols.push({ object, visible: object.visible })
      object.visible = false
    })
  }

  private disableSymbolOcclusion() {
    this.root.traverse((object) => {
      const controller = getSymbolOcclusionController(object)
      if (!controller) return
      controller.setEnabled(false)
      controller.setDepthTexture(null, null)
    })
  }

  private disableMaterialDepthTest(object: THREE.Object3D) {
    const material = (object as THREE.Object3D & { material?: unknown }).material
    forEachMaterial(material, (item) => {
      this.materialDepthStates.push({ material: item, depthTest: item.depthTest })
      item.depthTest = false
    })
  }

  private restoreHiddenSymbols() {
    this.hiddenSymbols.forEach(({ object, visible }) => {
      object.visible = visible
    })
    this.hiddenSymbols.length = 0
  }

  private restoreNonSymbolVisibility() {
    this.hiddenNonSymbols.forEach(({ object, visible }) => {
      object.visible = visible
    })
    this.hiddenNonSymbols.length = 0
  }

  private restoreMaterialDepthTests() {
    this.materialDepthStates.forEach(({ material, depthTest }) => {
      material.depthTest = depthTest
    })
    this.materialDepthStates.length = 0
  }

  private hasRenderableSymbols() {
    let hasRenderable = false
    this.root.traverseVisible((object) => {
      if (getSymbolOcclusionController(object)) {
        hasRenderable = true
      }
    })
    return hasRenderable
  }
}

export function setSymbolOcclusionController(
  object: THREE.Object3D,
  controller: SymbolOcclusionController
) {
  object.userData[SYMBOL_OCCLUSION_KEY] = controller
}

function getSymbolOcclusionController(object: THREE.Object3D): SymbolOcclusionController | null {
  return object.userData[SYMBOL_OCCLUSION_KEY] ?? null
}

export function isSymbolOcclusionObject(object: THREE.Object3D): boolean {
  return getSymbolOcclusionController(object) !== null
}

function isRenderable(object: THREE.Object3D): boolean {
  return Boolean((object as THREE.Object3D & { material?: unknown }).material)
}

function forEachMaterial(material: unknown, callback: (material: THREE.Material) => void) {
  if (Array.isArray(material)) {
    material.forEach((item) => {
      if (item instanceof THREE.Material) callback(item)
    })
    return
  }
  if (material instanceof THREE.Material) callback(material)
}
