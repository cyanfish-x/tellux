import * as THREE from 'three'
import {
  CLOUD_SHAPE_DETAIL_TEXTURE_SIZE,
  CLOUD_SHAPE_TEXTURE_SIZE,
  CloudsEffect,
  type CloudsEffectChangeEvent,
  DEFAULT_LOCAL_WEATHER_URL,
  DEFAULT_SHAPE_DETAIL_URL,
  DEFAULT_SHAPE_URL,
  DEFAULT_TURBULENCE_URL
} from '@takram/three-clouds'
import { AerialPerspectiveEffect, PrecomputedTexturesGenerator, getSunDirectionECEF } from '@takram/three-atmosphere'
import { DEFAULT_STBN_URL, STBNLoader } from '@takram/three-geospatial'
import { getTelluxAssetUrl } from '../config'

type TextureApplyCallback<T extends THREE.Texture> = (texture: T) => void

const CLOUD_COMPOSITION_PROPERTIES = new Set(['atmosphereOverlay', 'atmosphereShadow', 'atmosphereShadowLength'])

export class AtmosphereManager {
  readonly sunLight = new THREE.DirectionalLight(0xffffff, 3)
  readonly skyLight = new THREE.HemisphereLight(0xffffff, 0x1f2937, 0.8)
  readonly aerialPerspectiveEffect: AerialPerspectiveEffect
  readonly cloudsEffect: CloudsEffect

  private readonly loadedTextures: THREE.Texture[] = []
  private readonly texturesGenerator: PrecomputedTexturesGenerator
  private readonly textureAbortController = new AbortController()
  private isDisposed = false

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly onCompositionChange: () => void
  ) {
    this.aerialPerspectiveEffect = new AerialPerspectiveEffect(this.camera)
    this.aerialPerspectiveEffect.sky = true
    this.aerialPerspectiveEffect.sunLight = true
    this.aerialPerspectiveEffect.skyLight = true

    this.cloudsEffect = new CloudsEffect(this.camera)
    this.cloudsEffect.localWeatherVelocity.set(0.001, 0)
    this.cloudsEffect.shadow.farScale = 0.25
    this.cloudsEffect.shadow.maxFar = 1e5
    this.cloudsEffect.shadow.cascadeCount = 2
    this.cloudsEffect.shadow.mapSize.set(512, 512)
    this.cloudsEffect.shadow.splitMode = 'practical'
    this.cloudsEffect.shadow.splitLambda = 0.71
    this.cloudsEffect.events.addEventListener('change', this.handleCloudsChange)

    this.texturesGenerator = new PrecomputedTexturesGenerator(renderer)
  }

  addLightsTo(scene: THREE.Scene) {
    scene.add(this.sunLight, this.skyLight)
  }

  syncCloudAtmosphereComposition(cloudsVisible: boolean, atmosphereVisible: boolean) {
    if (!cloudsVisible || !atmosphereVisible) {
      this.aerialPerspectiveEffect.overlay = null
      this.aerialPerspectiveEffect.shadow = null
      this.aerialPerspectiveEffect.shadowLength = null
      return
    }

    this.aerialPerspectiveEffect.overlay = this.cloudsEffect.atmosphereOverlay
    this.aerialPerspectiveEffect.shadow = this.cloudsEffect.atmosphereShadow
    this.aerialPerspectiveEffect.shadowLength = this.cloudsEffect.atmosphereShadowLength
  }

  updateSunDirection(currentTime: Date) {
    const sunDirection = new THREE.Vector3()
    getSunDirectionECEF(currentTime, sunDirection)
    this.aerialPerspectiveEffect.sunDirection.copy(sunDirection)
    this.cloudsEffect.sunDirection.copy(sunDirection)
    this.sunLight.position.copy(sunDirection).multiplyScalar(10000000)
  }

  async loadTextures() {
    try {
      const textures = await this.texturesGenerator.update()
      if (this.isDisposed) return

      Object.assign(this.aerialPerspectiveEffect, textures)
      Object.assign(this.cloudsEffect, textures)

      this.loadCloudTexture(getTelluxAssetUrl(DEFAULT_LOCAL_WEATHER_URL), (texture) => {
        this.cloudsEffect.localWeatherTexture = texture
      })
      this.loadCloudTexture(getTelluxAssetUrl(DEFAULT_TURBULENCE_URL), (texture) => {
        this.cloudsEffect.turbulenceTexture = texture
      })
      this.loadData3DTexture(getTelluxAssetUrl(DEFAULT_SHAPE_URL), CLOUD_SHAPE_TEXTURE_SIZE, (texture) => {
        this.cloudsEffect.shapeTexture = texture
      })
      this.loadData3DTexture(getTelluxAssetUrl(DEFAULT_SHAPE_DETAIL_URL), CLOUD_SHAPE_DETAIL_TEXTURE_SIZE, (texture) => {
        this.cloudsEffect.shapeDetailTexture = texture
      })
      this.loadSTBNTexture(getTelluxAssetUrl(DEFAULT_STBN_URL))
    } catch (error) {
      this.warnTextureLoadFailure('precomputed atmosphere textures', error)
    }
  }

  dispose() {
    if (this.isDisposed) return

    this.isDisposed = true
    this.textureAbortController.abort()
    this.cloudsEffect.events.removeEventListener('change', this.handleCloudsChange)
    this.texturesGenerator.dispose({ textures: true })
    this.loadedTextures.forEach((texture) => texture.dispose())
  }

  private readonly handleCloudsChange = (event: CloudsEffectChangeEvent) => {
    if (event.property && CLOUD_COMPOSITION_PROPERTIES.has(event.property)) {
      this.onCompositionChange()
    }
  }

  private loadCloudTexture(url: string, applyTexture: TextureApplyCallback<THREE.Texture>) {
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
        this.warnTextureLoadFailure(url, error)
      }
    )
  }

  private async loadData3DTexture(url: string, size: number, applyTexture: TextureApplyCallback<THREE.Data3DTexture>) {
    try {
      const response = await fetch(url, { signal: this.textureAbortController.signal })
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
      this.warnTextureLoadFailure(url, error)
    }
  }

  private loadSTBNTexture(url: string) {
    new STBNLoader().load(
      url,
      (texture) => {
        if (this.isDisposed) {
          texture.dispose()
          return
        }

        this.loadedTextures.push(texture)
        this.cloudsEffect.stbnTexture = texture
        this.aerialPerspectiveEffect.stbnTexture = texture
      },
      undefined,
      (error) => {
        this.warnTextureLoadFailure(url, error)
      }
    )
  }

  private isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === 'AbortError'
  }

  private warnTextureLoadFailure(label: string, error: unknown) {
    if (this.isDisposed) return

    console.warn(`Tellux atmosphere texture load failed: ${label}`, error)
  }
}
