import * as THREE from 'three'
import type { ThreeEffectPass } from '../effects'

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
 * 因此本类拆成两步：
 * 1. 作为 effects 链内的 pass（{@link render}）：只捕获场景深度纹理与其 texel 尺寸，
 *    不做任何绘制（needsSwap 恒为 false）。
 * 2. {@link renderAfterComposite}：由 Viewer 在 `renderer.render()` 完成（canvas 已是
 *    最终 sRGB 图像）后调用，绕过 effects 链直接把 symbol 子树画到默认帧缓冲。
 *    锚点遮挡仍用捕获的深度纹理在 fragment shader 里判定（全有 / 全无）。
 *
 * Symbol occlusion + post-composite draw. Symbols must be alpha-blended in display
 * color space AFTER whole-frame tone mapping (like Mapbox), otherwise AgX warps the
 * antialiased coverage ramp of glyph edges (dirty, bloated text) and SMAA smears
 * small glyphs. The in-chain pass only captures the scene depth texture;
 * renderAfterComposite draws the symbols straight to the canvas afterwards,
 * sampling that depth for all-or-nothing anchor occlusion.
 */
export class SymbolOcclusionPass implements ThreeEffectPass {
  enabled = true
  needsSwap = false

  private readonly hiddenSymbols: VisibilityState[] = []
  private readonly hiddenNonSymbols: VisibilityState[] = []
  private readonly materialDepthStates: MaterialDepthState[] = []
  private readonly depthTexelSize = new THREE.Vector2(1, 1)
  private capturedDepth: THREE.Texture | null = null

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

  /**
   * effects 链内步骤：仅捕获本帧场景深度，供 {@link renderAfterComposite} 使用。
   * In-chain step: captures this frame's scene depth for renderAfterComposite.
   */
  render(
    _renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ) {
    const depthOnRead = readBuffer.depthTexture ?? null
    this.capturedDepth = depthOnRead ?? writeBuffer.depthTexture ?? null
    const source = depthOnRead ? readBuffer : writeBuffer
    this.depthTexelSize.set(1 / Math.max(1, source.width), 1 / Math.max(1, source.height))
    this.needsSwap = false
  }

  /**
   * 后合成绘制：在 effects 链 + tone mapping 输出完成后，把 symbol 直接画到 canvas。
   * 调用方需保证此时 renderer 的 effects 链已被旁路（否则会递归触发整条链）。
   *
   * Post-composite draw: renders symbols straight to the canvas after the effects
   * chain and tone-mapped output finished. The caller must bypass the renderer's
   * effects chain around this call.
   */
  renderAfterComposite(renderer: THREE.WebGLRenderer) {
    this.restoreHiddenSymbols()
    const depth = this.capturedDepth
    this.capturedDepth = null
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

  setSize(_width: number, _height: number) {}

  dispose() {
    this.restoreHiddenSymbols()
    this.restoreNonSymbolVisibility()
    this.restoreMaterialDepthTests()
    this.disableSymbolOcclusion()
    this.capturedDepth = null
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
