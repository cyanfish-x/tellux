import * as THREE from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { TilesRenderer } from '3d-tiles-renderer'
import { Camera } from './Camera'
import { Clock } from './Clock'
import { CAMERA_FRAME, DEFAULT_CAMERA, DEG2RAD, RAD2DEG } from './constants'
import { telluxConfig } from './config'
import { TelluxGlobeControls } from './controls/TelluxGlobeControls'
import type { ThreeRendererWithEffects } from './effects'
import { LayerManager } from './LayerManager'
import { GltfModelLayer, type ModelMaterialMode } from './models/GltfModelLayer'
import { AtmosphereManager } from './rendering/AtmosphereManager'
import { PostProcessingManager } from './rendering/PostProcessingManager'
import { CartographicPicker } from './sampling/CartographicPicker'
import { HeightSampler } from './sampling/HeightSampler'
import { TilesetFeaturePicker } from './sampling/TilesetFeaturePicker'
import { Scene, type ResolvedSceneOptions } from './Scene'
import { TilesetManager } from './tiles/TilesetManager'
import {
  applyInitialDebugSettings,
  DebugSettingsPanel,
  loadStoredDebugSettings
} from './widgets/DebugSettingsPanel'
import { Timeline } from './widgets/Timeline'
import type {
  AddModelOptions,
  AnyViewerEventListener,
  AtmosphereLightingMode,
  CartographicFrameOptions,
  CartographicCoordinates,
  CartographicCoordinateTuple,
  CartographicHeightTuple,
  CartographicInput,
  DebugSettingsPanelOptions,
  FlyToTargetOptions,
  FlyToTargetTarget,
  Load3DTilesetOptions,
  ModelLayer,
  Picked3DTilesFeature,
  SampleHeightMostDetailedOptions,
  SampleHeightMostDetailedResult,
  SampleHeightOptions,
  ScreenPosition,
  SurfaceMaterialMode,
  TimelineOptions,
  TilesetLayer,
  ViewerEventListener,
  ViewerEventMap,
  ViewerMouseEvent,
  ViewerOptions,
  ViewerWidgetOptions
} from './types'
import type { GlobeControls } from '3d-tiles-renderer'

type ResolvedSurfaceMaterialMode = Exclude<SurfaceMaterialMode, 'auto'>
type SceneTilesetMaterialMode = 'basic' | 'standard'

export { Camera } from './Camera'
export { Clock } from './Clock'
export { ImageryLayer, LayerManager } from './LayerManager'
export { Scene } from './Scene'
export { SpringControl, type SpringControlOptions } from './SpringControl'
export { telluxConfig, type TelluxConfig } from './config'
export { AtmosphereLightingMode } from './types'
export { DebugSettingsPanel, Timeline, type DebugSettingsPanelOptions, type TimelineOptions } from './widgets'
export type {
  CameraFlyToDestination,
  CameraFlyToOptions,
  CameraFlightEasingFunction,
  CameraOrientation,
  CameraSetViewOptions
} from './Camera'
export type {
  AddModelOptions,
  CloudQualityPreset,
  CartographicCoordinateTuple,
  CartographicFrameOptions,
  CartographicCoordinates,
  CartographicHeightTuple,
  CartographicInput,
  CesiumIon3DTilesetOptions,
  CesiumIonImagerySourceOptions,
  FlyToTargetOffset,
  FlyToTargetOptions,
  FlyToTargetTarget,
  HeightSamplingSource,
  GeoJSONData,
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  GeoJSONFeatureProperties,
  GeoJSONFeatureStyle,
  GeoJSONGeometry,
  GeoJSONGetStyleCallback,
  GeoJSONImagerySourceOptions,
  GltfModelOptions,
  ImageryLayerOptions,
  ImageryLayerSourceOptions,
  ImageryLayerStyleOptions,
  Load3DTilesetOptions,
  ModelLayer,
  MVTImagerySourceOptions,
  MVTFeatureProperties,
  MVTFeatureStyle,
  MVTGetStyleCallback,
  Picked3DTilesFeature,
  ScreenPosition,
  SampleHeightMostDetailedOptions,
  SampleHeightMostDetailedResult,
  SampleHeightOptions,
  TerrainOptions,
  TerrainTileLoadingOptions,
  ThreeDTilesRenderOptions,
  SurfaceMaterialMode,
  TilesetFeatureProperties,
  TilesetLayer,
  Url3DTilesetOptions,
  ViewerClickEvent,
  ViewerEvent,
  ViewerEventListener,
  ViewerEventMap,
  ViewerMouseEvent,
  ViewerMouseMoveEvent,
  ViewerAtmosphereLightingOptions,
  ViewerAtmosphereOptions,
  ViewerAtmosphereScatteringOptions,
  ViewerAtmosphereShadowOptions,
  ViewerAtmosphereSkyOptions,
  ViewerCloudLayerOptions,
  ViewerCloudOptions,
  ViewerFallbackAmbientLightOptions,
  ViewerPostProcessOptions,
  ViewerSceneOptions,
  ViewerSurfaceOptions,
  ViewerWidgetOptions,
  ViewerOptions,
  WMSImagerySourceOptions,
  XYZImagerySourceOptions
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
  private readonly flyToTargetSphere = new THREE.Sphere()
  private readonly flyToTargetBox = new THREE.Box3()
  private readonly flyToTargetCenter = new THREE.Vector3()
  private readonly flyToTargetDirection = new THREE.Vector3()
  private readonly flyToTargetEast = new THREE.Vector3()
  private readonly flyToTargetNorth = new THREE.Vector3()
  private readonly flyToTargetUp = new THREE.Vector3()
  private readonly flyToTargetCamera = new THREE.PerspectiveCamera()
  private readonly cameraCartographicScratch = { lat: 0, lon: 0, height: 0, azimuth: 0, elevation: 0, roll: 0 }
  private readonly flyToTargetCartographicScratch = { lat: 0, lon: 0, height: 0, azimuth: 0, elevation: 0, roll: 0 }
  private readonly eventListeners = new Map<keyof ViewerEventMap, Set<AnyViewerEventListener>>()
  private readonly gltfLoader: GLTFLoader
  private readonly modelLayers = new Map<string, GltfModelLayer>()
  private readonly resizeObserver: ResizeObserver
  private readonly atmosphere: AtmosphereManager
  private readonly postProcessing: PostProcessingManager
  private readonly tilesets: TilesetManager
  private readonly cartographicPicker: CartographicPicker
  private readonly tilesetFeaturePicker: TilesetFeaturePicker
  private readonly heightSampler: HeightSampler
  private debugSettingsPanel: DebugSettingsPanel | null = null
  private timeline: Timeline | null = null
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
    const tilesetFeature = this.pick3DTilesFeature(position)

    return {
      type,
      viewer: this,
      originalEvent,
      position,
      cartographic: tilesetFeature?.cartographic ?? this.pickCartographic(position),
      tilesetFeature
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
  private isHeightSamplingUpdateScheduled = false
  private heightSamplingUpdateFrameId = 0
  private currentResolutionScale: number
  private currentToneMappingExposure: number
  private nextModelId = 0

  /**
   * 在非空容器元素内创建 viewer。传入字符串时，会将其作为元素 ID 获取容器。
   *
   * Creates a viewer inside a non-empty container element. When a string is
   * provided, it is treated as an element ID and resolved with `getElementById`.
   */
  constructor(container: HTMLElement | string, options: ViewerOptions = {}) {
    const resolvedContainer = Viewer.resolveContainer(container)
    this.container = resolvedContainer
    this.currentResolutionScale = options.resolutionScale ?? Math.min(window.devicePixelRatio, 2)
    const widgetOptions = this.resolveWidgetOptions(options)
    const debugSettings = this.resolveSettingPanelOptions(widgetOptions.settingPanel)
    const timelineOptions = this.resolveTimelineOptions(widgetOptions.timeline)
    const sceneOptions = this.resolveSceneOptions(options.scene)
    this.currentToneMappingExposure = sceneOptions.postProcess.toneMappingExposure

    const width = resolvedContainer.clientWidth || 1
    const height = resolvedContainer.clientHeight || 1
    const cameraOptions = {
      ...DEFAULT_CAMERA,
      ...options.camera
    }

    this.threeCamera = new THREE.PerspectiveCamera(cameraOptions.fov, width / height, cameraOptions.near, cameraOptions.far)
    this.camera = new Camera(this.threeCamera)
    this.renderer = new THREE.WebGLRenderer({
      alpha: options.transparent ?? false,
      outputBufferType: THREE.HalfFloatType
    }) as ThreeRendererWithEffects
    this.renderer.setPixelRatio(this.currentResolutionScale)
    this.renderer.setSize(width, height)
    this.renderer.toneMapping = THREE.AgXToneMapping
    this.renderer.toneMappingExposure = this.currentToneMappingExposure
    resolvedContainer.appendChild(this.renderer.domElement)
    this.transparentOverlayTexture = this.createTransparentOverlayTexture()

    let atmosphere: AtmosphereManager | null = null
    let postProcessing: PostProcessingManager | null = null
    let tilesets: TilesetManager | null = null
    this.scene = new Scene(
      sceneOptions,
      () => atmosphere?.cloudsEffect ?? null,
      (state) => atmosphere?.applyAtmosphereState(state),
      () => postProcessing?.applyEffects(),
      () => {
        if (tilesets) this.syncSurfaceMaterialMode()
      }
    )
    this.atmosphere = new AtmosphereManager(this.renderer, this.threeCamera, () => postProcessing?.applyEffects())
    atmosphere = this.atmosphere
    this.atmosphere.addLightSourcesTo(this.scene.threeScene)
    this.scene.syncRuntimeEffects()
    this.clock = new Clock(() => this.atmosphere.updateSunDirection(this.clock.currentTime))

    this.dracoLoader = new DRACOLoader()
    this.dracoLoader.setDecoderPath(options.dracoDecoderPath ?? '/draco/gltf/')
    this.gltfLoader = new GLTFLoader()
    this.gltfLoader.setDRACOLoader(this.dracoLoader)

    this.tilesets = new TilesetManager({
      scene: this.scene.threeScene,
      camera: this.threeCamera,
      renderer: this.renderer,
      dracoLoader: this.dracoLoader,
      transparentOverlayTexture: this.transparentOverlayTexture,
      terrain: options.terrain,
      surfaceMaterialMode: this.resolveSurfaceMaterialMode(
        sceneOptions.surface.materialMode,
        sceneOptions.atmosphere.lighting.mode
      ),
      sceneTilesetMaterialMode: this.resolveSceneContentMaterialMode(sceneOptions.atmosphere.lighting.mode)
    })
    tilesets = this.tilesets
    this.cartographicPicker = new CartographicPicker(this.renderer.domElement, this.threeCamera, this.tilesets)
    this.tilesetFeaturePicker = new TilesetFeaturePicker(this.renderer.domElement, this.threeCamera, this.tilesets)
    this.heightSampler = new HeightSampler(this.tilesets, (input) => this.resolveCartographicInput(input))
    this.camera.setView(cameraOptions)

    this.controls = new TelluxGlobeControls(this.scene.threeScene, this.threeCamera, this.renderer.domElement)
    this.syncControlsEllipsoid()
    this.layers = new LayerManager(options.layers, (layers, change) => {
      if (change.type === 'structure') {
        this.tilesets.setImageryLayers(layers)
        this.syncControlsEllipsoid()
      } else if (change.type === 'order') {
        this.tilesets.syncImageryLayerOrder(layers)
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

    this.postProcessing = new PostProcessingManager(
      this.renderer,
      this.scene,
      this.scene.threeScene,
      this.threeCamera,
      this.atmosphere,
      () => this.camera.getCurrentHeight()
    )
    postProcessing = this.postProcessing
    if (debugSettings) {
      applyInitialDebugSettings(this, debugSettings)
    }
    this.postProcessing.applyEffects()
    this.atmosphere.loadTextures()
    this.atmosphere.updateSunDirection(this.clock.currentTime)

    this.resizeObserver = new ResizeObserver(() => {
      this.resize()
    })
    this.resizeObserver.observe(this.container)
    window.addEventListener('resize', this.handleWindowResize)
    this.resize()

    if (debugSettings) {
      this.debugSettingsPanel = new DebugSettingsPanel(this, debugSettings)
    }
    if (timelineOptions) {
      this.timeline = new Timeline(this, timelineOptions)
    }

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
   * 将经纬高转换为底层 Three.js 世界坐标。
   *
   * 输入数组顺序为 `[经度, 纬度, 高度]`；对象输入使用 `{ longitude, latitude, height }`。
   *
   * Converts cartographic coordinates to an underlying Three.js world position.
   *
   * Tuple input order is `[longitude, latitude, height]`; object input uses
   * `{ longitude, latitude, height }`.
   */
  cartographicToVector3(input: CartographicInput, target = new THREE.Vector3()) {
    const cartographic = this.resolveCartographicInput(input)
    return this.tilesets.tileset.ellipsoid.getCartographicToPosition(
      cartographic.latitude * DEG2RAD,
      cartographic.longitude * DEG2RAD,
      cartographic.height,
      target
    )
  }

  /**
   * 将经纬高和当地姿态转换为 Three.js 对象矩阵。
   *
   * 该矩阵使用适合 Three.js 对象的当地坐标框架，`+Y` 指向当地上方，
   * `+Z` 指向对象前方，适合放置 glTF 模型、marker、标签锚点和其他
   * 需要贴合地球曲面的 Three.js 对象。
   *
   * Converts cartographic coordinates and local orientation to a Three.js object
   * matrix.
   *
   * The matrix uses the local Three.js object frame: `+Y` points up and `+Z`
   * points forward. It is suitable for placing glTF models, markers, label
   * anchors, and other Three.js objects that should follow the globe surface.
   */
  cartographicToMatrix4(input: CartographicInput, options: CartographicFrameOptions = {}, target = new THREE.Matrix4()) {
    const cartographic = this.resolveCartographicInput(input)
    return this.tilesets.tileset.ellipsoid.getObjectFrame(
      cartographic.latitude * DEG2RAD,
      cartographic.longitude * DEG2RAD,
      cartographic.height,
      (options.heading ?? 0) * DEG2RAD,
      (options.pitch ?? 0) * DEG2RAD,
      (options.roll ?? 0) * DEG2RAD,
      target
    )
  }

  /**
   * 加载 glTF / GLB 模型并按经纬高加入场景。
   *
   * `type` 固定为 `gltf`，`url` 可以指向 `.gltf` 或 `.glb` 文件。
   * 当 `animate` 为 `true` 时，默认播放第一个动画通道；可通过
   * `animationChannel` 指定其他动画通道。
   *
   * Loads a glTF / GLB model and adds it to the scene at cartographic
   * coordinates.
   *
   * `type` is `gltf`; `url` can point to either a `.gltf` or `.glb` file. When
   * `animate` is `true`, the first animation channel plays by default; use
   * `animationChannel` to choose another channel.
   */
  addModel(options: AddModelOptions): ModelLayer {
    if (options.type !== 'gltf') {
      throw new Error(`Viewer: unsupported model type "${String(options.type)}".`)
    }

    const id = options.id ?? this.createModelId()
    if (this.modelLayers.has(id)) {
      throw new Error(`Viewer: model "${id}" already exists.`)
    }

    const layer = new GltfModelLayer(
      id,
      options,
      this.gltfLoader,
      this.resolveModelMaterialMode(this.scene.atmosphere.lighting.mode),
      (modelLayer) => this.removeModelLayer(modelLayer)
    )
    this.cartographicToMatrix4(options.coordinates, {
      heading: options.heading,
      pitch: options.pitch,
      roll: options.roll
    }, layer.root.matrix)
    layer.root.matrixWorldNeedsUpdate = true
    this.modelLayers.set(id, layer)
    this.scene.threeScene.add(layer.root)
    void layer.load()
    return layer
  }

  /**
   * 平滑飞行到目标，并让相机最终看向目标点。
   *
   * 经纬高点位会直接作为目标点；Three.js 模型和 3D Tiles 会自动使用包围体中心。
   * 如果传入的 3D Tiles 根数据尚未加载，Viewer 会在根 tileset 加载完成后自动执行飞行。
   *
   * Smoothly flies to a target and ends with the camera looking at it.
   *
   * Cartographic points are used directly; Three.js models and 3D Tiles
   * automatically use their bounding-volume center. If a 3D Tiles root is not
   * loaded yet, Viewer runs the flight after the root tileset finishes loading.
   */
  flyToTarget(target: FlyToTargetTarget, options: FlyToTargetOptions = {}) {
    if (this.applyTargetFlight(target, options)) return this

    if (target instanceof TilesRenderer) {
      const handleRootLoaded = () => {
        target.removeEventListener('load-root-tileset', handleRootLoaded)
        this.applyTargetFlight(target, options)
      }

      target.addEventListener('load-root-tileset', handleRootLoaded)
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
    return this.cartographicPicker.pick(position)
  }

  /**
   * 拾取屏幕位置对应的已加载 3D Tiles feature。
   *
   * 传入的坐标相对于 canvas 左上角。方法只检查当前已经加载到场景中的
   * 3D Tiles 内容，不会额外请求更高精度瓦片；未命中时返回 `null`。
   *
   * Picks the loaded 3D Tiles feature at a screen position.
   *
   * The input position is relative to the top-left corner of the canvas. The
   * method only checks 3D Tiles content currently loaded in the scene and does
   * not request more detailed tiles; returns `null` when nothing is hit.
   */
  pick3DTilesFeature(position: ScreenPosition): Picked3DTilesFeature | null {
    return this.tilesetFeaturePicker.pick(position)
  }

  /**
   * 采样指定经纬度在当前已加载内容上的表面高度。
   *
   * 方法沿当地地表法线向下发射射线，只使用当前已经加载到场景中的地形和
   * 3D Tiles。视角外或尚未加载的瓦片不会被额外请求；未命中时返回
   * `undefined`。
   *
   * Samples the surface height at cartographic coordinates from currently
   * loaded content.
   *
   * The method casts a ray downward along the local surface normal and only
   * uses terrain and 3D Tiles already loaded in the scene. Tiles outside the
   * current view or not yet loaded are not requested; returns `undefined` when
   * no surface is hit.
   */
  sampleHeight(position: CartographicInput, options: SampleHeightOptions = {}) {
    return this.heightSampler.sampleHeight(position, options)
  }

  /**
   * 以更高精度异步采样经纬度数组的表面高度。
   *
   * 地形模式会直接按 quantized-mesh availability 加载最高可用层级并插值高度。
   * 3D Tiles 或混合模式会优先在主场景 tileset 上临时添加局部加载区域，
   * 让采样区域的瓦片细化后再 raycast；这样采样完成后，该区域也会保留在
   * 主场景缓存中。必要时会退回到采样专用 tileset。
   *
   * 当 {@link Viewer.useDefaultRenderLoop} 为 `false` 时，需要继续调用
   * {@link Viewer.render} 推进采样任务。
   *
   * Asynchronously samples surface heights for an array of cartographic
   * coordinate tuples with higher detail.
   *
   * Terrain mode loads the most detailed available quantized-mesh tiles directly
   * from terrain availability and interpolates height. 3D Tiles and mixed modes
   * first add temporary local load regions to the scene tilesets, refine the
   * sampling area, and then raycast; the loaded region remains warm in the scene
   * cache. A sampling-only tileset path is kept as a fallback.
   *
   * When {@link Viewer.useDefaultRenderLoop} is `false`, continue calling
   * {@link Viewer.render} to advance pending sampling tasks.
   */
  async sampleHeightMostDetailed(
    positions: CartographicCoordinateTuple[],
    options: SampleHeightMostDetailedOptions = {}
  ): Promise<SampleHeightMostDetailedResult[]> {
    return this.heightSampler.sampleHeightMostDetailed(positions, options)
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
    const deltaTime = this.previousTime === 0 ? 0 : (time - this.previousTime) / 1000
    this.previousTime = time

    this.clearFrameBuffer()
    this.clock.tick(deltaTime)
    this.postProcessing.setDeltaTime(deltaTime)
    this.resize()
    this.controls.update()
    this.debugSettingsPanel?.update(deltaTime, time)
    this.timeline?.update(deltaTime)
    const currentHeight = this.syncFallbackAmbientLight()
    this.postProcessing.updateForCameraHeight(currentHeight)
    this.tilesets.update()
    this.atmosphere.updateLightSources()
    this.updateModelLayers(deltaTime)
    this.renderer.render(this.scene.threeScene, this.threeCamera)
    this.scheduleHeightSamplingUpdate()
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
    if (this.heightSamplingUpdateFrameId !== 0) {
      cancelAnimationFrame(this.heightSamplingUpdateFrameId)
      this.heightSamplingUpdateFrameId = 0
      this.isHeightSamplingUpdateScheduled = false
    }
    window.removeEventListener('resize', this.handleWindowResize)
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('pointerdown', this.handleCameraInteraction)
    this.renderer.domElement.removeEventListener('wheel', this.handleCameraInteraction)
    this.renderer.domElement.removeEventListener('pointerdown', this.enableAdjustHeight)
    this.renderer.domElement.removeEventListener('wheel', this.enableAdjustHeight)
    this.renderer.domElement.removeEventListener('click', this.handleCanvasClick)
    this.renderer.domElement.removeEventListener('mousemove', this.handleCanvasMouseMove)
    this.clearEventListeners()
    this.clearModelLayers()
    this.debugSettingsPanel?.dispose()
    this.timeline?.dispose()
    this.heightSampler.dispose()

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

  private scheduleHeightSamplingUpdate() {
    if (
      this.isDestroyed ||
      this.isHeightSamplingUpdateScheduled ||
      !this.heightSampler.hasPendingMostDetailedSampling
    ) {
      return
    }

    this.isHeightSamplingUpdateScheduled = true
    this.heightSamplingUpdateFrameId = requestAnimationFrame(() => {
      this.isHeightSamplingUpdateScheduled = false
      this.heightSamplingUpdateFrameId = 0
      if (this.isDestroyed) return

      this.heightSampler.updateMostDetailedSampling()
    })
  }

  private resolveSettingPanelOptions(options: ViewerWidgetOptions['settingPanel']): DebugSettingsPanelOptions | null {
    if (!options) return null

    const storedSettings = loadStoredDebugSettings()
    if (options === true) return storedSettings

    return {
      ...options,
      ...storedSettings
    }
  }

  private resolveTimelineOptions(options: ViewerWidgetOptions['timeline']): TimelineOptions | null {
    if (!options) return null
    return options === true ? {} : options
  }

  private resolveWidgetOptions(options: ViewerOptions): ViewerWidgetOptions {
    return options.widgets ?? {}
  }

  private clearFrameBuffer() {
    const renderTarget = this.renderer.getRenderTarget()
    this.renderer.setRenderTarget(null)
    this.renderer.clear(true, true, true)
    this.renderer.setRenderTarget(renderTarget)
  }

  private resolveSceneOptions(options: ViewerOptions['scene']): ResolvedSceneOptions {
    const atmosphereLightingMode = options?.atmosphere?.lighting?.mode ?? 'light-source'

    return {
      atmosphere: {
        show: options?.atmosphere?.show ?? true,
        lighting: {
          mode: atmosphereLightingMode,
          sunLight: options?.atmosphere?.lighting?.sunLight ?? true,
          skyLight: options?.atmosphere?.lighting?.skyLight ?? true,
          sunLightIntensity: options?.atmosphere?.lighting?.sunLightIntensity ?? 1,
          skyLightIntensity: options?.atmosphere?.lighting?.skyLightIntensity ?? 1,
          albedoScale: options?.atmosphere?.lighting?.albedoScale ?? 1
        },
        scattering: {
          transmittance: options?.atmosphere?.scattering?.transmittance ?? true,
          inscatter: options?.atmosphere?.scattering?.inscatter ?? true,
          intensity: options?.atmosphere?.scattering?.intensity ?? 0.6,
          horizonBlend: options?.atmosphere?.scattering?.horizonBlend ?? true,
          horizonRange: options?.atmosphere?.scattering?.horizonRange ?? [0, 0.6],
          correctAltitude: options?.atmosphere?.scattering?.correctAltitude ?? true,
          correctGeometricError: options?.atmosphere?.scattering?.correctGeometricError ?? true,
          solarIrradianceScale: options?.atmosphere?.scattering?.solarIrradianceScale ?? 1,
          rayleighScatteringScale: options?.atmosphere?.scattering?.rayleighScatteringScale ?? 1,
          mieScatteringScale: options?.atmosphere?.scattering?.mieScatteringScale ?? 1,
          mieExtinctionScale: options?.atmosphere?.scattering?.mieExtinctionScale ?? 1,
          miePhaseFunctionG: options?.atmosphere?.scattering?.miePhaseFunctionG ?? 0.8,
          absorptionExtinctionScale: options?.atmosphere?.scattering?.absorptionExtinctionScale ?? 1,
          groundAlbedo: options?.atmosphere?.scattering?.groundAlbedo ?? 0.1
        },
        sky: {
          stars: options?.atmosphere?.sky?.stars ?? true,
          starsIntensity: options?.atmosphere?.sky?.starsIntensity ?? 1,
          starsPointSize: options?.atmosphere?.sky?.starsPointSize ?? 1,
          sun: options?.atmosphere?.sky?.sun ?? true,
          moon: options?.atmosphere?.sky?.moon ?? true,
          ground: options?.atmosphere?.sky?.ground ?? true,
          sunAngularRadius: options?.atmosphere?.sky?.sunAngularRadius ?? 0.004675,
          moonAngularRadius: options?.atmosphere?.sky?.moonAngularRadius ?? 0.0045,
          lunarRadianceScale: options?.atmosphere?.sky?.lunarRadianceScale ?? 1
        },
        shadow: {
          radius: options?.atmosphere?.shadow?.radius ?? 3,
          sampleCount: options?.atmosphere?.shadow?.sampleCount ?? 8
        },
        fallbackAmbientLight: {
          show: options?.atmosphere?.fallbackAmbientLight?.show ?? true,
          intensity: options?.atmosphere?.fallbackAmbientLight?.intensity ?? 0.5
        }
      },
      clouds: {
        show: options?.clouds?.show ?? true,
        quality: options?.clouds?.quality,
        coverage: options?.clouds?.coverage ?? 0.3,
        speed: options?.clouds?.speed ?? 0.001,
        layer: {
          altitude: options?.clouds?.layer?.altitude ?? 1500,
          height: options?.clouds?.layer?.height ?? 650
        }
      },
      surface: {
        materialMode: options?.surface?.materialMode ?? 'auto'
      },
      postProcess: {
        lensFlare: options?.postProcess?.lensFlare ?? true,
        smaa: options?.postProcess?.smaa ?? true,
        dithering: options?.postProcess?.dithering ?? false,
        toneMappingExposure: options?.postProcess?.toneMappingExposure ?? 10
      }
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

  private syncFallbackAmbientLight() {
    this.threeCamera.updateMatrix()
    const cartographic = this.tilesets.tileset.ellipsoid.getCartographicFromObjectFrame(
      this.threeCamera.matrix,
      this.cameraCartographicScratch,
      CAMERA_FRAME
    )
    this.scene.updateFallbackAmbientLight(cartographic.height)
    return cartographic.height
  }

  private updateModelLayers(deltaTime: number) {
    this.modelLayers.forEach((layer) => {
      layer.update(deltaTime)
    })
  }

  private removeModelLayer(layer: GltfModelLayer) {
    this.modelLayers.delete(layer.id)
    this.scene.threeScene.remove(layer.root)
  }

  private clearModelLayers() {
    Array.from(this.modelLayers.values()).forEach((layer) => {
      layer.remove()
    })
    this.modelLayers.clear()
  }

  private createModelId() {
    do {
      this.nextModelId += 1
    } while (this.modelLayers.has(`model-${this.nextModelId}`))

    return `model-${this.nextModelId}`
  }

  private resolveCartographicInput(input: CartographicInput): CartographicCoordinates {
    if (Array.isArray(input)) {
      return {
        longitude: input[0],
        latitude: input[1],
        height: input[2] ?? 0
      }
    }

    return {
      longitude: input.longitude,
      latitude: input.latitude,
      height: input.height
    }
  }

  private applyTargetFlight(target: FlyToTargetTarget, options: FlyToTargetOptions) {
    const resolvedTarget = this.resolveFlyToTarget(target)
    if (!resolvedTarget) return false

    const ellipsoid = this.tilesets.tileset.ellipsoid
    const targetCartographic = ellipsoid.getPositionToCartographic(
      resolvedTarget.center,
      this.flyToTargetCartographicScratch
    )
    const distance = options.distance ?? Math.max(resolvedTarget.radius * 2.8, 500)
    const heading = options.heading ?? 0
    const pitch = options.pitch ?? -30
    const roll = options.roll ?? 0

    ellipsoid.getEastNorthUpAxes(
      targetCartographic.lat,
      targetCartographic.lon,
      this.flyToTargetEast,
      this.flyToTargetNorth,
      this.flyToTargetUp
    )

    this.flyToTargetDirection
      .copy(this.flyToTargetEast)
      .multiplyScalar(Math.sin(heading * DEG2RAD) * Math.cos(pitch * DEG2RAD))
      .addScaledVector(this.flyToTargetNorth, Math.cos(heading * DEG2RAD) * Math.cos(pitch * DEG2RAD))
      .addScaledVector(this.flyToTargetUp, Math.sin(pitch * DEG2RAD))
      .normalize()

    this.flyToTargetCamera.position
      .copy(resolvedTarget.center)
      .addScaledVector(this.flyToTargetDirection, -Math.max(distance, 1))
    this.flyToTargetCamera.up.copy(this.flyToTargetUp)
    this.flyToTargetCamera.lookAt(resolvedTarget.center)
    this.flyToTargetCamera.rotateZ(roll * DEG2RAD)
    this.flyToTargetCamera.updateMatrixWorld(true)

    const cameraCartographic = ellipsoid.getCartographicFromObjectFrame(
      this.flyToTargetCamera.matrixWorld,
      this.flyToTargetCartographicScratch,
      CAMERA_FRAME
    )

    this.camera.flyTo({
      destination: {
        latitude: cameraCartographic.lat * RAD2DEG,
        longitude: cameraCartographic.lon * RAD2DEG,
        height: cameraCartographic.height
      },
      orientation: {
        heading: cameraCartographic.azimuth * RAD2DEG,
        pitch: cameraCartographic.elevation * RAD2DEG,
        roll: cameraCartographic.roll * RAD2DEG
      },
      duration: options.duration,
      maximumHeight: options.maximumHeight,
      complete: options.complete,
      cancel: options.cancel,
      easingFunction: options.easingFunction
    })
    return true
  }

  private resolveFlyToTarget(target: FlyToTargetTarget) {
    if (target instanceof TilesRenderer) {
      target.group.updateMatrixWorld(true)
      if (!target.getBoundingBox(this.flyToTargetBox)) return null

      this.flyToTargetCenter
        .copy(this.flyToTargetBox.getCenter(this.flyToTargetCenter))
        .applyMatrix4(target.group.matrixWorld)
      this.flyToTargetBox.getBoundingSphere(this.flyToTargetSphere)
      return {
        center: this.flyToTargetCenter,
        radius: Math.max(this.flyToTargetSphere.radius * target.group.matrixWorld.getMaxScaleOnAxis(), 1)
      }
    }

    if (target instanceof THREE.Object3D) {
      target.updateMatrixWorld(true)
      this.flyToTargetBox.setFromObject(target)
      if (this.flyToTargetBox.isEmpty()) return null

      this.flyToTargetBox.getCenter(this.flyToTargetCenter)
      this.flyToTargetBox.getBoundingSphere(this.flyToTargetSphere)
      return {
        center: this.flyToTargetCenter,
        radius: Math.max(this.flyToTargetSphere.radius, 1)
      }
    }

    this.tilesets.tileset.ellipsoid.getCartographicToPosition(
      target.latitude * DEG2RAD,
      target.longitude * DEG2RAD,
      target.height,
      this.flyToTargetCenter
    )
    return {
      center: this.flyToTargetCenter,
      radius: 1
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

  private resolveSurfaceMaterialMode(
    surfaceMaterialMode: SurfaceMaterialMode,
    atmosphereLightingMode: AtmosphereLightingMode
  ): ResolvedSurfaceMaterialMode {
    if (surfaceMaterialMode !== 'auto') return surfaceMaterialMode
    return atmosphereLightingMode === 'light-source' ? 'standard' : 'basic'
  }

  private syncSurfaceMaterialMode() {
    this.tilesets.setSurfaceMaterialMode(
      this.resolveSurfaceMaterialMode(this.scene.surface.materialMode, this.scene.atmosphere.lighting.mode)
    )
    const contentMaterialMode = this.resolveSceneContentMaterialMode(this.scene.atmosphere.lighting.mode)
    this.tilesets.setSceneTilesetMaterialMode(contentMaterialMode)
    const modelMaterialMode = this.resolveModelMaterialMode(this.scene.atmosphere.lighting.mode)
    this.modelLayers.forEach((layer) => {
      layer.setMaterialMode(modelMaterialMode)
    })
  }

  private resolveSceneContentMaterialMode(atmosphereLightingMode: AtmosphereLightingMode): SceneTilesetMaterialMode {
    return atmosphereLightingMode === 'post-process' ? 'basic' : 'standard'
  }

  private resolveModelMaterialMode(atmosphereLightingMode: AtmosphereLightingMode): ModelMaterialMode {
    return atmosphereLightingMode === 'post-process' ? 'basic' : 'standard'
  }

  private static resolveContainer(container: HTMLElement | string) {
    if (typeof container !== 'string') return container

    const element = document.getElementById(container)
    if (!element) {
      throw new Error(`Tellux Viewer container element with id "${container}" was not found.`)
    }

    return element
  }
}
