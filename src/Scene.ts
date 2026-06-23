import * as THREE from 'three'
import {
  AtmosphereSceneControls,
  CloudSceneControls,
  PostProcessControls,
  SurfaceSceneControls,
  type AtmosphereStateApplier,
  type CloudStateApplier,
  type ResolvedSceneOptions
} from './scene/SceneControls'

/**
 * 场景级控制项和底层 Three.js 场景。
 *
 * 通常通过 {@link Viewer.scene} 访问。
 *
 * Scene-level controls and the underlying Three.js scene.
 *
 * Access this through {@link Viewer.scene}.
 */
export class Scene {
  /**
   * 底层 Three.js 场景，可用于添加自定义对象。
   *
   * Underlying Three.js scene for adding custom objects.
   */
  readonly threeScene = new THREE.Scene()
  /**
   * 大气、天空和光照控制项。
   *
   * Atmosphere, sky, and lighting controls.
   */
  readonly atmosphere: AtmosphereSceneControls
  /**
   * 体积云控制项。
   *
   * Volumetric cloud controls.
   */
  readonly clouds: CloudSceneControls
  /**
   * 地表渲染控制项。
   *
   * Surface rendering controls.
   */
  readonly surface: SurfaceSceneControls
  /**
   * 后处理阶段控制项。
   *
   * Post-processing stage controls.
   */
  readonly postProcess: PostProcessControls

  private readonly fallbackAmbientLightSource: THREE.AmbientLight

  constructor(
    options: ResolvedSceneOptions,
    applyAtmosphereState: AtmosphereStateApplier,
    applyCloudsState: CloudStateApplier,
    onEffectsChange: () => void,
    onSurfaceMaterialModeChange: () => void
  ) {
    this.fallbackAmbientLightSource = new THREE.AmbientLight(0xffffff, 0)
    this.atmosphere = new AtmosphereSceneControls(
      options.atmosphere,
      this.fallbackAmbientLightSource,
      applyAtmosphereState,
      onEffectsChange,
      onSurfaceMaterialModeChange
    )
    this.clouds = new CloudSceneControls(options.clouds, applyCloudsState, onEffectsChange)
    this.surface = new SurfaceSceneControls(options.surface, onSurfaceMaterialModeChange)
    this.postProcess = new PostProcessControls(options.postProcess, onEffectsChange)
    this.threeScene.add(this.fallbackAmbientLightSource)
  }

  /**
   * 将已缓存的场景控制项同步到底层大气和云效果。
   *
   * Synchronizes cached scene controls to the underlying atmosphere and cloud
   * effects.
   */
  syncRuntimeEffects() {
    this.atmosphere.apply()
    this.clouds.apply()
  }

  /**
   * 根据当前相机高度更新夜间兜底环境光的实际强度。
   *
   * Updates the actual nighttime fallback ambient light intensity from the
   * current camera height.
   */
  updateFallbackAmbientLight(currentHeight: number) {
    this.atmosphere.fallbackAmbientLight.update(currentHeight)
  }
}

export type { ResolvedSceneOptions } from './scene/SceneControls'

