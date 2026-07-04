import * as THREE from 'three'
import { EffectPass, NormalPass, SMAAEffect } from 'postprocessing'
import { DitheringEffect, LensFlareEffect } from '@takram/three-geospatial-effects'
import { EffectPassAdapter, type ThreeEffectPass, type ThreeRendererWithEffects } from '../effects'
import type { Scene } from '../Scene'
import type { AtmosphereManager } from './AtmosphereManager'

const CLOUD_RENDER_MAX_HEIGHT = 27000

export class PostProcessingManager {
  private readonly effectAdapters: ThreeEffectPass[] = []
  private readonly normalAdapter: ThreeEffectPass
  private readonly cloudAtmosphereAdapter: ThreeEffectPass
  private readonly atmosphereAdapter: ThreeEffectPass
  private readonly lensFlareAdapter: ThreeEffectPass
  private readonly smaaAdapter: ThreeEffectPass
  private readonly ditheringAdapter: ThreeEffectPass
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
    private readonly symbolOcclusionPass?: ThreeEffectPass
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
    this.lensFlareAdapter = new EffectPassAdapter(new EffectPass(this.camera, new LensFlareEffect()), () => this.camera)
    this.smaaAdapter = new EffectPassAdapter(new EffectPass(this.camera, new SMAAEffect()), () => this.camera)
    this.ditheringAdapter = new EffectPassAdapter(new EffectPass(this.camera, new DitheringEffect()), () => this.camera)

    this.effectAdapters.push(
      this.normalAdapter,
      this.cloudAtmosphereAdapter,
      this.atmosphereAdapter,
      this.lensFlareAdapter,
      this.smaaAdapter,
      this.ditheringAdapter
    )
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
    const nextEffects: ThreeEffectPass[] = []
    const shouldRenderAtmosphere = this.scene.atmosphere.show
    const shouldRenderClouds =
      shouldRenderAtmosphere &&
      this.scene.clouds.show &&
      this.shouldRenderCloudsAtHeight(currentHeight)
    const effectsKey = [
      shouldRenderAtmosphere,
      shouldRenderClouds,
      this.scene.postProcess.lensFlare.enabled,
      this.scene.postProcess.smaa.enabled,
      this.scene.postProcess.dithering.enabled
    ].join(':')

    this.atmosphere.syncCloudAtmosphereComposition(shouldRenderClouds, shouldRenderAtmosphere)
    if (!forceRecompile && effectsKey === this.currentEffectsKey) return

    this.cloudAtmosphereAdapter.recompile?.()
    this.atmosphereAdapter.recompile?.()

    if (shouldRenderAtmosphere) {
      nextEffects.push(this.normalAdapter)
    }
    if (this.entityRenderer) {
      nextEffects.push(this.entityRenderer)
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
    if (this.symbolOcclusionPass) {
      // Labels are screen-space overlays: draw them after atmosphere/cloud composition so
      // aerial perspective does not soften glyph edges. The pass still samples scene depth
      // for anchor occlusion and then leaves SMAA/dithering to process the final image.
      nextEffects.push(this.symbolOcclusionPass)
    }
    if (this.scene.postProcess.lensFlare.enabled) {
      nextEffects.push(this.lensFlareAdapter)
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
