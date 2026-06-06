import * as THREE from 'three'
import { EffectPass, NormalPass, SMAAEffect } from 'postprocessing'
import { DitheringEffect, LensFlareEffect } from '@takram/three-geospatial-effects'
import { EffectPassAdapter, type ThreeEffectPass, type ThreeRendererWithEffects } from '../effects'
import type { Scene } from '../Scene'
import type { AtmosphereManager } from './AtmosphereManager'

export class PostProcessingManager {
  private readonly effectAdapters: ThreeEffectPass[] = []
  private readonly normalAdapter: ThreeEffectPass
  private readonly cloudAtmosphereAdapter: ThreeEffectPass
  private readonly atmosphereAdapter: ThreeEffectPass
  private readonly lensFlareAdapter: ThreeEffectPass
  private readonly smaaAdapter: ThreeEffectPass
  private readonly ditheringAdapter: ThreeEffectPass

  constructor(
    private readonly renderer: ThreeRendererWithEffects,
    private readonly scene: Scene,
    threeScene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly atmosphere: AtmosphereManager
  ) {
    const normalPass = new NormalPass(threeScene, this.camera)
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
    this.atmosphere.syncCloudAtmosphereComposition(this.scene.clouds.show, this.scene.skyAtmosphere.show)
    this.cloudAtmosphereAdapter.recompile?.()
    this.atmosphereAdapter.recompile?.()

    const nextEffects: ThreeEffectPass[] = []
    const shouldRenderAtmosphere = this.scene.skyAtmosphere.show
    const shouldRenderClouds = shouldRenderAtmosphere && this.scene.clouds.show

    if (shouldRenderAtmosphere) {
      nextEffects.push(this.normalAdapter)
    }
    if (shouldRenderClouds) {
      nextEffects.push(this.cloudAtmosphereAdapter)
    } else if (shouldRenderAtmosphere) {
      nextEffects.push(this.atmosphereAdapter)
    }
    if (this.scene.postProcessStages.lensFlare.enabled) {
      nextEffects.push(this.lensFlareAdapter)
    }
    if (this.scene.postProcessStages.smaa.enabled) {
      nextEffects.push(this.smaaAdapter)
    }
    if (this.scene.postProcessStages.dithering.enabled) {
      nextEffects.push(this.ditheringAdapter)
    }

    this.renderer.setEffects(nextEffects)
  }

  dispose() {
    this.renderer.setEffects(null)
    this.effectAdapters.forEach((adapter) => adapter.dispose())
  }
}
