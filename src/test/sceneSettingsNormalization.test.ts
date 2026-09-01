import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import { resolveViewerSceneOptions } from '../ViewerOptionsResolver'
import { AtmosphereSettings } from '../scene/AtmosphereSettings'
import { CloudSettings } from '../scene/CloudSettings'
import { PostProcessSettings } from '../scene/PostProcessSettings'

describe('scene setting normalization', () => {
  it('normalizes initial scene options at the domain boundary', () => {
    const options = resolveViewerSceneOptions({
      atmosphere: {
        lighting: {
          sunLightIntensity: -2,
          skyLightIntensity: Number.NaN,
          albedoScale: -1
        },
        night: {
          moonLightIntensity: -0.2,
          ambientIntensity: Number.NaN,
          transitionRange: [0.2, -0.4]
        },
        scattering: {
          intensity: 2,
          horizonRange: [2, -1],
          solarIrradianceScale: -1,
          miePhaseFunctionG: 2,
          groundAlbedo: -1
        },
        sky: {
          stars: {
            intensity: -1,
            pointSize: Number.POSITIVE_INFINITY
          },
          sunAngularRadius: 1,
          moonAngularRadius: -1,
          lunarRadianceScale: -1
        },
        shadow: {
          radius: -1,
          sampleCount: 3.6
        },
        fallbackAmbientLight: {
          intensity: -1
        }
      },
      clouds: {
        coverage: 2,
        speed: -1,
        layer: {
          altitude: Number.NaN,
          height: -1
        }
      },
      postProcess: {
        lensFlare: {
          intensity: -1,
          threshold: {
            level: -2,
            range: Number.NaN
          }
        }
      }
    })

    expect(options.atmosphere.lighting).toMatchObject({
      sunLightIntensity: 0,
      skyLightIntensity: 1,
      albedoScale: 0
    })
    expect(options.atmosphere.night).toMatchObject({
      moonLightIntensity: 0,
      ambientIntensity: 0.08,
      transitionRange: [-0.4, 0.2]
    })
    expect(options.atmosphere.scattering).toMatchObject({
      intensity: 1,
      horizonRange: [0, 1],
      solarIrradianceScale: 0,
      miePhaseFunctionG: 0.99,
      groundAlbedo: 0
    })
    expect(options.atmosphere.sky.stars).toMatchObject({
      show: true,
      intensity: 0,
      pointSize: 1
    })
    expect(options.atmosphere.sky).toMatchObject({
      sunAngularRadius: 0.1,
      moonAngularRadius: 0,
      lunarRadianceScale: 0
    })
    expect(options.atmosphere.shadow).toEqual({
      radius: 0,
      sampleCount: 4
    })
    expect(options.atmosphere.fallbackAmbientLight.intensity).toBe(0)
    expect(options.clouds).toMatchObject({
      coverage: 1,
      speed: 0,
      layer: {
        altitude: 1500,
        height: 0
      },
      look: {
        detail: true,
        turbulence: true,
        haze: true
      },
      shadow: {
        quality: 'medium'
      }
    })
    expect(options.postProcess.lensFlare).toMatchObject({
      enabled: true,
      intensity: 0,
      threshold: {
        level: 0,
        range: 1
      },
      quality: 'medium'
    })
    expect(options.postProcess.smaa).toEqual({ enabled: true })
    expect(options.postProcess.taa).toEqual({ enabled: false })
    expect(options.postProcess.dithering).toEqual({ enabled: false })
  })

  it('accepts boolean shorthand for stars and post-process stages', () => {
    const options = resolveViewerSceneOptions({
      atmosphere: {
        sky: {
          stars: false
        }
      },
      postProcess: {
        lensFlare: false,
        smaa: false,
        taa: true,
        dithering: true
      }
    })

    expect(options.atmosphere.sky.stars.show).toBe(false)
    expect(options.postProcess.lensFlare.enabled).toBe(false)
    expect(options.postProcess.smaa.enabled).toBe(false)
    expect(options.postProcess.taa.enabled).toBe(true)
    expect(options.postProcess.dithering.enabled).toBe(true)
  })

  it('keeps atmosphere getters and adapter state identical after runtime updates', () => {
    const applyAtmosphereState = vi.fn()
    const settings = new AtmosphereSettings(
      resolveViewerSceneOptions(undefined).atmosphere,
      new THREE.AmbientLight(),
      applyAtmosphereState,
      vi.fn(),
      vi.fn()
    )

    settings.lighting.sunLightIntensity = -2
    settings.night.transitionRange = [0.4, -0.2]
    settings.scattering.horizonRange = [2, -1]
    settings.scattering.miePhaseFunctionG = 4
    settings.sky.sunAngularRadius = 2
    settings.shadow.sampleCount = 3.6
    settings.sky.stars.intensity = -1
    settings.sky.stars.pointSize = Number.NaN

    expect(settings.lighting.sunLightIntensity).toBe(0)
    expect(settings.night.transitionRange).toEqual([-0.2, 0.4])
    expect(settings.scattering.horizonRange).toEqual([0, 1])
    expect(settings.scattering.miePhaseFunctionG).toBe(0.99)
    expect(settings.sky.sunAngularRadius).toBe(0.1)
    expect(settings.shadow.sampleCount).toBe(4)
    expect(settings.sky.stars.intensity).toBe(0)
    expect(settings.sky.stars.pointSize).toBe(1)

    const state = applyAtmosphereState.mock.lastCall?.[0]
    expect(state).toMatchObject({
      sunLightIntensity: 0,
      inscatterHorizonRange: [0, 1],
      miePhaseFunctionG: 0.99,
      sunAngularRadius: 0.1,
      shadowSampleCount: 4,
      starsIntensity: 0,
      starsPointSize: 1,
      night: {
        transitionRange: [-0.2, 0.4]
      }
    })
  })

  it('keeps cloud getters and adapter state identical after runtime updates', () => {
    const applyCloudsState = vi.fn()
    const settings = new CloudSettings(
      resolveViewerSceneOptions(undefined).clouds,
      applyCloudsState,
      vi.fn()
    )

    settings.coverage = 2
    settings.speed = -1
    settings.layer.altitude = Number.NaN
    settings.layer.height = -1
    settings.look.detail = false
    settings.shadow.quality = 'high'

    expect(settings.coverage).toBe(1)
    expect(settings.speed).toBe(0)
    expect(settings.layer.altitude).toBe(1500)
    expect(settings.layer.height).toBe(0)
    expect(settings.look.detail).toBe(false)
    expect(settings.shadow.quality).toBe('high')
    expect(applyCloudsState.mock.lastCall?.[0]).toMatchObject({
      coverage: 1,
      speed: 0,
      layer: {
        altitude: 1500,
        height: 0
      },
      look: {
        detail: false,
        turbulence: true,
        haze: true
      },
      shadow: {
        quality: 'high'
      }
    })

    settings.speed = Number.NaN
    expect(settings.speed).toBe(0.001)
    settings.shadow.quality = 'ultra' as typeof settings.shadow.quality
    expect(settings.shadow.quality).toBe('medium')
  })

  it('keeps lens flare getters normalized after runtime updates', () => {
    const onChange = vi.fn()
    const settings = new PostProcessSettings(
      resolveViewerSceneOptions(undefined).postProcess,
      onChange
    )

    settings.lensFlare.intensity = -1
    settings.lensFlare.threshold.level = -2
    settings.lensFlare.threshold.range = Number.NaN
    settings.lensFlare.quality = 'high'

    expect(settings.lensFlare.intensity).toBe(0)
    expect(settings.lensFlare.threshold.level).toBe(0)
    expect(settings.lensFlare.threshold.range).toBe(1)
    expect(settings.lensFlare.quality).toBe('high')
    expect(onChange).toHaveBeenCalled()
  })
})
