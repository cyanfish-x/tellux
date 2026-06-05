import * as THREE from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { TilesRenderer, GlobeControls } from '3d-tiles-renderer'
import { Camera } from './Camera'
import type { CameraFlyToOptions } from './Camera'
import { Clock } from './Clock'
import { DEFAULT_CAMERA, RAD2DEG } from './constants'
import { telluxConfig } from './config'
import type { ThreeRendererWithEffects } from './effects'
import { LayerManager } from './LayerManager'
import { AtmosphereManager } from './rendering/AtmosphereManager'
import { PostProcessingManager } from './rendering/PostProcessingManager'
import { Scene } from './Scene'
import { TilesetManager } from './tiles/TilesetManager'
import type {
  AnyViewerEventListener,
  CartographicCoordinates,
  FlyTo3DTilesetOptions,
  Load3DTilesetOptions,
  ScreenPosition,
  TilesetLayer,
  ViewerEventListener,
  ViewerEventMap,
  ViewerMouseEvent,
  ViewerOptions
} from './types'

export { Camera } from './Camera'
export { CesiumIonResource } from './resources/CesiumIonResource'
export { Clock } from './Clock'
export { ImageryLayer, LayerManager } from './LayerManager'
export { MVTResource } from './resources/MVTResource'
export { Scene } from './Scene'
export { TemplateUrlResource } from './resources/TemplateUrlResource'
export { WMSResource } from './resources/WMSResource'
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
  CesiumIon3DTilesetOptions,
  CesiumIonResourceOptions,
  FlyTo3DTilesetOptions,
  ImageryLayerOptions,
  ImageryLayerSourceOptions,
  ImageryLayerStyleOptions,
  Load3DTilesetOptions,
  MVTFeatureProperties,
  MVTFeatureStyle,
  MVTGetStyleCallback,
  MVTResourceOptions,
  ScreenPosition,
  TemplateUrlResourceOptions,
  TerrainOptions,
  TilesetLayer,
  Url3DTilesetOptions,
  ViewerClickEvent,
  ViewerEvent,
  ViewerEventListener,
  ViewerEventMap,
  ViewerMouseEvent,
  ViewerMouseMoveEvent,
  ViewerOptions,
  WMSResourceOptions
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
   * 影像图层管理器。
   *
   * Imagery layer manager.
   */
  readonly layers: LayerManager
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
    return this.tilesets.tileset
  }
  /**
   * 地球交互控制器。
   *
   * Globe interaction controls.
   */
  readonly controls: GlobeControls

  private readonly threeCamera: THREE.PerspectiveCamera
  private readonly dracoLoader: DRACOLoader
  private readonly rendererSize = new THREE.Vector2()
  private readonly transparentOverlayTexture: THREE.CanvasTexture
  private readonly flyToTilesetSphere = new THREE.Sphere()
  private readonly flyToTilesetCenter = new THREE.Vector3()
  private readonly flyToTilesetCartographicScratch = { lat: 0, lon: 0, height: 0 }
  private readonly pickCoords = new THREE.Vector2()
  private readonly pickRaycaster = new THREE.Raycaster()
  private readonly pickRay = new THREE.Ray()
  private readonly pickPoint = new THREE.Vector3()
  private readonly pickMatrix = new THREE.Matrix4()
  private readonly pickCartographicScratch = { lat: 0, lon: 0, height: 0 }
  private readonly eventListeners = new Map<keyof ViewerEventMap, Set<AnyViewerEventListener>>()
  private readonly resizeObserver: ResizeObserver
  private readonly atmosphere: AtmosphereManager
  private readonly postProcessing: PostProcessingManager
  private readonly tilesets: TilesetManager
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
  private hasEventListeners(type: keyof ViewerEventMap) {
    return Boolean(this.eventListeners.get(type)?.size)
  }
  private readonly handleCanvasClick = (originalEvent: MouseEvent) => {
    this.dispatchEvent('click', this.createMouseEvent('click', originalEvent))
  }
  private readonly handleCanvasMouseMove = (originalEvent: MouseEvent) => {
    if (!this.hasEventListeners('mousemove')) return

    this.dispatchEvent('mousemove', this.createMouseEvent('mousemove', originalEvent))
  }

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

    const width = container.clientWidth || 1
    const height = container.clientHeight || 1
    const cameraOptions = {
      ...DEFAULT_CAMERA,
      ...options.camera
    }

    this.threeCamera = new THREE.PerspectiveCamera(cameraOptions.fov, width / height, cameraOptions.near, cameraOptions.far)
    this.camera = new Camera(this.threeCamera)
    this.renderer = new THREE.WebGLRenderer({ outputBufferType: THREE.HalfFloatType }) as ThreeRendererWithEffects
    this.renderer.setPixelRatio(this.currentResolutionScale)
    this.renderer.setSize(width, height)
    this.renderer.toneMapping = THREE.AgXToneMapping
    this.renderer.toneMappingExposure = this.currentToneMappingExposure
    container.appendChild(this.renderer.domElement)
    this.transparentOverlayTexture = this.createTransparentOverlayTexture()

    let atmosphere: AtmosphereManager | null = null
    this.scene = new Scene(
      sceneOptions,
      () => atmosphere?.cloudsEffect ?? null,
      () => atmosphere ?? null,
      () => this.postProcessing.applyEffects()
    )
    this.atmosphere = new AtmosphereManager(this.renderer, this.threeCamera, () => this.postProcessing.applyEffects())
    atmosphere = this.atmosphere
    this.atmosphere.addLightsTo(this.scene.threeScene)
    this.scene.cloudCoverage = this.scene.cloudCoverage
    this.clock = new Clock(() => this.atmosphere.updateSunDirection(this.clock.currentTime))

    this.dracoLoader = new DRACOLoader()
    this.dracoLoader.setDecoderPath(options.dracoDecoderPath ?? '/draco/gltf/')

    this.tilesets = new TilesetManager({
      scene: this.scene.threeScene,
      camera: this.threeCamera,
      renderer: this.renderer,
      dracoLoader: this.dracoLoader,
      transparentOverlayTexture: this.transparentOverlayTexture,
      terrain: options.terrain,
      creasedNormals: sceneOptions.creasedNormals
    })
    this.camera.setView(cameraOptions)

    this.controls = new GlobeControls(this.scene.threeScene, this.threeCamera, this.renderer.domElement)
    this.syncControlsEllipsoid()
    this.layers = new LayerManager(options.layers, (layers, change) => {
      if (change.type === 'structure') {
        this.tilesets.setImageryLayers(layers)
        this.syncControlsEllipsoid()
      } else if (change.type === 'visibility' || change.type === 'style') {
        this.tilesets.syncImageryLayer(change.layer)
      }
    })
    this.controls.enableDamping = true
    this.controls.adjustHeight = false
    this.renderer.domElement.addEventListener('pointerdown', this.handleCameraInteraction)
    this.renderer.domElement.addEventListener('wheel', this.handleCameraInteraction)
    this.renderer.domElement.addEventListener('pointerdown', this.enableAdjustHeight)
    this.renderer.domElement.addEventListener('wheel', this.enableAdjustHeight)
    this.renderer.domElement.addEventListener('click', this.handleCanvasClick)
    this.renderer.domElement.addEventListener('mousemove', this.handleCanvasMouseMove)

    this.postProcessing = new PostProcessingManager(this.renderer, this.scene, this.scene.threeScene, this.threeCamera, this.atmosphere)
    this.postProcessing.applyEffects()
    this.atmosphere.loadTextures()
    this.atmosphere.updateSunDirection(this.clock.currentTime)

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
  flyTo(options: CameraFlyToOptions): this
  /**
   * 平滑飞行到 3D Tiles 附近，并以 30 度俯视角观察数据集中心。
   *
   * 如果传入的 tileset 根数据尚未加载，Viewer 会在根 tileset 加载完成后自动执行飞行。
   *
   * Smoothly flies near a 3D Tiles dataset and views its center from a
   * 30-degree downward angle.
   *
   * If the tileset root is not loaded yet, Viewer runs the flight after the
   * root tileset finishes loading.
   */
  flyTo(tileset: TilesRenderer, options?: FlyTo3DTilesetOptions): this
  flyTo(target: CameraFlyToOptions | TilesRenderer, options: FlyTo3DTilesetOptions = {}) {
    if (target instanceof TilesRenderer) {
      this.flyToTileset(target, options)
      return this
    }

    this.camera.flyTo(target)
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
    this.tilesets.setTerrain(terrain)
    return this
  }

  /**
   * 加载独立的 3D Tiles 场景数据。
   *
   * 支持直接传入 `tileset.json` URL，或传入 Cesium Ion 3D Tiles 资源。
   * 该方法加载的是场景 3D Tiles，不参与影像 overlay 管线。
   *
   * Loads an independent 3D Tiles scene dataset.
   *
   * Supports either a direct `tileset.json` URL or a Cesium Ion 3D Tiles asset.
   * The loaded dataset is scene 3D Tiles data and does not participate in the
   * imagery overlay pipeline.
   */
  load3DTileset(options: Load3DTilesetOptions): TilesetLayer {
    return this.tilesets.load3DTileset(options)
  }

  /**
   * 根据 id 获取已加载的 3D Tiles renderer。
   *
   * Gets a loaded 3D Tiles renderer by id.
   */
  get3DTileset(id: string) {
    return this.tilesets.get3DTileset(id)
  }

  /**
   * 根据 id 移除已加载的 3D Tiles 图层。
   *
   * Removes a loaded 3D Tiles layer by id.
   */
  remove3DTileset(id: string) {
    return this.tilesets.remove3DTileset(id)
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

    for (const tileset of this.tilesets.loadedSceneTilesets) {
      if (!tileset.group.visible) continue

      const tilesetHit = this.pickTilesetCartographic(tileset)
      if (tilesetHit) return tilesetHit
    }

    if (this.tilesets.terrainTileset) {
      const terrainHit = this.pickTilesetCartographic(this.tilesets.terrainTileset)
      if (terrainHit) return terrainHit
    }

    return this.pickTilesetCartographic(this.tilesets.surfaceTileset) ?? this.pickEllipsoidCartographic()
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
    this.syncAtmosphereInscatter()
    this.tilesets.update()
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
    this.tilesets.resize()
  }

  /**
   * 释放 WebGL 资源、事件监听器、控制器和已加载纹理。
   *
   * Releases WebGL resources, event listeners, controls, and loaded textures.
   */
  destroy() {
    if (this.isDestroyed) return

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
    this.clearEventListeners()

    this.postProcessing.dispose()
    this.atmosphere.dispose()
    this.transparentOverlayTexture.dispose()
    this.tilesets.dispose()
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
      cloudCoverage: options?.cloudCoverage ?? 0.3,
      atmosphereInscatterIntensity: options?.atmosphereInscatterIntensity ?? 1,
      atmosphereInscatterHorizonBlend: options?.atmosphereInscatterHorizonBlend ?? true,
      atmosphereInscatterHorizonRange: options?.atmosphereInscatterHorizonRange ?? [0, 0.6],
      creasedNormals: options?.creasedNormals ?? false
    }
  }

  private createTransparentOverlayTexture() {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const texture = new THREE.CanvasTexture(canvas)
    texture.generateMipmaps = false
    texture.needsUpdate = true
    return texture
  }

  private syncControlsEllipsoid() {
    this.controls.setEllipsoid(this.tilesets.surfaceTileset.ellipsoid, this.tilesets.surfaceTileset.group)
  }

  private syncAtmosphereInscatter() {
    this.atmosphere.inscatterIntensity = this.scene.atmosphereInscatterIntensity
    this.atmosphere.inscatterHorizonBlend = this.scene.atmosphereInscatterHorizonBlend
    this.atmosphere.inscatterHorizonRange = this.scene.atmosphereInscatterHorizonRange
  }

  private flyToTileset(tileset: TilesRenderer, options: FlyTo3DTilesetOptions) {
    if (this.applyTilesetFlight(tileset, options)) return

    const handleRootLoaded = () => {
      tileset.removeEventListener('load-root-tileset', handleRootLoaded)
      this.applyTilesetFlight(tileset, options)
    }

    tileset.addEventListener('load-root-tileset', handleRootLoaded)
  }

  private applyTilesetFlight(tileset: TilesRenderer, options: FlyTo3DTilesetOptions) {
    if (!tileset.getBoundingSphere(this.flyToTilesetSphere)) return false

    this.flyToTilesetCenter.copy(this.flyToTilesetSphere.center)
    const cartographic = tileset.ellipsoid.getPositionToCartographic(
      this.flyToTilesetCenter,
      this.flyToTilesetCartographicScratch
    )
    const radius = Math.max(this.flyToTilesetSphere.radius, 1)
    const height = cartographic.height + Math.max(radius * 2.8, 500)

    this.camera.flyTo({
      destination: {
        latitude: cartographic.lat * RAD2DEG,
        longitude: cartographic.lon * RAD2DEG,
        height
      },
      orientation: {
        heading: options.heading ?? 0,
        pitch: options.pitch ?? -30,
        roll: options.roll ?? 0
      },
      duration: options.duration,
      maximumHeight: options.maximumHeight,
      complete: options.complete,
      cancel: options.cancel,
      easingFunction: options.easingFunction
    })
    return true
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
    this.tilesets.surfaceTileset.group.updateMatrixWorld(true)
    this.pickMatrix.copy(this.tilesets.surfaceTileset.group.matrixWorld).invert()
    this.pickRay.copy(this.pickRaycaster.ray).applyMatrix4(this.pickMatrix)

    const point = this.tilesets.surfaceTileset.ellipsoid.intersectRay(this.pickRay, this.pickPoint)
    if (!point) return null

    return this.toCartographicCoordinates(point, this.tilesets.surfaceTileset)
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
}
