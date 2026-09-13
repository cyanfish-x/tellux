import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { SceneFrameResources } from '../rendering/SceneFrameResources'
import { EffectPassAdapter } from '../effects'
import type { EffectPass } from 'postprocessing'

describe('scene frame resources', () => {
  it('rejects unpublished, ended and resized resources without disposing borrowed depth', () => {
    const frame = new SceneFrameResources()
    const target = new THREE.WebGLRenderTarget(16, 8, { depthTexture: new THREE.DepthTexture(16, 8) })
    const disposed = vi.spyOn(target.depthTexture!, 'dispose')
    expect(() => frame.publish(target)).toThrow('active frame')
    frame.begin()
    expect(() => frame.require('EDL')).toThrow('EDL requires valid current-frame')
    frame.publish(target)
    expect(frame.require('EDL')).toMatchObject({ target, depth: target.depthTexture, width: 16, height: 8 })
    target.width = 32
    expect(() => frame.require('EDL')).toThrow('current-frame')
    frame.end()
    expect(disposed).not.toHaveBeenCalled()
    expect(() => frame.require('EDL')).toThrow('current-frame')
    frame.begin()
    expect(() => frame.require('EDL')).toThrow('current-frame')
    frame.end()
    target.dispose()
  })

  it('keeps Viewer resources independent and rejects nested frames', () => {
    const a = new SceneFrameResources(), b = new SceneFrameResources()
    const target = new THREE.WebGLRenderTarget(8, 8, { depthTexture: new THREE.DepthTexture(8, 8) })
    a.begin(); b.begin(); a.publish(target)
    expect(() => a.begin()).toThrow('already active')
    expect(() => b.require('symbol')).toThrow('current-frame')
    b.end()
    expect(a.require('symbol').depth).toBe(target.depthTexture)
    a.end(); target.dispose()
  })

  it('binds explicit depth through swapped color buffers and unbinds after a failed effect', () => {
    const frame = new SceneFrameResources()
    const target = new THREE.WebGLRenderTarget(8, 8, { depthTexture: new THREE.DepthTexture(8, 8) })
    const color = new THREE.WebGLRenderTarget(8, 8)
    const otherDepth = color.depthTexture = new THREE.DepthTexture(8, 8)
    const setDepthTexture = vi.fn()
    const pass = {
      needsSwap: true, initialize: vi.fn(), setSize: vi.fn(), setDepthTexture,
      render: vi.fn(() => {
        expect(setDepthTexture).toHaveBeenLastCalledWith(target.depthTexture)
        throw new Error('effect failed')
      }),
    } as unknown as EffectPass
    const adapter = new EffectPassAdapter(pass, () => new THREE.PerspectiveCamera(), frame)
    const renderer = { autoClear: true } as THREE.WebGLRenderer
    frame.begin(); frame.publish(target)
    expect(() => adapter.render(renderer, target, color)).toThrow('effect failed')
    expect(setDepthTexture).not.toHaveBeenCalledWith(otherDepth)
    expect(setDepthTexture).toHaveBeenLastCalledWith(null)
    expect(renderer.autoClear).toBe(true)
    frame.end()
    expect(() => adapter.render(renderer, target, color)).toThrow('current-frame')
    target.dispose(); color.dispose()
  })
})
