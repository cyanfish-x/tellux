import { expect, it, vi } from 'vitest'
import { ImageOverlayPlugin } from '3d-tiles-renderer/plugins'
import { WaterAreaOverlayPlugin } from './WaterAreaOverlayPlugin'

it('leaves terrain-owned virtual children intact when water tile splitting is disabled', () => {
  const prototype = ImageOverlayPlugin.prototype as unknown as {
    _removeVirtualChildren(tile: unknown): void
  }
  const remove = vi.spyOn(prototype, '_removeVirtualChildren').mockImplementation(() => {})
  try {
    const tile = {}
    new WaterAreaOverlayPlugin({ overlays: [], enableTileSplitting: false })._removeVirtualChildren(tile)
    expect(remove).not.toHaveBeenCalled()
    new WaterAreaOverlayPlugin({ overlays: [], enableTileSplitting: true })._removeVirtualChildren(tile)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith(tile)
  } finally {
    remove.mockRestore()
  }
})
