import * as THREE from 'three'
import { EffectPass, NormalPass, OutlineEffect, SMAAEffect } from 'postprocessing'
import { DitheringEffect, LensFlareEffect } from '@takram/three-geospatial-effects'
import { EffectPassAdapter, type ThreeEffectPass, type ThreeRendererWithEffects } from '../effects'
import type { Scene } from '../Scene'
import type { AtmosphereManager } from './AtmosphereManager'
import { applyLensFlareAppearanceState } from './lensFlareAppearance'

const CLOUD_RENDER_MAX_HEIGHT = 27000

export class PostProcessingManager {
  private readonly effectAdapters: ThreeEffectPass[] = []
  private readonly normalAdapter: ThreeEffectPass
  private readonly cloudAtmosphereAdapter: ThreeEffectPass
  private readonly atmosphereAdapter: ThreeEffectPass
  private readonly lensFlareEffect: LensFlareEffect
  private readonly lensFlareAdapter: ThreeEffectPass
  private readonly smaaAdapter: ThreeEffectPass
  private readonly ditheringAdapter: ThreeEffectPass
  private readonly outlineAdapter: ThreeEffectPass | null
  private currentEffectsKey = ''
  private activeEffects: ThreeEffectPass[] = []

  constructor(
    private readonly renderer: ThreeRendererWithEffects,
    private readonly scene: Scene,
    threeScene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly atmosphere: AtmosphereManager,
    private readonly getCurrentHeight: () => number | null,
    private readonly entityRenderer?: ThreeEffectPass,
    private readonly groundClampPass?: ThreeEffectPass,
    private readonly symbolOcclusionPass?: ThreeEffectPass,
    outlineEffect?: OutlineEffect | null
  ) {
    const normalPass = new NormalPass(threeScene, this.camera)
    this.configureNormalPass(normalPass)
    this.atmosphere.aerialPerspectiveEffect.normalBuffer = normalPass.texture

    this.cloudAtmosphereAdapter = new EffectPassAdapter(
      new EffectPass(this.camera, this.atmosphere.cloudsEffect, this.atmosphere.aerialPerspectiveEffect),
      () => this.camera
    )
    this.atmosphereAdapter = new EffectPassAdapter(
      new EffectPass(this.camera, this.atmosphere.aerialPerspectiveEffect),
      () => this.camera
    )
    this.normalAdapter = new EffectPassAdapter(normalPass, () => this.camera)
    this.lensFlareEffect = new LensFlareEffect()
    this.lensFlareAdapter = new EffectPassAdapter(
      new EffectPass(this.camera, this.lensFlareEffect),
      () => this.camera
    )
    this.smaaAdapter = new EffectPassAdapter(new EffectPass(this.camera, new SMAAEffect()), () => this.camera)
    this.ditheringAdapter = new EffectPassAdapter(new EffectPass(this.camera, new DitheringEffect()), () => this.camera)
    this.outlineAdapter = outlineEffect
      ? new EffectPassAdapter(new EffectPass(this.camera, outlineEffect), () => this.camera)
      : null

    this.effectAdapters.push(
      this.normalAdapter,
      this.cloudAtmosphereAdapter,
      this.atmosphereAdapter,
      this.lensFlareAdapter,
      this.smaaAdapter,
      this.ditheringAdapter
    )
    if (this.outlineAdapter) {
      this.effectAdapters.push(this.outlineAdapter)
    }

    this.syncLensFlareSettings()
  }

  applyEffects() {
    this.syncEffects(this.getCurrentHeight(), true)
  }

  updateForCameraHeight(currentHeight: number | null) {
    this.syncEffects(currentHeight, false)
  }

  setDeltaTime(deltaTime: number) {
    this.effectAdapters.forEach((adapter) => {
      adapter.setDeltaTime?.(deltaTime)
    })
  }

  private syncEffects(currentHeight: number | null, forceRecompile: boolean) {
    this.syncLensFlareSettings()

    const nextEffects: ThreeEffectPass[] = []
    const shouldRenderAtmosphere = this.scene.atmosphere.show
    const shouldRenderClouds =
      shouldRenderAtmosphere &&
      this.scene.clouds.show &&
      this.shouldRenderCloudsAtHeight(currentHeight)
    const outlineEnabled =
      Boolean(this.outlineAdapter) && this.scene.highlight.outline.enabled
    const effectsKey = [
      shouldRenderAtmosphere,
      shouldRenderClouds,
      this.scene.postProcess.lensFlare.enabled,
      this.scene.postProcess.smaa.enabled,
      this.scene.postProcess.dithering.enabled,
      outlineEnabled
    ].join(':')

    this.atmosphere.syncCloudAtmosphereComposition(shouldRenderClouds, shouldRenderAtmosphere)
    if (!forceRecompile && effectsKey === this.currentEffectsKey) return

    this.cloudAtmosphereAdapter.recompile?.()
    this.atmosphereAdapter.recompile?.()

    if (shouldRenderAtmosphere) {
      nextEffects.push(this.normalAdapter)
    }
    if (this.groundClampPass) {
      // 贴地分类：读并集深度、渲分类几何、合成回主色。空场景时 pass 内部 no-op。
      nextEffects.push(this.groundClampPass)
    }
    if (shouldRenderClouds) {
      nextEffects.push(this.cloudAtmosphereAdapter)
    } else if (shouldRenderAtmosphere) {
      nextEffects.push(this.atmosphereAdapter)
    }
    if (this.entityRenderer) {
      // 透明实体在大气之后合成：实体不写深度，若排在大气前，大气的天空分支会把背景
      // 为天空（深度=远平面 1.0）的实体像素当作天空重画，导致实体在地平线处被"裁
      // 剪"。移到大气后，实体直接叠加在成图上始终清晰（与 symbol 标注同理）。pass
      // 内部从 read/write 两侧探测场景深度做遮挡剔除，故 swap 后 readBuffer 无深度
      // 也能正确取到 targetA 的深度。
      nextEffects.push(this.entityRenderer)
    }
    if (this.symbolOcclusionPass) {
      // Labels are screen-space overlays: draw them after atmosphere/cloud composition so
      // aerial perspective does not soften glyph edges. The pass still samples scene depth
      // for anchor occlusion and then leaves SMAA/dithering to process the final image.
      nextEffects.push(this.symbolOcclusionPass)
    }
    if (this.scene.postProcess.lensFlare.enabled) {
      nextEffects.push(this.lensFlareAdapter)
    }
    if (outlineEnabled && this.outlineAdapter) {
      // 描边在成图之后、SMAA 之前：轮廓再交给抗锯齿。
      nextEffects.push(this.outlineAdapter)
    }
    if (this.scene.postProcess.smaa.enabled) {
      nextEffects.push(this.smaaAdapter)
    }
    if (this.scene.postProcess.dithering.enabled) {
      nextEffects.push(this.ditheringAdapter)
    }

    this.currentEffectsKey = effectsKey
    this.activeEffects = nextEffects
    this.renderer.setEffects(nextEffects)
  }

  private syncLensFlareSettings() {
    applyLensFlareAppearanceState(this.lensFlareEffect, this.scene.postProcess.lensFlare)
  }

  /**
   * 临时旁路 effects 链与 tone mapping，执行 `fn` 后恢复。
   *
   * 供 symbol 后合成绘制使用：`fn` 内的 `renderer.render()` 不进入内置 setEffects
   * 管线（begin() 对 NoToneMapping + 空 effects 直接放行），直接向当前帧缓冲绘制。
   *
   * Temporarily bypasses the effects chain and tone mapping while running `fn`.
   * Used by the symbol post-composite draw: render() calls inside `fn` skip the
   * built-in setEffects pipeline and draw straight to the current framebuffer.
   */
  renderWithEffectsBypassed(fn: () => void) {
    const previousToneMapping = this.renderer.toneMapping
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.setEffects([])
    try {
      fn()
    } finally {
      this.renderer.setEffects(this.activeEffects)
      this.renderer.toneMapping = previousToneMapping
    }
  }

  private shouldRenderCloudsAtHeight(currentHeight: number | null) {
    return currentHeight !== null && Number.isFinite(currentHeight) && currentHeight < CLOUD_RENDER_MAX_HEIGHT
  }

  private configureNormalPass(normalPass: NormalPass) {
    const pass = normalPass as NormalPass & {
      renderTarget: THREE.WebGLRenderTarget
    }
    pass.renderTarget.texture.type = THREE.HalfFloatType
  }

  dispose() {
    this.renderer.setEffects(null)
    this.effectAdapters.forEach((adapter) => adapter.dispose())
  }
}
