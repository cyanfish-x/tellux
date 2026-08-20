import * as THREE from 'three'
import type { TerrainFieldRevision } from './terrainFieldMessages'

export class TerrainFieldTextures {
  readonly height: THREE.DataTexture
  readonly landMask: THREE.DataTexture
  readonly shoreSdf: THREE.DataTexture
  readonly bedHeight: THREE.DataTexture
  readonly validity: THREE.DataTexture
  revision = 0

  constructor(readonly width: number, readonly fieldHeight: number) {
    const count = width * fieldHeight
    this.height = createFloatTexture(new Float32Array(count), width, fieldHeight)
    this.landMask = createByteTexture(new Uint8Array(count), width, fieldHeight)
    this.shoreSdf = createFloatTexture(new Float32Array(count), width, fieldHeight)
    this.bedHeight = createFloatTexture(new Float32Array(count), width, fieldHeight)
    this.validity = createByteTexture(new Uint8Array(count), width, fieldHeight)
  }

  update(field: TerrainFieldRevision) {
    if (field.width !== this.width || field.height !== this.fieldHeight) {
      throw new Error('Terrain field dimensions do not match its GPU textures.')
    }
    replaceTextureData(this.height, field.heights)
    replaceTextureData(this.landMask, expandMask(field.landMask))
    replaceTextureData(this.shoreSdf, field.shoreSdf)
    replaceTextureData(this.bedHeight, field.bedHeight)
    replaceTextureData(this.validity, expandMask(field.validity))
    this.revision = field.revision
  }

  dispose() {
    this.height.dispose()
    this.landMask.dispose()
    this.shoreSdf.dispose()
    this.bedHeight.dispose()
    this.validity.dispose()
  }
}

function createFloatTexture(data: Float32Array, width: number, height: number) {
  const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.FloatType)
  configure(texture, THREE.LinearFilter)
  return texture
}

function createByteTexture(data: Uint8Array, width: number, height: number) {
  const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.UnsignedByteType)
  configure(texture, THREE.NearestFilter)
  return texture
}

function configure(
  texture: THREE.DataTexture,
  filter: typeof THREE.NearestFilter | typeof THREE.LinearFilter
) {
  texture.colorSpace = THREE.NoColorSpace
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = texture.magFilter = filter
  texture.generateMipmaps = false
  texture.needsUpdate = true
}

function replaceTextureData(
  texture: THREE.DataTexture,
  data: Float32Array | Uint8Array | Uint16Array
) {
  texture.image.data = data
  texture.needsUpdate = true
}

function expandMask(source: Uint8Array) {
  const result = new Uint8Array(source.length)
  for (let index = 0; index < source.length; index += 1) {
    result[index] = source[index] > 0 ? 255 : 0
  }
  return result
}
