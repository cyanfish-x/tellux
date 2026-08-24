import { Object3D, Texture } from 'three'
import { vec2 } from 'three/tsl'
import { describe, expect, it, vi } from 'vitest'

import { WaterAreaOpticsEffect } from './WaterAreaOpticsEffect'
import { createWaterAreaWaveFrame } from './WaterAreaWaveFrame'

describe('WaterAreaOpticsEffect', () => {
  it('keeps environment and reflection runtime state in shared uniforms', () => {
    const effect = new WaterAreaOpticsEffect(
      {
        environment: { enabled: false, intensity: 0.4 },
        reflection: {
          enabled: true,
          intensity: 0.7,
          resolutionScale: 0.25,
          debugView: true
        }
      },
      createWaterAreaWaveFrame(-111.98797078872424, 70.33265443539143)
    )

    expect(effect.environmentWeightNode.value).toBe(0)
    expect(effect.reflectionWeightNode.value).toBeCloseTo(0.7)
    expect(effect.reflectionNode.reflector.resolutionScale).toBe(0.25)
    expect(effect.reflection.debugView).toBe(true)

    effect.assign({
      environment: { enabled: true, intensity: 0.75 },
      reflection: { enabled: false }
    })

    expect(effect.environmentWeightNode.value).toBeCloseTo(0.75)
    expect(effect.reflectionWeightNode.value).toBe(0)
    expect(effect.reflection.intensity).toBeCloseTo(0.7)
    expect(effect.reflection.resolutionScale).toBe(0.25)
    expect(effect.reflection.debugView).toBe(true)

    effect.dispose()
  })

  it('owns and releases the shared sky, reflector, and target resources', () => {
    const effect = new WaterAreaOpticsEffect(
      {},
      createWaterAreaWaveFrame(-112.2525, 69.3782)
    )
    const root = new Object3D()
    root.add(effect.reflectionTarget)
    const disposeEnvironment = vi.spyOn(effect.environmentNode, 'dispose')
    const disposeReflection = vi.spyOn(effect.reflectionNode, 'dispose')

    effect.dispose()
    effect.dispose()

    expect(disposeEnvironment).toHaveBeenCalledOnce()
    expect(disposeReflection).toHaveBeenCalledOnce()
    expect(effect.reflectionTarget.parent).toBeNull()
  })

  it('keeps reflection capture active while the canvas debug view is shown', () => {
    const effect = new WaterAreaOpticsEffect(
      { reflection: { enabled: false } },
      createWaterAreaWaveFrame(-112.2525, 69.3782)
    )
    const preview = {
      setVisible: vi.fn(),
      capture: vi.fn(),
      dispose: vi.fn()
    }

    effect.setReflectionDebugPreview(preview)

    effect.setEffectVisible(false)
    expect(effect.reflectionCaptureEnabled).toBe(false)
    expect(effect.reflection.debugView).toBe(false)
    expect(preview.setVisible).toHaveBeenLastCalledWith(false)

    effect.reflection.debugView = true

    expect(effect.reflectionCaptureEnabled).toBe(true)
    expect(effect.reflection.debugView).toBe(true)
    expect(preview.setVisible).toHaveBeenLastCalledWith(true)
    expect(effect.reflectionNode.reflector.forceUpdate).toBe(true)

    effect.dispose()
    expect(preview.dispose).toHaveBeenCalledOnce()
  })

  it('keeps sampled reflection nodes bound to the latest render-target texture', () => {
    const effect = new WaterAreaOpticsEffect(
      {},
      createWaterAreaWaveFrame(-112.2525, 69.3782)
    )
    const sampler = effect.sampleReflection(vec2(0))
    const renderTargetTexture = new Texture()

    effect.reflectionNode.value = renderTargetTexture
    effect.syncReflectionTexture()

    expect(sampler.value).toBe(renderTargetTexture)
    expect('reflector' in sampler).toBe(true)
    expect((sampler as typeof effect.reflectionNode).reflector).toBe(
      effect.reflectionNode.reflector
    )

    effect.dispose()
  })
})
