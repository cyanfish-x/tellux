import * as THREE from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { TilesRenderer, GlobeControls } from '3d-tiles-renderer'
import {
  CesiumIonAuthPlugin,
  CesiumIonOverlay,
  GLTFExtensionsPlugin,
  ImageOverlayPlugin,
  QuantizedMeshPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin,
  XYZTilesOverlay,
  XYZTilesPlugin
} from '3d-tiles-renderer/plugins'
import { EffectPass, NormalPass, SMAAEffect } from 'postprocessing'
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
import { Camera } from './Camera'
import type { CameraFlyToOptions } from './Camera'
import { Clock } from './Clock'
import { DEFAULT_CAMERA, RAD2DEG } from './constants'
import { getTelluxAssetUrl, telluxConfig } from './config'
import { EffectPassAdapter, type ThreeEffectPass, type ThreeRendererWithEffects } from './effects'
import { Scene } from './Scene'
import { TerrainFetchPlugin } from './TerrainFetchPlugin'
import { TileCreasedNormalsPlugin } from './TileCreasedNormalsPlugin'
import type {
  AnyViewerEventListener,
  CartographicCoordinates,
  ImageryProviderOptions,
  ImageryProviderResourceOptions,
  ScreenPosition,
  TerrainOptions,
  ViewerEventListener,
  ViewerEventMap,
  ViewerMouseEvent,
  ViewerOptions
} from './types'

export { Camera } from './Camera'
export { CesiumIonResource } from './CesiumIonResource'
export { Clock } from './Clock'
export { ImageryProvider } from './ImageryProvider'
export { Scene } from './Scene'
export { TemplateUrlResource } from './TemplateUrlResource'
export { telluxConfig, type TelluxConfig } from './config'
export type {
  CameraFlyToDestination,
  CameraFlyToOptions,
  CameraFlightEasingFunction,
  CameraOrientation,
  CameraSetViewOptions
} from './Camera'
export type {
  CartographicCoordinates,
  CesiumIonResourceOptions,
  ImageryProviderOptions,
  ImageryProviderResourceOptions,
  ScreenPosition,
  TemplateUrlResourceOptions,
  TerrainOptions,
  ViewerClickEvent,
  ViewerEvent,
  ViewerEventListener,
  ViewerEventMap,
  ViewerMouseEvent,
  ViewerMouseMoveEvent,
  ViewerOptions
} from './types'

/**
 * Tellux 主视图类。
 *
 * Viewer 持有渲染器、场景、相机、Cesium 3D Tiles 渲染器、控制器、
 * 大气、云、后处理效果和渲染循环。
 *
 * Main Tellux viewer.
 *
 * The viewer owns the renderer, scene, camera, Cesium 3D Tiles renderer,
 * controls, atmosphere, clouds, post-processing effects, and render loop.
 */
export class Viewer {
  /**
   * 接收 WebGL canvas 的容器元素。
   *
   * Container element that receives the WebGL canvas.
   */
  readonly container: HTMLElement
  /**
   * 场景控制项和底层 Three.js 场景。
   *
   * Scene controls and the underlying Three.js scene.
   */
  readonly scene: Scene
  /**
   * 带 Cesium 风格视角辅助方法的相机控制项。
   *
   * Camera controls with Cesium-style view helpers.
   */
  readonly camera: Camera
  /**
   * 底层 Three.js 渲染器。
   *
   * Underlying Three.js renderer.
   */
  readonly renderer: ThreeRendererWithEffects
  /**
   * 用于太阳方向的场景时钟。
   *
   * Scene clock used for sun direction.
   */
  readonly clock: Clock
  /**
   * 底层 3D Tiles 渲染器。
   *
   * 启用地形时返回地形渲染器，否则返回基础裸球渲染器。
   *
   * Underlying 3D Tiles renderer.
   *
   * Returns the terrain renderer when terrain is enabled, otherwise returns the
   * base globe surface renderer.
   */
  get tileset() {
    return this.terrainTileset ?? this.surfaceTileset
  }
  /**
   * 地球交互控制器。
   *
   * Globe interaction controls.
   */
  readonly controls: GlobeControls

  private readonly threeCamera: THREE.PerspectiveCamera
  private readonly dracoLoader: DRACOLoader
  private readonly effectAdapters: ThreeEffectPass[] = []
  private readonly loadedTextures: THREE.Texture[] = []
  private readonly rendererSize = new THREE.Vector2()
  private readonly pickCoords = new THREE.Vector2()
  private readonly pickRaycaster = new THREE.Raycaster()
  private readonly pickRay = new THREE.Ray()
  private readonly pickPoint = new THREE.Vector3()
  private readonly pickMatrix = new THREE.Matrix4()
  private readonly pickCartographicScratch = { lat: 0, lon: 0, height: 0 }
  private readonly eventListeners = new Map<keyof ViewerEventMap, Set<AnyViewerEventListener>>()
  private readonly resizeObserver: ResizeObserver
  private readonly texturesGenerator: PrecomputedTexturesGenerator
  private surfaceTileset: TilesRenderer
  private terrainTileset: TilesRenderer | null = null
  private currentImageryProvider: ImageryProviderOptions | undefined
  private currentTerrain: TerrainOptions | undefined
  private readonly handleWindowResize = () => {
    this.resize()
  }
  private readonly handleCameraInteraction = () => {
    this.camera.cancelFlight()
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
  private createMouseEvent(type: 'click', originalEvent: MouseEvent): ViewerEventMap['click']
  private createMouseEvent(type: 'mousemove', originalEvent: MouseEvent): ViewerEventMap['mousemove']
  private createMouseEvent(type: ViewerMouseEvent['type'], originalEvent: MouseEvent): ViewerMouseEvent {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const position = {
      x: originalEvent.clientX - rect.left,
      y: originalEvent.clientY - rect.top
    }

    return {
      type,
      viewer: this,
      originalEvent,
      position,
      cartographic: this.pickCartographic(position)
    }
  }
  private readonly handleCanvasClick = (originalEvent: MouseEvent) => {
    this.dispatchEvent('click', this.createMouseEvent('click', originalEvent))
  }
  private readonly handleCanvasMouseMove = (originalEvent: MouseEvent) => {
    this.dispatchEvent('mousemove', this.createMouseEvent('mousemove', originalEvent))
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

  /**
   * 在非空容器元素内创建 viewer。
   *
   * Creates a viewer inside a non-empty container element.
   */
  constructor(container: HTMLElement, options: ViewerOptions = {}) {
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
    this.scene = new Scene(
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

    this.currentImageryProvider = options.imageryProvider
    this.currentTerrain = options.terrain
    this.surfaceTileset = this.createSurfaceTileset(this.currentImageryProvider?.resource)
    this.scene.threeScene.add(this.surfaceTileset.group)
    if (this.currentTerrain) {
      this.terrainTileset = this.createTerrainTileset(this.currentTerrain, this.currentImageryProvider?.resource)
      this.scene.threeScene.add(this.terrainTileset.group)
    }
    this.threeCamera.userData.tilesRenderer = this.tileset
    this.camera.setView(cameraOptions)

    this.controls = new GlobeControls(this.scene.threeScene, this.threeCamera, this.renderer.domElement)
    this.controls.setEllipsoid(this.surfaceTileset.ellipsoid, this.surfaceTileset.group)
    this.controls.enableDamping = true
    this.controls.adjustHeight = false
    this.renderer.domElement.addEventListener('pointerdown', this.handleCameraInteraction)
    this.renderer.domElement.addEventListener('wheel', this.handleCameraInteraction)
    this.renderer.domElement.addEventListener('pointerdown', this.enableAdjustHeight)
    this.renderer.domElement.addEventListener('wheel', this.enableAdjustHeight)
    this.renderer.domElement.addEventListener('click', this.handleCanvasClick)
    this.renderer.domElement.addEventListener('mousemove', this.handleCanvasMouseMove)

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

  /**
   * Tellux 是否接管动画循环。
   *
   * Whether Tellux owns the animation loop.
   */
  get useDefaultRenderLoop() {
    return this.isUsingDefaultRenderLoop
  }

  set useDefaultRenderLoop(value: boolean) {
    this.isUsingDefaultRenderLoop = value
    this.renderer.setAnimationLoop(value ? (time) => this.render(time) : null)
  }

  /**
   * 渲染器像素比。
   *
   * Renderer pixel ratio.
   */
  get resolutionScale() {
    return this.currentResolutionScale
  }

  set resolutionScale(value: number) {
    this.currentResolutionScale = value
    this.renderer.setPixelRatio(value)
    this.resize()
  }

  /**
   * 渲染器色调映射曝光值。
   *
   * Renderer tone mapping exposure.
   */
  get toneMappingExposure() {
    return this.currentToneMappingExposure
  }

  set toneMappingExposure(value: number) {
    this.currentToneMappingExposure = value
    this.renderer.toneMappingExposure = value
  }

  /**
   * 注册 Viewer 事件监听函数。
   *
   * Registers a Viewer event listener.
   */
  on<T extends keyof ViewerEventMap>(type: T, listener: ViewerEventListener<T>) {
    let listeners = this.eventListeners.get(type)
    if (!listeners) {
      listeners = new Set()
      this.eventListeners.set(type, listeners)
    }

    listeners.add(listener as AnyViewerEventListener)
    return this
  }

  /**
   * 移除 Viewer 事件监听函数。
   *
   * Removes a Viewer event listener.
   */
  off<T extends keyof ViewerEventMap>(type: T, listener: ViewerEventListener<T>) {
    this.eventListeners.get(type)?.delete(listener as AnyViewerEventListener)
    return this
  }

  /**
   * 平滑飞行到目标位置。
   *
   * 这是 {@link Viewer.camera} 的快捷代理，等价于调用 `viewer.camera.flyTo(options)`。
   *
   * Smoothly flies the camera to a destination.
   *
   * This is a shortcut proxy for {@link Viewer.camera}, equivalent to calling
   * `viewer.camera.flyTo(options)`.
   */
  flyTo(options: CameraFlyToOptions) {
    this.camera.flyTo(options)
    return this
  }

  /**
   * 运行时切换影像数据源，并保留当前 Viewer、相机、控制器和渲染器状态。
   *
   * Switches the imagery data source at runtime while preserving the current
   * Viewer, camera, controls, and renderer state.
   */
  setImageryProvider(imageryProvider: NonNullable<ViewerOptions['imageryProvider']>) {
    this.currentImageryProvider = imageryProvider
    this.replaceSurfaceTileset(this.createSurfaceTileset(this.currentImageryProvider.resource))
    if (this.currentTerrain) {
      this.replaceTerrainTileset(this.createTerrainTileset(this.currentTerrain, this.currentImageryProvider.resource))
    }
    return this
  }

  /**
   * 运行时切换 Cesium quantized-mesh 地形，并保留当前影像、相机、控制器和渲染器状态。
   *
   * 传入 `null` 可移除当前地形并回到无地形模式。
   *
   * Switches Cesium quantized-mesh terrain at runtime while preserving the current
   * imagery, camera, controls, and renderer state.
   *
   * Pass `null` to remove the current terrain and return to the non-terrain mode.
   */
  setTerrain(terrain: ViewerOptions['terrain'] | null) {
    this.currentTerrain = terrain ?? undefined
    this.replaceTerrainTileset(
      this.currentTerrain ? this.createTerrainTileset(this.currentTerrain, this.currentImageryProvider?.resource) : null
    )
    return this
  }

  /**
   * 获取屏幕位置对应的经纬高坐标。
   *
   * 传入的坐标相对于 canvas 左上角。方法会优先命中已加载的 3D Tiles，
   * 未命中时再回退到 WGS84 椭球表面；两者都未命中时返回 `null`。
   *
   * Gets the cartographic coordinates for a screen position.
   *
   * The input position is relative to the top-left corner of the canvas. The
   * method hits loaded 3D Tiles first, then falls back to the WGS84 ellipsoid.
   * It returns `null` when neither target is hit.
   */
  pickCartographic(position: ScreenPosition): CartographicCoordinates | null {
    const canvas = this.renderer.domElement
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (!width || !height) return null

    this.pickCoords.set((position.x / width) * 2 - 1, -(position.y / height) * 2 + 1)
    this.threeCamera.updateMatrixWorld()
    this.pickRaycaster.setFromCamera(this.pickCoords, this.threeCamera)

    if (this.terrainTileset) {
      const terrainHit = this.pickTilesetCartographic(this.terrainTileset)
      if (terrainHit) return terrainHit
    }

    return this.pickTilesetCartographic(this.surfaceTileset) ?? this.pickEllipsoidCartographic()
  }

  /**
   * 渲染一帧，并返回以秒为单位的帧间隔。
   *
   * 当 {@link Viewer.useDefaultRenderLoop} 为 `false` 时，请手动调用此方法。
   *
   * Renders one frame and returns the frame delta time in seconds.
   *
   * Call this manually when {@link Viewer.useDefaultRenderLoop} is `false`.
   */
  render(time = performance.now()) {
    const deltaTime = (time - this.previousTime) / 1000
    this.previousTime = time

    this.resize()
    this.controls.update()
    this.surfaceTileset.update()
    this.terrainTileset?.update()
    this.renderer.render(this.scene.threeScene, this.threeCamera)
    return deltaTime
  }

  /**
   * 将渲染器和相机尺寸同步到容器尺寸。
   *
   * Resizes the renderer and camera to match the container.
   */
  resize() {
    const { clientWidth, clientHeight } = this.container
    if (!clientWidth || !clientHeight) return

    this.renderer.getSize(this.rendererSize)
    if (this.rendererSize.width === clientWidth && this.rendererSize.height === clientHeight) return

    this.threeCamera.aspect = clientWidth / clientHeight
    this.threeCamera.updateProjectionMatrix()
    this.renderer.setSize(clientWidth, clientHeight)
    this.resizeTilesets()
  }

  /**
   * 释放 WebGL 资源、事件监听器、控制器和已加载纹理。
   *
   * Releases WebGL resources, event listeners, controls, and loaded textures.
   */
  destroy() {
    this.isDestroyed = true
    this.camera.cancelFlight()
    this.useDefaultRenderLoop = false
    window.removeEventListener('resize', this.handleWindowResize)
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('pointerdown', this.handleCameraInteraction)
    this.renderer.domElement.removeEventListener('wheel', this.handleCameraInteraction)
    this.renderer.domElement.removeEventListener('pointerdown', this.enableAdjustHeight)
    this.renderer.domElement.removeEventListener('wheel', this.enableAdjustHeight)
    this.renderer.domElement.removeEventListener('click', this.handleCanvasClick)
    this.renderer.domElement.removeEventListener('mousemove', this.handleCanvasMouseMove)
    this.renderer.setEffects(null)
    this.cloudsEffect?.events.removeEventListener('change', this.handleCloudsChange)
    this.clearEventListeners()

    this.effectAdapters.forEach((adapter) => adapter.dispose())
    this.texturesGenerator.dispose({ textures: true })
    this.loadedTextures.forEach((texture) => texture.dispose())
    this.terrainTileset?.dispose()
    this.surfaceTileset.dispose()
    this.controls.dispose()
    this.dracoLoader.dispose()
    this.renderer.dispose()

    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement)
    }
  }

  private resolveSceneOptions(options: ViewerOptions['scene']): Required<NonNullable<ViewerOptions['scene']>> {
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

  private createSurfaceTileset(resource: ImageryProviderResourceOptions | undefined) {
    const tileset = new TilesRenderer()
    this.registerImageryProvider(tileset, resource, false)
    this.registerCommonTilesetPlugins(tileset)
    return tileset
  }

  private createTerrainTileset(terrain: TerrainOptions, resource: ImageryProviderResourceOptions | undefined) {
    const tileset = new TilesRenderer(this.normalizeTerrainUrl(terrain.url))
    this.registerTerrainProvider(tileset, terrain)
    this.registerImageryProvider(tileset, resource, true)
    this.registerCommonTilesetPlugins(tileset)
    return tileset
  }

  private registerCommonTilesetPlugins(tileset: TilesRenderer) {
    tileset.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: this.dracoLoader, autoDispose: false }))
    tileset.registerPlugin(new TileCreasedNormalsPlugin())
    tileset.registerPlugin(new TilesFadePlugin())
    tileset.registerPlugin(new UpdateOnChangePlugin())
    tileset.setCamera(this.threeCamera)
    tileset.setResolutionFromRenderer(this.threeCamera, this.renderer)
  }

  private replaceSurfaceTileset(nextTileset: TilesRenderer) {
    const previousTileset = this.surfaceTileset

    this.scene.threeScene.remove(previousTileset.group)
    previousTileset.dispose()
    this.surfaceTileset = nextTileset
    this.scene.threeScene.remove(nextTileset.group)
    this.scene.threeScene.add(nextTileset.group)
    if (this.terrainTileset) {
      this.scene.threeScene.remove(this.terrainTileset.group)
      this.scene.threeScene.add(this.terrainTileset.group)
    }
    this.controls.setEllipsoid(this.surfaceTileset.ellipsoid, this.surfaceTileset.group)
    this.syncActiveTilesetReference()
    this.resizeTilesets()
  }

  private replaceTerrainTileset(nextTileset: TilesRenderer | null) {
    const previousTileset = this.terrainTileset

    if (previousTileset) {
      this.scene.threeScene.remove(previousTileset.group)
      previousTileset.dispose()
    }
    this.terrainTileset = nextTileset
    if (nextTileset) {
      this.scene.threeScene.add(nextTileset.group)
    }
    this.syncActiveTilesetReference()
    this.resizeTilesets()
  }

  private resizeTilesets() {
    this.surfaceTileset.setResolutionFromRenderer(this.threeCamera, this.renderer)
    this.terrainTileset?.setResolutionFromRenderer(this.threeCamera, this.renderer)
  }

  private syncActiveTilesetReference() {
    this.threeCamera.userData.tilesRenderer = this.tileset
  }

  private registerTerrainProvider(tileset: TilesRenderer, terrain: TerrainOptions | undefined) {
    if (!terrain) return

    const terrainOptions: ConstructorParameters<typeof QuantizedMeshPlugin>[0] & { generateNormals?: boolean } = {
      useRecommendedSettings: terrain.useRecommendedSettings,
      skirtLength: terrain.skirtLength ?? undefined,
      smoothSkirtNormals: terrain.smoothSkirtNormals,
      generateNormals: terrain.generateNormals,
      solid: terrain.solid
    }

    tileset.registerPlugin(new QuantizedMeshPlugin(terrainOptions))
    tileset.registerPlugin(new TerrainFetchPlugin())
  }

  private registerImageryProvider(tileset: TilesRenderer, resource: ImageryProviderResourceOptions | undefined, useOverlay: boolean) {
    if (!resource) return

    switch (resource.type) {
      case 'template-url': {
        const xyzOptions = {
          url: resource.url,
          levels: resource.levels,
          tileDimension: resource.tileDimension,
          projection: resource.projection
        }

        if (useOverlay) {
          tileset.registerPlugin(
            new ImageOverlayPlugin({
              renderer: this.renderer,
              overlays: [new XYZTilesOverlay(xyzOptions)]
            })
          )
        } else {
          tileset.registerPlugin(new XYZTilesPlugin({ ...xyzOptions, shape: 'ellipsoid' }))
        }
        return
      }
      case 'cesium-ion':
        if (useOverlay) {
          tileset.registerPlugin(
            new ImageOverlayPlugin({
              renderer: this.renderer,
              overlays: [
                new CesiumIonOverlay({
                  apiToken: resource.apiToken,
                  assetId: resource.assetId,
                  autoRefreshToken: resource.autoRefreshToken ?? true
                })
              ]
            })
          )
        } else {
          tileset.registerPlugin(
            new CesiumIonAuthPlugin({
              apiToken: resource.apiToken,
              assetId: String(resource.assetId),
              autoRefreshToken: resource.autoRefreshToken ?? true
            })
          )
        }
    }
  }

  private normalizeTerrainUrl(url: string) {
    const terrainUrl = new URL(url, location.href)
    if (terrainUrl.pathname.endsWith('/layer.json')) {
      terrainUrl.pathname = terrainUrl.pathname.slice(0, -'layer.json'.length)
    } else if (!terrainUrl.pathname.endsWith('/')) {
      terrainUrl.pathname += '/'
    }

    return terrainUrl.toString()
  }

  private pickTilesetCartographic(tileset: TilesRenderer): CartographicCoordinates | null {
    tileset.group.updateMatrixWorld(true)
    this.pickMatrix.copy(tileset.group.matrixWorld).invert()

    const hit = this.pickRaycaster.intersectObject(tileset.group, true)[0]
    if (!hit) return null

    this.pickPoint.copy(hit.point).applyMatrix4(this.pickMatrix)
    return this.toCartographicCoordinates(this.pickPoint, tileset)
  }

  private pickEllipsoidCartographic() {
    this.surfaceTileset.group.updateMatrixWorld(true)
    this.pickMatrix.copy(this.surfaceTileset.group.matrixWorld).invert()
    this.pickRay.copy(this.pickRaycaster.ray).applyMatrix4(this.pickMatrix)

    const point = this.surfaceTileset.ellipsoid.intersectRay(this.pickRay, this.pickPoint)
    if (!point) return null

    return this.toCartographicCoordinates(point, this.surfaceTileset)
  }

  private toCartographicCoordinates(point: THREE.Vector3, tileset: TilesRenderer): CartographicCoordinates {
    const cartographic = tileset.ellipsoid.getPositionToCartographic(point, this.pickCartographicScratch)
    return {
      latitude: cartographic.lat * RAD2DEG,
      longitude: cartographic.lon * RAD2DEG,
      height: cartographic.height
    }
  }

  private dispatchEvent<T extends keyof ViewerEventMap>(type: T, event: ViewerEventMap[T]) {
    this.eventListeners.get(type)?.forEach((listener) => {
      listener(event)
    })
  }

  private clearEventListeners() {
    this.eventListeners.forEach((listeners) => listeners.clear())
    this.eventListeners.clear()
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

    this.loadCloudTexture(getTelluxAssetUrl(DEFAULT_LOCAL_WEATHER_URL), (texture) => {
      if (this.cloudsEffect) this.cloudsEffect.localWeatherTexture = texture
    })
    this.loadCloudTexture(getTelluxAssetUrl(DEFAULT_TURBULENCE_URL), (texture) => {
      if (this.cloudsEffect) this.cloudsEffect.turbulenceTexture = texture
    })
    this.loadData3DTexture(getTelluxAssetUrl(DEFAULT_SHAPE_URL), CLOUD_SHAPE_TEXTURE_SIZE, (texture) => {
      if (this.cloudsEffect) this.cloudsEffect.shapeTexture = texture
    })
    this.loadData3DTexture(getTelluxAssetUrl(DEFAULT_SHAPE_DETAIL_URL), CLOUD_SHAPE_DETAIL_TEXTURE_SIZE, (texture) => {
      if (this.cloudsEffect) this.cloudsEffect.shapeDetailTexture = texture
    })

    new STBNLoader().load(getTelluxAssetUrl(DEFAULT_STBN_URL), (texture) => {
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
