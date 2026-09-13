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
import { cloudAltitudeFade, shouldRenderCloudPass } from './cloudAltitudeFade'
import { LightingMaskPass } from './LightingMaskPass'
import { PointCloudEdlPass } from './PointCloudEdlEffect'
import { SceneSubmission, submitScenePhase } from './SceneSubmission'
import { TransparentAtmosphere } from './TransparentAtmosphere'
import type { EntityRenderManager } from '../entities/EntityRenderManager'
import type { SymbolOcclusionPass } from '../entities/SymbolOcclusionPass'
import type { GroundClampPass } from './GroundClampPass'
import { SceneFrameResources } from './SceneFrameResources'

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
  private readonly frame = new SceneFrameResources()
  private frameRunning = false
  private frameFailed = false
  private frameError: unknown
  private readonly guardedEffects = new WeakSet<ThreeEffectPass>()
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
  private cloudPassActive = false
  private readonly sceneSubmission: SceneSubmission
  private readonly transparentAtmosphere: TransparentAtmosphere
  private readonly opaqueNormalAdapter: ThreeEffectPass
  private readonly normalTexture: THREE.Texture

  constructor(
    private readonly renderer: ThreeRendererWithEffects,
    private readonly scene: Scene,
    private readonly postProcess: PostProcessSettings,
    private readonly highlight: HighlightSettings,
    threeScene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly atmosphere: AtmosphereManager,
    private readonly getCurrentHeight: () => number | null,
    private readonly entityRenderer?: EntityRenderManager,
    private readonly groundClampPass?: GroundClampPass,
    private readonly symbolOcclusionPass?: SymbolOcclusionPass,
    outlineEffect?: OutlineEffect | null,
    private readonly getPointCloudEdlState?: () => PointCloudEdlAggregate
  ) {
    this.transparentAtmosphere = new TransparentAtmosphere(this.atmosphere.aerialPerspectiveEffect)
    this.sceneSubmission = new SceneSubmission(threeScene, this.camera, this.transparentAtmosphere, this.entityRenderer, this.frame)
    const normalPass = new NormalPass(threeScene, this.camera)
    this.normalTexture = normalPass.texture
    ;(normalPass as unknown as {
      renderPass: { overrideMaterial: THREE.Material }
    }).renderPass.overrideMaterial = createPointCloudAwareNormalMaterial()
    this.configureNormalPass(normalPass)
    this.atmosphere.aerialPerspectiveEffect.normalBuffer = normalPass.texture

    this.cloudAtmosphereAdapter = new EffectPassAdapter(
      new EffectPass(this.camera, this.atmosphere.cloudsEffect, this.atmosphere.aerialPerspectiveEffect),
      () => this.camera, this.frame
    )
    this.atmosphereAdapter = new EffectPassAdapter(
      new EffectPass(this.camera, this.atmosphere.aerialPerspectiveEffect),
      () => this.camera, this.frame
    )
    this.normalAdapter = new EffectPassAdapter(normalPass, () => this.camera)
    this.opaqueNormalAdapter = {
      setSize: (width, height) => this.normalAdapter.setSize(width, height),
      dispose() {},
      render: (renderer, write, read, delta, mask) => {
        const effect = this.atmosphere.aerialPerspectiveEffect
        const needsNormals = this.cloudPassActive || effect.sunLight || effect.skyLight || this.sceneSubmission.hasPointNormalMask
        effect.normalBuffer = needsNormals ? normalPass.texture : null
        if (!needsNormals) return
        submitScenePhase(renderer, threeScene, this.camera, 'opaque', {
          draw: () => this.normalAdapter.render(renderer, write, read, delta, mask),
        })
      },
    }
    Object.assign(this.opaqueNormalAdapter, { needsSwap: false })
    this.lightingMaskPass = new LightingMaskPass(threeScene, this.camera)
    this.atmosphere.setLightingMaskMap(this.lightingMaskPass.texture)
    this.pointCloudEdlPass = new PointCloudEdlPass(threeScene, this.camera)
    this.bloomEffect = new BloomEffect({ mipmapBlur: true })
    this.bloomAdapter = new EffectPassAdapter(
      new EffectPass(this.camera, this.bloomEffect),
      () => this.camera, this.frame
    )
    this.lensFlareEffect = new LensFlareEffect()
    this.lensFlareAdapter = new EffectPassAdapter(
      new EffectPass(this.camera, this.lensFlareEffect),
      () => this.camera, this.frame
    )
    this.smaaAdapter = new EffectPassAdapter(new EffectPass(this.camera, new SMAAEffect()), () => this.camera, this.frame)
    this.ditheringAdapter = new EffectPassAdapter(new EffectPass(this.camera, new DitheringEffect()), () => this.camera, this.frame)
    this.outlineAdapter = outlineEffect
      ? new EffectPassAdapter(new EffectPass(this.camera, outlineEffect), () => this.camera, this.frame)
      : null

    this.effectAdapters.push(
      this.normalAdapter,
      this.lightingMaskPass,
      this.cloudAtmosphereAdapter,
      this.atmosphereAdapter,
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
    this.sceneSubmission.atmosphereEnabled = shouldRenderAtmosphere
    this.transparentAtmosphere.postProcessLighting.value = this.scene.atmosphere.lighting.mode === 'post-process'
    const fade = cloudAltitudeFade(currentHeight)
    this.atmosphere.applyCloudAltitudeFade(fade)
    const shouldRenderClouds =
      shouldRenderAtmosphere &&
      this.scene.clouds.show &&
      shouldRenderCloudPass(currentHeight, this.cloudPassActive)
    this.cloudPassActive = shouldRenderClouds
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
    this.entityRenderer?.setAtmosphere(
      shouldRenderAtmosphere ? this.transparentAtmosphere : null
    )
    if (!forceRecompile && effectsKey === this.currentEffectsKey) return

    this.cloudAtmosphereAdapter.recompile?.()
    this.atmosphereAdapter.recompile?.()

    // One submission contract also applies when clouds or atmosphere are toggled.
    // Clouds retain the upstream overlay; object/cloud intersection is deferred for this version.
    nextEffects.push(this.sceneSubmission.opaque)
    if (shouldRenderAtmosphere) {
      nextEffects.push(this.opaqueNormalAdapter)
      nextEffects.push(this.lightingMaskPass)
    }
    if (this.groundClampPass) {
      // 贴地分类：读并集深度、渲分类几何、合成回主色。空场景时 pass 内部 no-op。
      const pass = this.groundClampPass
      nextEffects.push({
        needsSwap: false, setSize: (w, h) => pass.setSize(w, h), dispose() {},
        render: (renderer, write, read) => {
          if (pass.enabled) pass.render(renderer, write, read, this.frame.require('ground classification'))
        },
      })
    }
    if (shouldRenderClouds) {
      nextEffects.push(this.cloudAtmosphereAdapter)
    } else if (shouldRenderAtmosphere) {
      nextEffects.push(this.atmosphereAdapter)
    }
    if (edl.enabled) {
      const pass = this.pointCloudEdlPass
      nextEffects.push({
        needsSwap: false, setSize: (w, h) => pass.setSize(w, h), dispose() {},
        render: (renderer, write, read) => pass.render(renderer, write, read, this.frame.require('point cloud EDL')),
      })
    }
    nextEffects.push(this.sceneSubmission.transparent)

    if (this.postProcess.bloom.enabled) {
      nextEffects.push(this.bloomAdapter)
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
    this.activeEffects = nextEffects.map(effect => this.guardEffect(effect))
    this.renderer.setEffects(this.activeEffects)
  }

  // Three's output compositor has no exception finally. Let it unwind its frame,
  // then rethrow at our frame boundary; subsequent effects must not consume partial resources.
  private guardEffect(effect: ThreeEffectPass): ThreeEffectPass {
    if (this.guardedEffects.has(effect)) return effect
    this.guardedEffects.add(effect)
    const render = effect.render
    const owner = this
    effect.render = function (...args) {
      if (owner.frameFailed) return
      try { render.apply(this, args) } catch (error) {
        owner.frameFailed = true
        owner.frameError = error
      }
    }
    return effect
  }

  /** 统一 WebGL 帧边界，包含输出后的标注及异常恢复。 Owns the WebGL frame, post-output symbols and failure cleanup. */
  renderFrame(draw: () => void) {
    if (this.frameRunning) throw new Error('Tellux: nested pipeline frames are not supported')
    this.frameRunning = true
    const target = this.renderer.getRenderTarget()
    const tone = this.renderer.toneMapping, autoClear = this.renderer.autoClear
    this.frameFailed = false
    this.frameError = undefined
    try {
      this.sceneSubmission.beginFrame()
      this.symbolOcclusionPass?.beginFrame()
      draw()
      if (this.frameFailed) throw this.frameError
      if (this.symbolOcclusionPass) {
        const resources = this.frame.require('symbol occlusion')
        this.renderWithEffectsBypassed(() => this.symbolOcclusionPass!.renderAfterComposite(this.renderer, resources))
      }
    } finally {
      this.symbolOcclusionPass?.endFrame()
      this.sceneSubmission.endFrame()
      this.renderer.setRenderTarget(target)
      this.renderer.toneMapping = tone
      this.renderer.autoClear = autoClear
      this.frameFailed = false
      this.frameError = undefined
      this.frameRunning = false
    }
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

  private configureNormalPass(normalPass: NormalPass) {
    const pass = normalPass as NormalPass & {
      renderTarget: THREE.WebGLRenderTarget
    }
    pass.renderTarget.texture.type = THREE.HalfFloatType
  }

  dispose() {
    this.renderer.setEffects(null)
    this.symbolOcclusionPass?.endFrame()
    this.sceneSubmission.dispose()
    this.entityRenderer?.setAtmosphere(null)
    this.transparentAtmosphere.dispose()
    this.pointCloudEdlPass.dispose()
    this.effectAdapters.forEach((adapter) => adapter.dispose())
  }
}
