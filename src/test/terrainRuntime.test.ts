import { describe, expect, it, vi } from 'vitest'

import { TerrainRuntime } from '../tiles/TerrainRuntime'

describe('TerrainRuntime', () => {
  it('exposes current options and delegates terrain changes', () => {
    const current = { url: 'https://example.com/terrain/' } as const
    const setTerrain = vi.fn()
    const runtime = new TerrainRuntime({
      lifecycle: {
        observeTiles: vi.fn(),
        addMaterialDecorator: vi.fn()
      } as never,
      getOptions: () => current,
      setTerrain
    })

    expect(runtime.options).toBe(current)
    runtime.set({ type: 'url', url: 'https://example.com/next/' })
    runtime.set()

    expect(setTerrain).toHaveBeenNthCalledWith(1, {
      type: 'url',
      url: 'https://example.com/next/'
    })
    expect(setTerrain).toHaveBeenNthCalledWith(2, null)
  })

  it('delegates observers and material decorators to the lifecycle manager', () => {
    const unsubscribe = vi.fn()
    const removeDecorator = vi.fn()
    const lifecycle = {
      observeTiles: vi.fn(() => unsubscribe),
      addMaterialDecorator: vi.fn(() => removeDecorator)
    }
    const runtime = new TerrainRuntime({
      lifecycle: lifecycle as never,
      getOptions: () => undefined,
      setTerrain: vi.fn()
    })
    const listener = vi.fn()
    const decorator = vi.fn()

    expect(runtime.observeTiles(listener, { replay: false })).toBe(unsubscribe)
    expect(runtime.addMaterialDecorator(decorator)).toBe(removeDecorator)
    expect(lifecycle.observeTiles).toHaveBeenCalledWith(listener, { replay: false })
    expect(lifecycle.addMaterialDecorator).toHaveBeenCalledWith(decorator)
  })
})
