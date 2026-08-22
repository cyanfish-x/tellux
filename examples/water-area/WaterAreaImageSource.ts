import { XYZImageSource } from '3d-tiles-renderer/src/three/plugins/images/sources/XYZImageSource.js'
import {
  CanvasTexture,
  RedFormat,
  SRGBColorSpace,
  Texture
} from 'three'

import { queueWaterAreaTileTask } from './worker/pool'

function createSolidTexture(color: string): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 4
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Water-area mask canvas is unavailable.')
  context.fillStyle = color
  context.fillRect(0, 0, canvas.width, canvas.height)

  const texture = new CanvasTexture(canvas)
  texture.format = RedFormat
  texture.generateMipmaps = false
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

export interface WaterAreaImageSourceOptions {
  levels?: number
}

export class WaterAreaImageSource extends XYZImageSource {
  private readonly landTexture = createSolidTexture('#000')
  private readonly waterTexture = createSolidTexture('#fff')
  private disposed = false

  constructor({ levels = 20 }: WaterAreaImageSourceOptions = {}) {
    super({ levels, tileDimension: 128 })
  }

  override async fetchItem(
    tokens: [number, number, number],
    signal: AbortSignal
  ): Promise<Texture> {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    const [x, y, z] = tokens
    const task = queueWaterAreaTileTask({ x, y, z })
    const cancel = (): void => {
      task.cancel()
    }
    signal.addEventListener('abort', cancel, { once: true })

    try {
      const result = await task
      if (result.solid === 'land') return this.landTexture
      if (result.solid === 'water') return this.waterTexture
      if (!result.image) {
        throw new Error(`Water-area worker returned no mask for ${z}/${x}/${y}.`)
      }

      const texture = new Texture(result.image)
      texture.format = RedFormat
      texture.generateMipmaps = false
      texture.colorSpace = SRGBColorSpace
      texture.needsUpdate = true
      return texture
    } finally {
      signal.removeEventListener('abort', cancel)
    }
  }

  override disposeItem(texture: Texture | null): void {
    if (
      !texture ||
      texture === this.landTexture ||
      texture === this.waterTexture
    ) {
      return
    }
    super.disposeItem(texture)
  }

  override dispose(): void {
    if (this.disposed) return
    this.disposed = true
    super.dispose()
    this.landTexture.dispose()
    this.waterTexture.dispose()
  }
}
