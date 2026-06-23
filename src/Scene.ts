import * as THREE from 'three'
import {
  AtmosphereSettings,
  CloudSettings,
  PostProcessSettings,
  SurfaceSettings,
  type AtmosphereStateApplier,
  type CloudStateApplier,
  type ResolvedSceneOptions
} from './scene/SceneSettings'

/**
 * 场景级运行时设置和底层 Three.js 场景。
 *
 * 通常通过 {@link Viewer.scene} 访问。
 *
 * Scene-level runtime settings and the underlying Three.js scene.
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
   * 大气、天空和光照运行时设置。
   *
   * Atmosphere, sky, and lighting runtime settings.
   */
  readonly atmosphere: AtmosphereSettings
  /**
   * 体积云运行时设置。
   *
   * Volumetric cloud runtime settings.
   */
  readonly clouds: CloudSettings
  /**
   * 地表渲染运行时设置。
   *
   * Surface rendering runtime settings.
   */
  readonly surface: SurfaceSettings
  /**
   * 后处理阶段运行时设置。
   *
   * Post-processing stage runtime settings.
   */
  readonly postProcess: PostProcessSettings

  private readonly fallbackAmbientLightSource: THREE.AmbientLight

  constructor(
    options: ResolvedSceneOptions,
    applyAtmosphereState: AtmosphereStateApplier,
    applyCloudsState: CloudStateApplier,
    onEffectsChange: () => void,
    onSurfaceMaterialModeChange: () => void
  ) {
    this.fallbackAmbientLightSource = new THREE.AmbientLight(0xffffff, 0)
    this.atmosphere = new AtmosphereSettings(
      options.atmosphere,
      this.fallbackAmbientLightSource,
      applyAtmosphereState,
      onEffectsChange,
      onSurfaceMaterialModeChange
    )
    this.clouds = new CloudSettings(options.clouds, applyCloudsState, onEffectsChange)
    this.surface = new SurfaceSettings(options.surface, onSurfaceMaterialModeChange)
    this.postProcess = new PostProcessSettings(options.postProcess, onEffectsChange)
    this.threeScene.add(this.fallbackAmbientLightSource)
  }

  /**
   * 将已缓存的场景运行时设置同步到底层大气和云效果。
   *
   * Synchronizes cached scene runtime settings to the underlying atmosphere
   * and cloud effects.
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

export type { ResolvedSceneOptions } from './scene/SceneSettings'

