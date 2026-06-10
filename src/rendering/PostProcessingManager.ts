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

  constructor(
    private readonly renderer: ThreeRendererWithEffects,
    private readonly scene: Scene,
    threeScene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly atmosphere: AtmosphereManager,
    private readonly getCurrentHeight: () => number | null
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
    if (shouldRenderClouds) {
      nextEffects.push(this.cloudAtmosphereAdapter)
    } else if (shouldRenderAtmosphere) {
      nextEffects.push(this.atmosphereAdapter)
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
    this.renderer.setEffects(nextEffects)
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
