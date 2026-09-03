import * as THREE from 'three'
import type { ThreeEffectPass } from '../effects'
import { LOCAL_LIGHTING_LAYER } from './localLighting'

/**
 * 局部光照 mask：1 = globe / 后处理大气光照，0 = local / 保留已着色 radiance。
 *
 * 当前 `@takram/three-atmosphere@0.19.1` 尚未导出 `LightingMaskPass`，因此 Tellux
 * 自写 RT，并经 shader patch 采样 `telluxLightingMaskBuffer`。
 *
 * Local lighting mask: 1 = globe / post-process atmosphere lighting, 0 = local /
 * keep the already-lit radiance. `@takram/three-atmosphere@0.19.1` does not
 * export `LightingMaskPass`, so Tellux owns the RT and samples it from the
 * atmosphere shader patch.
 */
export class LightingMaskPass implements ThreeEffectPass {
  enabled = true
  needsSwap = false
  hasLocalLighting = false

  readonly texture: THREE.Texture

  private readonly target: THREE.WebGLRenderTarget
  private readonly maskMaterial: THREE.MeshBasicMaterial
  private readonly clearColor = new THREE.Color()
  private width = 1
  private height = 1

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera
  ) {
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false
    })
    this.target.texture.name = 'TelluxLightingMask'
    this.texture = this.target.texture
    this.maskMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      toneMapped: false
    })
  }

  setSize(width: number, height: number) {
    const nextWidth = Math.max(1, Math.floor(width))
    const nextHeight = Math.max(1, Math.floor(height))
    if (nextWidth === this.width && nextHeight === this.height) return
    this.width = nextWidth
    this.height = nextHeight
    this.target.setSize(nextWidth, nextHeight)
  }

  render(
    renderer: THREE.WebGLRenderer,
    _writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ) {
    this.setSize(readBuffer.width, readBuffer.height)

    const previousTarget = renderer.getRenderTarget()
    const previousAutoClear = renderer.autoClear
    const previousClearAlpha = renderer.getClearAlpha()
    renderer.getClearColor(this.clearColor)
    const previousOverride = this.scene.overrideMaterial
    const previousLayerMask = this.camera.layers.mask

    try {
      renderer.setRenderTarget(this.target)
      renderer.setClearColor(0xffffff, 1)
      renderer.autoClear = true
      renderer.clear()

      if (!this.hasLocalLighting) return

      this.camera.layers.set(LOCAL_LIGHTING_LAYER)
      this.scene.overrideMaterial = this.maskMaterial
      renderer.autoClear = false
      renderer.render(this.scene, this.camera)
    } finally {
      this.camera.layers.mask = previousLayerMask
      this.scene.overrideMaterial = previousOverride
      renderer.autoClear = previousAutoClear
      renderer.setClearColor(this.clearColor, previousClearAlpha)
      renderer.setRenderTarget(previousTarget)
    }
  }

  dispose() {
    this.target.dispose()
    this.maskMaterial.dispose()
  }
}
