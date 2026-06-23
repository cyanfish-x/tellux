import * as THREE from 'three'
import { STBNLoader } from '@takram/three-geospatial'

type TextureApplyCallback<T extends THREE.Texture> = (texture: T) => void

export class AtmosphereTextureLoader {
  private readonly loadedTextures: THREE.Texture[] = []
  private readonly abortController = new AbortController()
  private isDisposed = false

  loadCloudTexture(url: string, applyTexture: TextureApplyCallback<THREE.Texture>) {
    const loader = new THREE.TextureLoader()
    loader.load(
      url,
      (texture) => {
        if (this.isDisposed) {
          texture.dispose()
          return
        }

        texture.minFilter = THREE.LinearMipMapLinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.colorSpace = THREE.NoColorSpace
        texture.needsUpdate = true
        this.loadedTextures.push(texture)
        applyTexture(texture)
      },
      undefined,
      (error) => {
        this.warnLoadFailure(url, error)
      }
    )
  }

  async loadData3DTexture(url: string, size: number, applyTexture: TextureApplyCallback<THREE.Data3DTexture>) {
    try {
      const response = await fetch(url, { signal: this.abortController.signal })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }

      const buffer = await response.arrayBuffer()
      if (this.isDisposed) return

      const texture = new THREE.Data3DTexture(new Uint8Array(buffer), size, size, size)
      texture.format = THREE.RedFormat
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.RepeatWrapping
      texture.wrapR = THREE.RepeatWrapping
      texture.colorSpace = THREE.NoColorSpace
      texture.needsUpdate = true
      this.loadedTextures.push(texture)
      applyTexture(texture)
    } catch (error) {
      if (this.isAbortError(error)) return
      this.warnLoadFailure(url, error)
    }
  }

  loadSTBNTexture(url: string, applyTexture: TextureApplyCallback<THREE.Data3DTexture>) {
    new STBNLoader().load(
      url,
      (texture) => {
        if (this.isDisposed) {
          texture.dispose()
          return
        }

        this.loadedTextures.push(texture)
        applyTexture(texture)
      },
      undefined,
      (error) => {
        this.warnLoadFailure(url, error)
      }
    )
  }

  async loadBuffer(url: string, applyBuffer: (buffer: ArrayBuffer) => void) {
    try {
      const response = await fetch(url, { signal: this.abortController.signal })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }

      const buffer = await response.arrayBuffer()
      if (this.isDisposed) return

      applyBuffer(buffer)
    } catch (error) {
      if (this.isAbortError(error)) return
      this.warnLoadFailure(url, error)
    }
  }

  warnLoadFailure(label: string, error: unknown) {
    if (this.isDisposed) return

    console.warn(`Tellux atmosphere texture load failed: ${label}`, error)
  }

  dispose() {
    if (this.isDisposed) return

    this.isDisposed = true
    this.abortController.abort()
    this.loadedTextures.forEach((texture) => texture.dispose())
    this.loadedTextures.length = 0
  }

  private isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === 'AbortError'
  }
}
