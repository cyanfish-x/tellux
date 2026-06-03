import * as THREE from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { TilesRenderer, GlobeControls } from '3d-tiles-renderer'
import { CesiumIonAuthPlugin, GLTFExtensionsPlugin, TilesFadePlugin, UpdateOnChangePlugin } from '3d-tiles-renderer/plugins'
import { EffectMaterial, EffectPass, NormalPass, SMAAEffect } from 'postprocessing'
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
import { DitheringEffect, LensFlareEffect } from '@takram/three-geospatial-effects'

type ThreeEffectPass = THREE.Effect & {
  dispose: () => void
}

interface TileModelPlugin {
  processTileModel: (scene: THREE.Object3D) => void
}

interface ThreeRendererWithEffects extends THREE.WebGLRenderer {
  setEffects: (effects: THREE.Effect[] | null) => void
}

export interface GISViewerOptions {
  imageryProvider?: CesiumIonResourceOptions
  camera?: {
    latitude?: number
    longitude?: number
    height?: number
    heading?: number
    pitch?: number
    roll?: number
    fov?: number
    near?: number
    far?: number
  }
  scene?: {
    clouds?: boolean
    skyAtmosphere?: boolean
    lensFlare?: boolean
    smaa?: boolean
    dithering?: boolean
    toneMappingExposure?: number
    cloudCoverage?: number
  }
  useDefaultRenderLoop?: boolean
  resolutionScale?: number
  dracoDecoderPath?: string
}

export interface CesiumIonResourceOptions {
  apiToken: string
  assetId: string | number
  autoRefreshToken?: boolean
}

const DEG2RAD = Math.PI / 180
const CAMERA_FRAME = 1
const DEFAULT_CAMERA = {
  latitude: 35.6812,
  longitude: 139.8,
  height: 500,
  heading: -90,
  pitch: -10,
  roll: 0,
  fov: 75,
  near: 10,
  far: 1e6
}

class TileCreasedNormalsPlugin implements TileModelPlugin {
  processTileModel(tileScene: THREE.Object3D) {
    tileScene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.geometry) return

      mesh.geometry = toCreasedNormals(mesh.geometry, 30 * DEG2RAD)
    })
  }
}

class EffectPassAdapter implements ThreeEffectPass {
  enabled = true
  needsSwap: boolean
  private isInitialized = false

  constructor(
    private readonly pass: EffectPass | NormalPass,
    private readonly getCamera: () => THREE.PerspectiveCamera
  ) {
    this.needsSwap = this.pass.needsSwap !== false
  }

  render(
    webglRenderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number
  ) {
    if (!this.isInitialized) {
      this.pass.initialize(webglRenderer, false, THREE.HalfFloatType)
      this.pass.setSize(readBuffer.width, readBuffer.height)

      const passWithDepth = this.pass as EffectPass & {
        setDepthTexture?: (texture: THREE.Texture) => void
      }
      if (readBuffer.depthTexture && passWithDepth.setDepthTexture) {
        passWithDepth.setDepthTexture(readBuffer.depthTexture)
      }

      this.isInitialized = true
    }

    const passWithMaterial = this.pass as EffectPass & {
      fullscreenMaterial?: EffectMaterial
    }
    if (passWithMaterial.fullscreenMaterial instanceof EffectMaterial) {
      passWithMaterial.fullscreenMaterial.adoptCameraSettings(this.getCamera())
    }

    this.pass.render(webglRenderer, readBuffer, writeBuffer, deltaTime)
  }

  setSize(width: number, height: number) {
    if (this.isInitialized) {
      this.pass.setSize(width, height)
    }
  }

  dispose() {
    this.pass.dispose()
  }
}

export class Clock {
  private currentHourUTC = 0
  private readonly onChange: () => void

  constructor(onChange: () => void) {
    this.onChange = onChange
  }

  get hourUTC() {
    return this.currentHourUTC
  }

  set hourUTC(value: number) {
    this.setHourUTC(value)
  }

  setHourUTC(value: number) {
    this.currentHourUTC = value
    this.onChange()
  }

  get currentTime() {
    return new Date(Date.UTC(2024, 2, 1) + this.currentHourUTC * 3600000)
  }
}

export class CesiumIonResource {
  static fromAssetId(assetId: string | number, options: Omit<CesiumIonResourceOptions, 'assetId'>): CesiumIonResourceOptions {
    return {
      assetId,
      ...options
    }
  }
}

class SceneToggle {
  private isShown: boolean
  private readonly onChange: () => void

  constructor(isShown: boolean, onChange: () => void) {
    this.isShown = isShown
    this.onChange = onChange
  }

  get show() {
    return this.isShown
  }

  set show(value: boolean) {
    if (this.isShown === value) return
    this.isShown = value
    this.onChange()
  }
}

class PostProcessStage {
  private isEnabled: boolean
  private readonly onChange: () => void

  constructor(isEnabled: boolean, onChange: () => void) {
    this.isEnabled = isEnabled
    this.onChange = onChange
  }

  get enabled() {
    return this.isEnabled
  }

  set enabled(value: boolean) {
    if (this.isEnabled === value) return
    this.isEnabled = value
    this.onChange()
  }
}

class GISPostProcessStages {
  lensFlare: PostProcessStage
  smaa: PostProcessStage
  dithering: PostProcessStage

  constructor(options: Required<NonNullable<GISViewerOptions['scene']>>, onChange: () => void) {
    this.lensFlare = new PostProcessStage(options.lensFlare, onChange)
    this.smaa = new PostProcessStage(options.smaa, onChange)
    this.dithering = new PostProcessStage(options.dithering, onChange)
  }
}

export class GISScene {
  readonly threeScene = new THREE.Scene()
  clouds: SceneToggle
  skyAtmosphere: SceneToggle
  postProcessStages: GISPostProcessStages
  private currentCloudCoverage: number
  private readonly getCloudsEffect: () => CloudsEffect | null

  constructor(
    options: Required<NonNullable<GISViewerOptions['scene']>>,
    getCloudsEffect: () => CloudsEffect | null,
    onEffectsChange: () => void
  ) {
    this.currentCloudCoverage = options.cloudCoverage
    this.getCloudsEffect = getCloudsEffect
    this.clouds = new SceneToggle(options.clouds, onEffectsChange)
    this.skyAtmosphere = new SceneToggle(options.skyAtmosphere, onEffectsChange)
    this.postProcessStages = new GISPostProcessStages(options, onEffectsChange)
  }

  get cloudCoverage() {
    return this.currentCloudCoverage
  }

  set cloudCoverage(value: number) {
    this.currentCloudCoverage = value
    const clouds = this.getCloudsEffect()
    if (clouds) clouds.coverage = value
  }
}

export class Camera {
  readonly threeCamera: THREE.PerspectiveCamera

  constructor(camera: THREE.PerspectiveCamera) {
    this.threeCamera = camera
  }

  flyTo(options: {
    destination: {
      latitude: number
      longitude: number
      height?: number
    }
    orientation?: {
      heading?: number
      pitch?: number
      roll?: number
    }
    duration?: number
  }) {
    const { destination, orientation } = options
    this.setView({
      latitude: destination.latitude,
      longitude: destination.longitude,
      height: destination.height,
      heading: orientation?.heading,
      pitch: orientation?.pitch,
      roll: orientation?.roll
    })
  }

  setView(options: {
    latitude: number
    longitude: number
    height?: number
    heading?: number
    pitch?: number
    roll?: number
  }) {
    const ellipsoid = (this.threeCamera.userData.tilesRenderer as TilesRenderer | undefined)?.ellipsoid
    if (!ellipsoid) return

    ellipsoid.getObjectFrame(
      options.latitude * DEG2RAD,
      options.longitude * DEG2RAD,
      options.height ?? DEFAULT_CAMERA.height,
      (options.heading ?? DEFAULT_CAMERA.heading) * DEG2RAD,
      (options.pitch ?? DEFAULT_CAMERA.pitch) * DEG2RAD,
      (options.roll ?? DEFAULT_CAMERA.roll) * DEG2RAD,
      this.threeCamera.matrix,
      CAMERA_FRAME
    )
    this.threeCamera.matrix.decompose(this.threeCamera.position, this.threeCamera.quaternion, this.threeCamera.scale)
  }
}

export class GISViewer {
  readonly container: HTMLElement
  readonly scene: GISScene
  readonly camera: Camera
  readonly renderer: ThreeRendererWithEffects
  readonly clock: Clock
  readonly tileset: TilesRenderer
  readonly controls: GlobeControls

  private readonly threeCamera: THREE.PerspectiveCamera
  private readonly dracoLoader: DRACOLoader
  private readonly effectAdapters: ThreeEffectPass[] = []
  private readonly loadedTextures: THREE.Texture[] = []
  private readonly rendererSize = new THREE.Vector2()
  private readonly resizeObserver: ResizeObserver
  private readonly texturesGenerator: PrecomputedTexturesGenerator
  private readonly handleWindowResize = () => {
    this.resize()
  }
  private readonly enableAdjustHeight = () => {
    this.controls.adjustHeight = true
    this.renderer.domElement.removeEventListener('pointerdown', this.enableAdjustHeight)
    this.renderer.domElement.removeEventListener('wheel', this.enableAdjustHeight)
  }
  private readonly handleCloudsChange = (event: CloudsEffectChangeEvent) => {
    if (event.property === 'atmosphereOverlay') this.syncCloudAtmosphereComposition()
    if (event.property === 'atmosphereShadow') this.syncCloudAtmosphereComposition()
    if (event.property === 'atmosphereShadowLength') this.syncCloudAtmosphereComposition()
  }

  private cloudsEffect: CloudsEffect | null = null
  private aerialPerspectiveEffect: AerialPerspectiveEffect | null = null
  private normalAdapter: ThreeEffectPass | null = null
  private cloudAtmosphereAdapter: ThreeEffectPass | null = null
  private atmosphereAdapter: ThreeEffectPass | null = null
  private lensFlareAdapter: ThreeEffectPass | null = null
  private smaaAdapter: ThreeEffectPass | null = null
  private ditheringAdapter: ThreeEffectPass | null = null
  private previousTime = 0
  private isDestroyed = false
  private isUsingDefaultRenderLoop = false
  private currentResolutionScale: number
  private currentToneMappingExposure: number

  constructor(container: HTMLElement, options: GISViewerOptions = {}) {
    this.container = container
    this.currentResolutionScale = options.resolutionScale ?? Math.min(window.devicePixelRatio, 2)
    const sceneOptions = this.resolveSceneOptions(options.scene)
    this.currentToneMappingExposure = sceneOptions.toneMappingExposure

    const width = container.clientWidth
    const height = container.clientHeight
    const cameraOptions = {
      ...DEFAULT_CAMERA,
      ...options.camera
    }

    this.threeCamera = new THREE.PerspectiveCamera(cameraOptions.fov, width / height, cameraOptions.near, cameraOptions.far)
    this.camera = new Camera(this.threeCamera)
    this.scene = new GISScene(
      sceneOptions,
      () => this.cloudsEffect,
      () => this.applyPostProcessingEffects()
    )
    this.clock = new Clock(() => this.updateSunDirection())

    this.renderer = new THREE.WebGLRenderer({ outputBufferType: THREE.HalfFloatType }) as ThreeRendererWithEffects
    this.renderer.setPixelRatio(this.currentResolutionScale)
    this.renderer.setSize(width, height)
    this.renderer.toneMapping = THREE.AgXToneMapping
    this.renderer.toneMappingExposure = this.currentToneMappingExposure
    container.appendChild(this.renderer.domElement)

    this.dracoLoader = new DRACOLoader()
    this.dracoLoader.setDecoderPath(options.dracoDecoderPath ?? '/draco/gltf/')

    this.tileset = new TilesRenderer()
    this.tileset.registerPlugin(
      new CesiumIonAuthPlugin({
        apiToken: options.imageryProvider?.apiToken ?? '',
        assetId: String(options.imageryProvider?.assetId ?? '2275207'),
        autoRefreshToken: options.imageryProvider?.autoRefreshToken ?? true
      })
    )
    this.tileset.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: this.dracoLoader }))
    this.tileset.registerPlugin(new TileCreasedNormalsPlugin())
    this.tileset.registerPlugin(new TilesFadePlugin())
    this.tileset.registerPlugin(new UpdateOnChangePlugin())
    this.tileset.setCamera(this.threeCamera)
    this.tileset.setResolutionFromRenderer(this.threeCamera, this.renderer)
    this.scene.threeScene.add(this.tileset.group)
    this.threeCamera.userData.tilesRenderer = this.tileset
    this.camera.setView(cameraOptions)

    this.controls = new GlobeControls(this.scene.threeScene, this.threeCamera, this.renderer.domElement)
    this.controls.setEllipsoid(this.tileset.ellipsoid, this.tileset.group)
    this.controls.enableDamping = true
    this.controls.adjustHeight = false
    this.renderer.domElement.addEventListener('pointerdown', this.enableAdjustHeight)
    this.renderer.domElement.addEventListener('wheel', this.enableAdjustHeight)

    this.initAtmosphere()
    this.initPostProcessing()
    this.applyPostProcessingEffects()
    this.texturesGenerator = new PrecomputedTexturesGenerator(this.renderer)
    this.loadAtmosphereTextures()

    this.resizeObserver = new ResizeObserver(() => {
      this.resize()
    })
    this.resizeObserver.observe(this.container)
    window.addEventListener('resize', this.handleWindowResize)
    this.resize()

    if (options.useDefaultRenderLoop !== false) {
      this.useDefaultRenderLoop = true
    }
  }

  get useDefaultRenderLoop() {
    return this.isUsingDefaultRenderLoop
  }

  set useDefaultRenderLoop(value: boolean) {
    this.isUsingDefaultRenderLoop = value
    this.renderer.setAnimationLoop(value ? (time) => this.render(time) : null)
  }

  get resolutionScale() {
    return this.currentResolutionScale
  }

  set resolutionScale(value: number) {
    this.currentResolutionScale = value
    this.renderer.setPixelRatio(value)
    this.resize()
  }

  get toneMappingExposure() {
    return this.currentToneMappingExposure
  }

  set toneMappingExposure(value: number) {
    this.currentToneMappingExposure = value
    this.renderer.toneMappingExposure = value
  }

  render(time = performance.now()) {
    const deltaTime = (time - this.previousTime) / 1000
    this.previousTime = time

    this.resize()
    this.controls.update()
    this.tileset.update()
    this.renderer.render(this.scene.threeScene, this.threeCamera)
    return deltaTime
  }

  resize() {
    const { clientWidth, clientHeight } = this.container
    if (!clientWidth || !clientHeight) return

    this.renderer.getSize(this.rendererSize)
    if (this.rendererSize.width === clientWidth && this.rendererSize.height === clientHeight) return

    this.threeCamera.aspect = clientWidth / clientHeight
    this.threeCamera.updateProjectionMatrix()
    this.renderer.setSize(clientWidth, clientHeight)
    this.tileset.setResolutionFromRenderer(this.threeCamera, this.renderer)
  }

  destroy() {
    this.isDestroyed = true
    this.useDefaultRenderLoop = false
    window.removeEventListener('resize', this.handleWindowResize)
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('pointerdown', this.enableAdjustHeight)
    this.renderer.domElement.removeEventListener('wheel', this.enableAdjustHeight)
    this.renderer.setEffects(null)
    this.cloudsEffect?.events.removeEventListener('change', this.handleCloudsChange)

    this.effectAdapters.forEach((adapter) => adapter.dispose())
    this.texturesGenerator.dispose({ textures: true })
    this.loadedTextures.forEach((texture) => texture.dispose())
    this.tileset.dispose()
    this.controls.dispose()
    this.dracoLoader.dispose()
    this.renderer.dispose()

    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement)
    }
  }

  private resolveSceneOptions(options: GISViewerOptions['scene']): Required<NonNullable<GISViewerOptions['scene']>> {
    return {
      clouds: options?.clouds ?? true,
      skyAtmosphere: options?.skyAtmosphere ?? true,
      lensFlare: options?.lensFlare ?? true,
      smaa: options?.smaa ?? true,
      dithering: options?.dithering ?? false,
      toneMappingExposure: options?.toneMappingExposure ?? 10,
      cloudCoverage: options?.cloudCoverage ?? 0.3
    }
  }

  private initAtmosphere() {
    this.aerialPerspectiveEffect = new AerialPerspectiveEffect(this.threeCamera)
    this.aerialPerspectiveEffect.sky = true
    this.aerialPerspectiveEffect.sunLight = true
    this.aerialPerspectiveEffect.skyLight = true

    this.cloudsEffect = new CloudsEffect(this.threeCamera)
    this.scene.cloudCoverage = this.scene.cloudCoverage
    this.cloudsEffect.localWeatherVelocity.set(0.001, 0)
    this.cloudsEffect.shadow.farScale = 0.25
    this.cloudsEffect.shadow.maxFar = 1e5
    this.cloudsEffect.shadow.cascadeCount = 2
    this.cloudsEffect.shadow.mapSize.set(512, 512)
    this.cloudsEffect.shadow.splitMode = 'practical'
    this.cloudsEffect.shadow.splitLambda = 0.71
    this.cloudsEffect.events.addEventListener('change', this.handleCloudsChange)
  }

  private initPostProcessing() {
    if (!this.aerialPerspectiveEffect || !this.cloudsEffect) return

    const normalPass = new NormalPass(this.scene.threeScene, this.threeCamera)
    this.aerialPerspectiveEffect.normalBuffer = normalPass.texture

    this.cloudAtmosphereAdapter = new EffectPassAdapter(
      new EffectPass(this.threeCamera, this.cloudsEffect, this.aerialPerspectiveEffect),
      () => this.threeCamera
    )
    this.atmosphereAdapter = new EffectPassAdapter(new EffectPass(this.threeCamera, this.aerialPerspectiveEffect), () => this.threeCamera)
    this.normalAdapter = new EffectPassAdapter(normalPass, () => this.threeCamera)
    this.lensFlareAdapter = new EffectPassAdapter(new EffectPass(this.threeCamera, new LensFlareEffect()), () => this.threeCamera)
    this.smaaAdapter = new EffectPassAdapter(new EffectPass(this.threeCamera, new SMAAEffect()), () => this.threeCamera)
    this.ditheringAdapter = new EffectPassAdapter(new EffectPass(this.threeCamera, new DitheringEffect()), () => this.threeCamera)

    this.effectAdapters.push(
      this.normalAdapter,
      this.cloudAtmosphereAdapter,
      this.atmosphereAdapter,
      this.lensFlareAdapter,
      this.smaaAdapter,
      this.ditheringAdapter
    )
  }

  private applyPostProcessingEffects() {
    this.syncCloudAtmosphereComposition()

    const nextEffects: ThreeEffectPass[] = []
    const shouldRenderAtmosphere = this.scene.skyAtmosphere.show && this.aerialPerspectiveEffect !== null
    const shouldRenderClouds = shouldRenderAtmosphere && this.scene.clouds.show && this.cloudsEffect !== null

    if (shouldRenderAtmosphere && this.normalAdapter) {
      nextEffects.push(this.normalAdapter)
    }
    if (shouldRenderClouds && this.cloudAtmosphereAdapter) {
      nextEffects.push(this.cloudAtmosphereAdapter)
    } else if (shouldRenderAtmosphere && this.atmosphereAdapter) {
      nextEffects.push(this.atmosphereAdapter)
    }
    if (this.scene.postProcessStages.lensFlare.enabled && this.lensFlareAdapter) {
      nextEffects.push(this.lensFlareAdapter)
    }
    if (this.scene.postProcessStages.smaa.enabled && this.smaaAdapter) {
      nextEffects.push(this.smaaAdapter)
    }
    if (this.scene.postProcessStages.dithering.enabled && this.ditheringAdapter) {
      nextEffects.push(this.ditheringAdapter)
    }

    this.renderer.setEffects(nextEffects)
  }

  private syncCloudAtmosphereComposition() {
    if (!this.aerialPerspectiveEffect) return

    if (!this.scene.clouds.show || !this.scene.skyAtmosphere.show || !this.cloudsEffect) {
      this.aerialPerspectiveEffect.overlay = null
      this.aerialPerspectiveEffect.shadow = null
      this.aerialPerspectiveEffect.shadowLength = null
      return
    }

    this.aerialPerspectiveEffect.overlay = this.cloudsEffect.atmosphereOverlay
    this.aerialPerspectiveEffect.shadow = this.cloudsEffect.atmosphereShadow
    this.aerialPerspectiveEffect.shadowLength = this.cloudsEffect.atmosphereShadowLength
  }

  private updateSunDirection() {
    if (!this.aerialPerspectiveEffect || !this.cloudsEffect) return

    const sunDirection = new THREE.Vector3()
    getSunDirectionECEF(this.clock.currentTime, sunDirection)
    this.aerialPerspectiveEffect.sunDirection.copy(sunDirection)
    this.cloudsEffect.sunDirection.copy(sunDirection)
  }

  private async loadAtmosphereTextures() {
    const textures = await this.texturesGenerator.update()
    if (this.isDestroyed || !this.aerialPerspectiveEffect || !this.cloudsEffect) return

    Object.assign(this.aerialPerspectiveEffect, textures)
    Object.assign(this.cloudsEffect, textures)

    this.loadCloudTexture(DEFAULT_LOCAL_WEATHER_URL, (texture) => {
      if (this.cloudsEffect) this.cloudsEffect.localWeatherTexture = texture
    })
    this.loadCloudTexture(DEFAULT_TURBULENCE_URL, (texture) => {
      if (this.cloudsEffect) this.cloudsEffect.turbulenceTexture = texture
    })
    this.loadData3DTexture(DEFAULT_SHAPE_URL, CLOUD_SHAPE_TEXTURE_SIZE, (texture) => {
      if (this.cloudsEffect) this.cloudsEffect.shapeTexture = texture
    })
    this.loadData3DTexture(DEFAULT_SHAPE_DETAIL_URL, CLOUD_SHAPE_DETAIL_TEXTURE_SIZE, (texture) => {
      if (this.cloudsEffect) this.cloudsEffect.shapeDetailTexture = texture
    })

    new STBNLoader().load(DEFAULT_STBN_URL, (texture) => {
      if (this.isDestroyed || !this.cloudsEffect || !this.aerialPerspectiveEffect) {
        texture.dispose()
        return
      }

      this.loadedTextures.push(texture)
      this.cloudsEffect.stbnTexture = texture
      this.aerialPerspectiveEffect.stbnTexture = texture
    })

    this.updateSunDirection()
  }

  private loadCloudTexture(url: string, applyTexture: (texture: THREE.Texture) => void) {
    new THREE.TextureLoader().load(url, (texture) => {
      if (this.isDestroyed) {
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
    })
  }

  private loadData3DTexture(url: string, size: number, applyTexture: (texture: THREE.Data3DTexture) => void) {
    fetch(url)
      .then((res) => res.arrayBuffer())
      .then((buffer) => {
        if (this.isDestroyed) return

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
      })
  }
}

export class ThreeGIS extends GISViewer {}
