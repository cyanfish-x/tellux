declare module '3d-tiles-renderer/src/three/plugins/images/sources/XYZImageSource.js' {
  import type { Texture } from 'three'

  export class XYZImageSource {
    constructor(options?: {
      levels?: number
      tileDimension?: number
      projection?: string
      url?: string | null
    })

    fetchItem(
      tokens: [number, number, number],
      signal: AbortSignal
    ): Promise<Texture>
    disposeItem(texture: Texture | null): void
    dispose(): void
  }
}
