import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { PostProcessingManager } from '../rendering/PostProcessingManager'
import { SceneFrameResources } from '../rendering/SceneFrameResources'
import type { ThreeEffectPass, ThreeRendererWithEffects } from '../effects'

describe('pipeline frame boundary', () => {
  it('unwinds effects before rethrowing, restores state, and accepts the next frame', () => {
    const frame = new SceneFrameResources()
    const target = new THREE.WebGLRenderTarget(8, 8, { depthTexture: new THREE.DepthTexture(8, 8) })
    const symbol = { beginFrame: vi.fn(), endFrame: vi.fn(), renderAfterComposite: vi.fn() }
    const entitiesEnd = vi.fn(() => frame.end())
    const renderer = {
      autoClear: true, toneMapping: THREE.AgXToneMapping,
      getRenderTarget: () => null, setRenderTarget: vi.fn(), setEffects: vi.fn(),
    } as unknown as ThreeRendererWithEffects
    const pipeline = Object.assign(Object.create(PostProcessingManager.prototype), {
      frame, renderer, frameFailed: false, guardedEffects: new WeakSet(),
      sceneSubmission: { beginFrame: () => frame.begin(), endFrame: entitiesEnd },
      symbolOcclusionPass: symbol, activeEffects: [],
    }) as PostProcessingManager
    const error = new Error('object callback failed')
    const failed = { setSize() {}, dispose() {}, render: vi.fn(() => { throw error }) } as ThreeEffectPass
    const laterDraw = vi.fn()
    const later = { setSize() {}, dispose() {}, render: laterDraw } as ThreeEffectPass
    // Test the real guard and boundary; no renderer output internals are modified.
    const guard = (pipeline as unknown as { guardEffect(effect: ThreeEffectPass): ThreeEffectPass }).guardEffect.bind(pipeline)
    expect(guard(failed)).toBe(failed)
    guard(later)
    let outputUnwound = false
    expect(() => pipeline.renderFrame(() => {
      frame.publish(target)
      renderer.autoClear = false; renderer.toneMapping = THREE.NoToneMapping
      failed.render(renderer, target, target, 0, false)
      later.render(renderer, target, target, 0, false)
      outputUnwound = true
    })).toThrow(error)
    expect(outputUnwound).toBe(true)
    expect(laterDraw).not.toHaveBeenCalled()
    expect(symbol.renderAfterComposite).not.toHaveBeenCalled()
    expect(symbol.endFrame).toHaveBeenCalledTimes(1)
    expect(renderer.autoClear).toBe(true)
    expect(renderer.toneMapping).toBe(THREE.AgXToneMapping)
    expect(() => frame.require('test')).toThrow('current-frame')
    pipeline.renderFrame(() => {
      frame.publish(target)
      expect(() => pipeline.renderFrame(() => {})).toThrow('nested pipeline')
      expect(frame.require('outer frame').depth).toBe(target.depthTexture)
      later.render(renderer, target, target, 0, false)
    })
    expect(laterDraw).toHaveBeenCalledTimes(1)
    expect(symbol.renderAfterComposite).toHaveBeenCalledTimes(1)
    expect(symbol.renderAfterComposite.mock.calls[0][1].depth).toBe(target.depthTexture)
    expect(entitiesEnd).toHaveBeenCalledTimes(2)
    target.dispose()
  })
})
