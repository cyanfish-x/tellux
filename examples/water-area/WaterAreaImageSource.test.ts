import { afterEach, describe, expect, it, vi } from 'vitest'
import { Texture } from 'three'
import { WaterAreaImageSource } from './WaterAreaImageSource'

afterEach(() => vi.unstubAllGlobals())

describe('WaterAreaImageSource disposal', () => {
  it('allows delayed region releases after force disposal without hiding live accounting errors', async () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, fillStyle: '' }) }) })
    const source = new WaterAreaImageSource()
    const texture = new Texture()
    const disposed = vi.fn()
    texture.addEventListener('dispose', disposed)
    let resolve!: (texture: Texture) => void
    vi.spyOn(source, 'fetchItem').mockImplementation(() => new Promise<Texture>(done => { resolve = done }))
    expect(() => source.release(1, 2, 3)).toThrow('does not exist')
    const pending = source.lock(1, 2, 3)
    source.dispose()
    resolve(texture)
    await pending
    await Promise.resolve()
    expect(() => source.release(1, 2, 3)).not.toThrow()
    expect(disposed).toHaveBeenCalledOnce()
    source.dispose()
    expect(disposed).toHaveBeenCalledOnce()
  })
})
