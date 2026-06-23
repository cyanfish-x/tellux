import type * as THREE from 'three'
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

export class AtmosphereSettings {
  readonly lighting: AtmosphereLightingSettings
  readonly night: AtmosphereNightSettings
  readonly scattering: AtmosphereScatteringSettings
  readonly sky: AtmosphereSkySettings
  readonly shadow: AtmosphereShadowSettings
  readonly fallbackAmbientLight: FallbackAmbientLightSettings
  private readonly visibility: SceneToggle

  constructor(
    options: ResolvedSceneOptions['atmosphere'],
    fallbackAmbientLightSource: THREE.AmbientLight,
    private readonly applyAtmosphereState: AtmosphereStateApplier,
    onEffectsChange: () => void,
    onSurfaceMaterialModeChange: () => void
  ) {
    const onStateChange = () => {
      this.apply()
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

  apply() {
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
      starsIntensity: this.sky.starsIntensity,
      starsPointSize: this.sky.starsPointSize,
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
