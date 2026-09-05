import * as THREE from 'three'
import { BloomEffect, EffectPass, NormalPass, OutlineEffect, SMAAEffect } from 'postprocessing'
import { DitheringEffect, LensFlareEffect } from '@takram/three-geospatial-effects'
import { EffectPassAdapter, type ThreeEffectPass, type ThreeRendererWithEffects } from '../effects'
import type { Scene } from '../Scene'
import type { HighlightSettings } from '../scene/HighlightSettings'
import type { PostProcessSettings } from '../scene/PostProcessSettings'
import type { PointCloudEdlAggregate } from '../tiles/PointCloudShadingController'
import type { AtmosphereManager } from './AtmosphereManager'
import { applyLensFlareAppearanceState } from './lensFlareAppearance'
import { applyBloomAppearanceState } from './bloomAppearance'
import { LightingMaskPass } from './LightingMaskPass'
import { PointCloudEdlPass } from './PointCloudEdlEffect'

const CLOUD_RENDER_MAX_HEIGHT = 27000

/**
 * 法线 pass 专用材质：
 *
 * - 普通网格沿用 MeshNormalMaterial 的法线输出；
 * - 对带 aPointSize 的点云（Tellux `applyPointCloudMaterialStyle` 写入）按屏幕像素
 *   大小绘制；
 * - 仅当点云有几何 normal 且 `normalShading=true` 时写真实法线；
 * - 其他点云写 `vec4(0)`：RGB 触发大气的退化法线/unlit 语义，alpha 作为明确的
 *   后处理排除标记，使原始点色不再被空气透视二次改变。
 *
 * EDL 使用 {@link PointCloudEdlPass} 自己的独立 mask，不把 EDL mask 叠进本 pass。
 *
 * 依赖 MeshNormalMaterial 源码字符串 hook，升级 three 时需回归本文件。
 */
function createPointCloudAwareNormalMaterial() {
  const material = new THREE.MeshNormalMaterial()
  material.customProgramCacheKey = () => 'tellux-point-cloud-normal-v4'
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#define NORMAL',
        '#define NORMAL\nattribute float aPointSize;\nattribute float aTelluxPointNormalEnabled;\nvarying float vTelluxPoint;\nvarying float vTelluxPointNormalEnabled;'
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vTelluxPoint = aPointSize > 0.0 ? 1.0 : 0.0;
        vTelluxPointNormalEnabled = aTelluxPointNormalEnabled > 0.5 ? 1.0 : 0.0;
        gl_PointSize = max(aPointSize, 1.0);`
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#define NORMAL',
        '#define NORMAL\nvarying float vTelluxPoint;\nvarying float vTelluxPointNormalEnabled;'
      )
      .replace(
        'gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );',
        `if (vTelluxPoint > 0.5 && vTelluxPointNormalEnabled < 0.5) {
          gl_FragColor = vec4(0.0);
        } else {
          gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
        }`
      )
  }
  return material
}

export class PostProcessingManager {
  private readonly effectAdapters: ThreeEffectPass[] = []
  private readonly normalAdapter: ThreeEffectPass
  private readonly lightingMaskPass: LightingMaskPass
  private readonly cloudAtmosphereAdapter: ThreeEffectPass
  private readonly atmosphereAdapter: ThreeEffectPass
  private readonly pointCloudEdlPass: PointCloudEdlPass
  private readonly bloomEffect: BloomEffect
  private readonly bloomAdapter: ThreeEffectPass
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
    private readonly postProcess: PostProcessSettings,
    private readonly highlight: HighlightSettings,
    threeScene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly atmosphere: AtmosphereManager,
    private readonly getCurrentHeight: () => number | null,
    private readonly entityRenderer?: ThreeEffectPass,
    private readonly groundClampPass?: ThreeEffectPass,
    private readonly symbolOcclusionPass?: ThreeEffectPass,
    outlineEffect?: OutlineEffect | null,
    private readonly getPointCloudEdlState?: () => PointCloudEdlAggregate
  ) {
    const normalPass = new NormalPass(threeScene, this.camera)
    ;(normalPass as unknown as {
      renderPass: { overrideMaterial: THREE.Material }
    }).renderPass.overrideMaterial = createPointCloudAwareNormalMaterial()
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
    this.lightingMaskPass = new LightingMaskPass(threeScene, this.camera)
    this.atmosphere.setLightingMaskMap(this.lightingMaskPass.texture)
    this.pointCloudEdlPass = new PointCloudEdlPass(threeScene, this.camera)
    this.bloomEffect = new BloomEffect({ mipmapBlur: true })
    this.bloomAdapter = new EffectPassAdapter(
      new EffectPass(this.camera, this.bloomEffect),
      () => this.camera
    )
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
      this.lightingMaskPass,
      this.cloudAtmosphereAdapter,
      this.atmosphereAdapter,
      this.pointCloudEdlPass,
      this.bloomAdapter,
      this.lensFlareAdapter,
      this.smaaAdapter,
      this.ditheringAdapter
    )
    if (this.outlineAdapter) {
      this.effectAdapters.push(this.outlineAdapter)
    }

    this.syncLensFlareSettings()
    this.syncBloomSettings()
  }

  applyEffects() {
    this.syncEffects(this.getCurrentHeight(), true)
  }

  updateForCameraHeight(currentHeight: number | null) {
    this.syncEffects(currentHeight, false)
  }

  setHasLocalLighting(enabled: boolean) {
    this.lightingMaskPass.hasLocalLighting = enabled
  }

  setDeltaTime(deltaTime: number) {
    this.effectAdapters.forEach((adapter) => {
      adapter.setDeltaTime?.(deltaTime)
    })
  }

  private syncEffects(currentHeight: number | null, forceRecompile: boolean) {
    this.syncLensFlareSettings()
    this.syncBloomSettings()
    const edl = this.getPointCloudEdlState?.() ?? {
      enabled: false,
      strength: 1,
      radius: 1
    }
    this.pointCloudEdlPass.enabled = edl.enabled
    this.pointCloudEdlPass.setStrength(edl.strength)
    this.pointCloudEdlPass.setRadius(edl.radius)

    const nextEffects: ThreeEffectPass[] = []
    const shouldRenderAtmosphere = this.scene.atmosphere.show
    const shouldRenderClouds =
      shouldRenderAtmosphere &&
      this.scene.clouds.show &&
      this.shouldRenderCloudsAtHeight(currentHeight)
    const outlineEnabled =
      Boolean(this.outlineAdapter) && this.highlight.outline.enabled
    const effectsKey = [
      shouldRenderAtmosphere,
      shouldRenderClouds,
      this.postProcess.lensFlare.enabled,
      this.postProcess.smaa.enabled,
      this.postProcess.dithering.enabled,
      outlineEnabled,
      edl.enabled,
      edl.strength,
      edl.radius,
      this.postProcess.bloom.enabled
    ].join(':')

    this.atmosphere.syncCloudAtmosphereComposition(shouldRenderClouds, shouldRenderAtmosphere)
    if (!forceRecompile && effectsKey === this.currentEffectsKey) return

    this.cloudAtmosphereAdapter.recompile?.()
    this.atmosphereAdapter.recompile?.()

    if (shouldRenderAtmosphere) {
      nextEffects.push(this.normalAdapter)
      nextEffects.push(this.lightingMaskPass)
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
    if (edl.enabled) {
      // EDL 在大气成图之后：自定义 pass 两侧取深度，needsSwap=false，避免 Effect 绑不到深度。
      nextEffects.push(this.pointCloudEdlPass)
    }
    if (this.entityRenderer) {
      // 透明实体在大气之后合成：实体不写深度，若排在大气前，大气的天空分支会把背景
      // 为天空（深度=远平面 1.0）的实体像素当作天空重画，导致实体在地平线处被"裁
      // 剪"。移到大气后，实体直接叠加在成图上始终清晰（与 symbol 标注同理）。pass
      // 内部从 read/write 两侧探测场景深度做遮挡剔除，故 swap 后 readBuffer 无深度
      // 也能正确取到 targetA 的深度。
      nextEffects.push(this.entityRenderer)
    }
    if (this.postProcess.bloom.enabled) {
      nextEffects.push(this.bloomAdapter)
    }
    if (this.symbolOcclusionPass) {
      // Labels are screen-space overlays: draw them after atmosphere/cloud composition so
      // aerial perspective does not soften glyph edges. The pass still samples scene depth
      // for anchor occlusion and then leaves SMAA/dithering to process the final image.
      nextEffects.push(this.symbolOcclusionPass)
    }
    if (this.postProcess.lensFlare.enabled) {
      nextEffects.push(this.lensFlareAdapter)
    }
    if (outlineEnabled && this.outlineAdapter) {
      // 描边在成图之后、SMAA 之前：轮廓再交给抗锯齿。
      nextEffects.push(this.outlineAdapter)
    }
    if (this.postProcess.smaa.enabled) {
      nextEffects.push(this.smaaAdapter)
    }
    if (this.postProcess.dithering.enabled) {
      nextEffects.push(this.ditheringAdapter)
    }

    this.currentEffectsKey = effectsKey
    this.activeEffects = nextEffects
    this.renderer.setEffects(nextEffects)
  }

  private syncLensFlareSettings() {
    applyLensFlareAppearanceState(this.lensFlareEffect, this.postProcess.lensFlare)
  }

  private syncBloomSettings() {
    applyBloomAppearanceState(this.bloomEffect, this.postProcess.bloom)
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
