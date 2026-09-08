import * as THREE from 'three'
import type { AtmosphereRuntimeState } from '../rendering/AtmosphereRuntimeState'
import type { AtmosphereStateApplier } from './SceneStateAppliers'
import type { ResolvedSceneOptions } from './SceneOptions'
import { AtmosphereLightingSettings } from './AtmosphereLightingSettings'
import { AtmosphereNightSettings } from './AtmosphereNightSettings'
import { AtmosphereScatteringSettings } from './AtmosphereScatteringSettings'
import { AtmosphereShadowSettings } from './AtmosphereShadowSettings'
import { AtmosphereSkySettings } from './AtmosphereSkySettings'
import { FallbackAmbientLightSettings } from './FallbackAmbientLightSettings'
import { SceneToggle } from './SceneToggle'

const atmosphereApply = new WeakMap<AtmosphereSettings, () => void>()

export function applyAtmosphereSettings(settings: AtmosphereSettings) {
  atmosphereApply.get(settings)?.()
}

export class AtmosphereSettings {
  readonly lighting: AtmosphereLightingSettings
  readonly night: AtmosphereNightSettings
  readonly scattering: AtmosphereScatteringSettings
  readonly sky: AtmosphereSkySettings
  readonly shadow: AtmosphereShadowSettings
  readonly fallbackAmbientLight: FallbackAmbientLightSettings
  private readonly visibility: SceneToggle
  private readonly worldToECEFMatrix = new THREE.Matrix4()

  constructor(
    options: ResolvedSceneOptions['atmosphere'],
    fallbackAmbientLightSource: THREE.AmbientLight,
    private readonly applyAtmosphereState: AtmosphereStateApplier,
    onEffectsChange: () => void,
    onSurfaceMaterialModeChange: () => void,
    private readonly applyWorldToECEFMatrix: (matrix: THREE.Matrix4) => void = () => {}
  ) {
    const onStateChange = () => {
      this.#apply()
    }
    this.visibility = new SceneToggle(options.show, onEffectsChange)
    this.lighting = new AtmosphereLightingSettings(
      options.lighting,
      onStateChange,
      onEffectsChange,
      onSurfaceMaterialModeChange
    )
    this.night = new AtmosphereNightSettings(options.night, onStateChange)
    this.scattering = new AtmosphereScatteringSettings(options.scattering, onStateChange)
    this.sky = new AtmosphereSkySettings(options.sky, onStateChange)
    this.shadow = new AtmosphereShadowSettings(options.shadow, onStateChange)
    this.fallbackAmbientLight = new FallbackAmbientLightSettings(options.fallbackAmbientLight, fallbackAmbientLightSource)
    atmosphereApply.set(this, () => this.#apply())
  }

  /**
   * 大气天空和空气透视是否显示。
   *
   * Whether atmospheric sky and aerial perspective are shown.
   */
  get show() {
    return this.visibility.show
  }

  set show(value: boolean) {
    this.visibility.show = value
  }

  /**
   * 设置 Three.js 世界到 ECEF 的变换。
   *
   * 仅当应用已把场景世界从 ECEF 换走时调用。传入与场景重基准同一套矩阵；
   * 必须正交，只含平移和旋转。门面会 copy，不持有调用方引用。
   * 恢复默认传入单位阵。地球、相机和控件仍按 ECEF。
   *
   * Sets the Three.js world-to-ECEF transform.
   *
   * Call this only after the app has rebased the scene world away from ECEF.
   * Pass the same matrix used for that rebase. It must be orthogonal and contain
   * only translation and rotation. The facade copies the matrix and does not
   * keep the caller's reference. Pass an identity matrix to restore the default.
   * Globe, camera, and controls still assume ECEF.
   */
  setWorldToECEFMatrix(matrix: THREE.Matrix4) {
    this.worldToECEFMatrix.copy(matrix)
    this.applyWorldToECEFMatrix(this.worldToECEFMatrix)
  }

  /**
   * 读出当前世界到 ECEF 的变换。传入 `target` 时写入并返回它。
   *
   * Reads the current world-to-ECEF transform. Writes into `target` when provided.
   */
  getWorldToECEFMatrix(target = new THREE.Matrix4()) {
    return target.copy(this.worldToECEFMatrix)
  }

  #apply() {
    this.applyAtmosphereState(this.getRuntimeState())
  }

  private getRuntimeState(): AtmosphereRuntimeState {
    return {
      inscatterIntensity: this.scattering.intensity,
      inscatterHorizonBlend: this.scattering.horizonBlend,
      inscatterHorizonRange: this.scattering.horizonRange,
      correctAltitude: this.scattering.correctAltitude,
      correctGeometricError: this.scattering.correctGeometricError,
      transmittance: this.scattering.transmittance,
      inscatter: this.scattering.inscatter,
      lightingMode: this.lighting.mode,
      sunLight: this.lighting.sunLight,
      skyLight: this.lighting.skyLight,
      sunLightIntensity: this.lighting.sunLightIntensity,
      skyLightIntensity: this.lighting.skyLightIntensity,
      photometric: {
        enabled: this.lighting.photometric.enabled,
        sunIlluminance: this.lighting.photometric.sunIlluminance
      },
      night: {
        enabled: this.night.enabled,
        moonLight: this.night.moonLight,
        ambientLight: this.night.ambientLight,
        color: this.night.color,
        moonLightIntensity: this.night.moonLightIntensity,
        ambientIntensity: this.night.ambientIntensity,
        useMoonPhase: this.night.useMoonPhase,
        transitionRange: this.night.transitionRange
      },
      sun: this.sky.sun,
      moon: this.sky.moon,
      ground: this.sky.ground,
      albedoScale: this.lighting.albedoScale,
      sunAngularRadius: this.sky.sunAngularRadius,
      moonAngularRadius: this.sky.moonAngularRadius,
      lunarRadianceScale: this.sky.lunarRadianceScale,
      shadowRadius: this.shadow.radius,
      shadowSampleCount: this.shadow.sampleCount,
      starsVisible: this.sky.stars.show,
      starsIntensity: this.sky.stars.intensity,
      starsPointSize: this.sky.stars.pointSize,
      solarIrradianceScale: this.scattering.solarIrradianceScale,
      rayleighScatteringScale: this.scattering.rayleighScatteringScale,
      mieScatteringScale: this.scattering.mieScatteringScale,
      mieExtinctionScale: this.scattering.mieExtinctionScale,
      miePhaseFunctionG: this.scattering.miePhaseFunctionG,
      absorptionExtinctionScale: this.scattering.absorptionExtinctionScale,
      groundAlbedo: this.scattering.groundAlbedo
    }
  }
}
