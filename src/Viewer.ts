import * as THREE from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Camera } from './Camera'
import { Clock } from './Clock'
import { EntityManager } from './entities/EntityManager'
import { EntityRenderManager } from './entities/EntityRenderManager'
import { SymbolOcclusionPass } from './entities/SymbolOcclusionPass'
import { setToneMappingState } from './entities/invertToneMapping'
import { CAMERA_FRAME, DEG2RAD } from './constants'
import { telluxConfig } from './config'
import { TargetFlightController } from './controls/TargetFlightController'
import { TelluxGlobeControls } from './controls/TelluxGlobeControls'
import { ViewerInteractionManager } from './controls/ViewerInteractionManager'
import { LayerManager } from './LayerManager'
import { ModelManager } from './models/ModelManager'
import { AtmosphereManager } from './rendering/AtmosphereManager'
import { PostProcessingManager } from './rendering/PostProcessingManager'
import { GroundClampPass } from './rendering/GroundClampPass'
import {
  createRendererAdapter,
  type TelluxRenderer,
  type TelluxRendererAdapter,
  type TelluxWebGLRenderer,
  type TelluxWebGPURenderer
} from './rendering/RendererAdapter'
import { ViewportResizeManager } from './rendering/ViewportResizeManager'
import { ViewerRenderLoop } from './rendering/ViewerRenderLoop'
import { WebGPUAtmosphereManager } from './rendering/WebGPUAtmosphereManager'
import { CartographicPicker } from './sampling/CartographicPicker'
import { EntityPicker } from './sampling/EntityPicker'
import { HeightSampler } from './sampling/HeightSampler'
import { TilesetFeaturePicker } from './sampling/TilesetFeaturePicker'
import { Scene } from './Scene'
import { TilesetManager } from './tiles/TilesetManager'
import {
  resolveModelMaterialMode,
  resolveSceneContentMaterialMode,
  resolveSurfaceMaterialMode,
  resolveViewerCameraOptions,
  resolveViewerResolutionScale,
  resolveViewerSceneOptions
} from './ViewerOptionsResolver'
import { WidgetManager } from './widgets/WidgetManager'
import type {
  AddModelOptions,
  CartographicFrameOptions,
  CartographicCoordinates,
  CartographicCoordinateTuple,
  CartographicHeightTuple,
  CartographicInput,
  FlyToTargetOptions,
  FlyToTargetTarget,
  Load3DTilesetOptions,
  ModelLayer,
  PickEntityOptions,
  Picked3DTilesFeature,
  PickedEntity,
  SampleHeightMostDetailedOptions,
  SampleHeightMostDetailedResult,
  SampleHeightOptions,
  ScreenPosition,
  TilesetLayer,
  ViewerEventListener,
  ViewerEventMap,
  ViewerOptions,
  ViewerRendererType
} from './types'
import type { GlobeControls } from '3d-tiles-renderer'

export { Camera } from './Camera'
export { Clock } from './Clock'
export { Entity, type EntityContext } from './entities/Entity'
export {
  PointGraphics,
  PolylineGraphics,
  PolygonGraphics,
  SymbolGraphics,
  IconGraphics,
  TextGraphics
} from './entities/EntityGraphics'
export {
  preloadFontMsdfAtlas,
  setMsdfAtlasForFont,
  disposeGlyphAtlases,
  type GlyphTextConfig,
  type GlyphTextRun
} from './entities/GlyphAtlas'
export type { MsdfAtlas, MsdfAtlasData, MsdfGlyphMetrics } from './entities/MsdfAtlasLoader'
export { loadMsdfAtlas, disposeMsdfAtlas } from './entities/MsdfAtlasLoader'
export { EntityManager, type EntityManagerOptions } from './entities/EntityManager'
export { ImageryLayer, LayerManager } from './LayerManager'
export { Scene } from './Scene'
export { SpringControl, type SpringControlOptions } from './SpringControl'
export { telluxConfig, type TelluxConfig } from './config'
export { AtmosphereLightingMode } from './types'
export { DebugSettingsPanel, Timeline, type DebugSettingsPanelOptions, type TimelineOptions } from './widgets'
export type { TelluxRenderer, TelluxWebGLRenderer, TelluxWebGPURenderer } from './rendering/RendererAdapter'
export type {
  CameraEllipsoid,
  CameraEllipsoidProvider,
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
  CesiumIonTerrainOptions,
  TiandituTerrainOptions,
  CesiumIon3DTilesetOptions,
  CesiumIonImagerySourceOptions,
  EntityTransparencyMode,
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
  GltfModelMaterialMode,
  GltfModelOptions,
  ColorInput,
  EntityOptions,
  PointOptions,
  PolylineOptions,
  PolygonOptions,
  SymbolOptions,
  IconOptions,
  TextOptions,
  SymbolAnchor,
  SymbolTextRelative,
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
  PickEntityOptions,
  PickedEntity,
  ScreenPosition,
  SampleHeightMostDetailedOptions,
  SampleHeightMostDetailedResult,
  SampleHeightOptions,
  TerrainRenderOptions,
  TerrainOptions,
  TerrainTileLoadingOptions,
  Scene3DTileLoadingOptions,
  ThreeDTilesRenderOptions,
  ViewerSurfaceMaterialOptions,
  SurfaceMaterialMode,
  TilesetFeatureProperties,
  TilesetLayer,
  Url3DTilesetOptions,
  UrlTerrainOptions,
  ViewerClickEvent,
  ViewerEvent,
  ViewerEventListener,
  ViewerEventMap,
  ViewerMouseEvent,
  ViewerMouseMoveEvent,
  ViewerAtmosphereLightingOptions,
  ViewerAtmosphereNightOptions,
  ViewerAtmosphereOptions,
  ViewerAtmosphereScatteringOptions,
  ViewerAtmosphereShadowOptions,
  ViewerAtmosphereSkyOptions,
  ViewerCloudLayerOptions,
  ViewerCloudOptions,
  ViewerEntityOptions,
  ViewerEntityTransparencyOptions,
  ViewerFallbackAmbientLightOptions,
  ViewerPostProcessOptions,
  ViewerRendererOptions,
  ViewerRendererType,
  ViewerSceneOptions,
  ViewerSurfaceOptions,
  ViewerWidgetOptions,
  ViewerOptions,
  WMSImagerySourceOptions,
  WMTSImagerySourceOptions,
  WMTSTileMatrix,
  XYZImagerySourceOptions
} from './types'

type ViewerAtmosphereManager = AtmosphereManager | WebGPUAtmosphereManager

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
  readonly renderer: TelluxRenderer
  /**
   * Viewer 使用的 renderer 类型。
   *
   * Renderer type used by Viewer.
   */
  readonly rendererType: ViewerRendererType
  /**
   * Renderer 初始化完成 Promise。
   *
   * WebGPU renderer 需要异步初始化。使用外部手动渲染循环时，建议等待该
   * Promise 完成后再调用 {@link Viewer.render}。
   *
   * Promise resolved when the renderer is initialized.
   *
   * WebGPU renderers require asynchronous initialization. When using an external
   * manual render loop, wait for this Promise before calling {@link Viewer.render}.
   */
  readonly ready: Promise<void>
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
  readonly controls: TelluxGlobeControls

  /**
   * 实体集合管理器，用于运行时添加、查询和移除点、线、面实体。
   *
   * Entity collection manager, used to add, query and remove point, polyline
   * and polygon entities at runtime.
   */
  get entities() {
    return this.entitiesManager
  }

  private readonly threeCamera: THREE.PerspectiveCamera
  private readonly rendererAdapter: TelluxRendererAdapter
  private readonly dracoLoader: DRACOLoader
  private readonly transparentOverlayTexture: THREE.CanvasTexture
  private readonly cameraCartographicScratch = { lat: 0, lon: 0, height: 0, azimuth: 0, elevation: 0, roll: 0 }
  private readonly gltfLoader: GLTFLoader
  private readonly models: ModelManager
  private readonly entitiesManager: EntityManager
  private readonly entityRenderManager: EntityRenderManager
  private readonly symbolOcclusionPass: SymbolOcclusionPass | null
  private readonly groundClampPass: GroundClampPass | null
  private readonly viewport: ViewportResizeManager
  private readonly atmosphere: ViewerAtmosphereManager | null
  private readonly postProcessing: PostProcessingManager | null
  private readonly tilesets: TilesetManager
  private readonly cartographicPicker: CartographicPicker
  private readonly tilesetFeaturePicker: TilesetFeaturePicker
  private readonly entityPicker: EntityPicker
  private readonly heightSampler: HeightSampler
  private readonly targetFlights: TargetFlightController
  private readonly interactions: ViewerInteractionManager
  private readonly widgets: WidgetManager
  private readonly renderLoop: ViewerRenderLoop
  private isDestroyed = false
  private currentResolutionScale: number
  private currentToneMappingExposure: number

  /**
   * 创建 Viewer 并等待 renderer 初始化完成。
   *
   * WebGPU renderer 需要异步初始化；该工厂方法适合 WebGPU 或外部手动渲染循环。
   *
   * Creates a Viewer and waits for renderer initialization.
   *
   * WebGPU renderers require asynchronous initialization; this factory is useful
   * for WebGPU or external manual render loops.
   */
  static async create(container: HTMLElement | string, options: ViewerOptions = {}) {
    const viewer = new Viewer(container, options)
    await viewer.ready
    return viewer
  }

  /**
   * 在非空容器元素内创建 viewer。传入字符串时，会将其作为元素 ID 获取容器。
   *
   * Creates a viewer inside a non-empty container element. When a string is
   * provided, it is treated as an element ID and resolved with `getElementById`.
   */
  constructor(container: HTMLElement | string, options: ViewerOptions = {}) {
    const resolvedContainer = Viewer.resolveContainer(container)
    this.container = resolvedContainer
    this.currentResolutionScale = resolveViewerResolutionScale(options)
    const sceneOptions = resolveViewerSceneOptions(options.scene)
    this.currentToneMappingExposure = sceneOptions.postProcess.toneMappingExposure

    const width = resolvedContainer.clientWidth || 1
    const height = resolvedContainer.clientHeight || 1
    const cameraOptions = resolveViewerCameraOptions(options.camera)
    let atmosphere: ViewerAtmosphereManager | null = null
    let postProcessing: PostProcessingManager | null = null
    let tilesets: TilesetManager | null = null

    this.threeCamera = new THREE.PerspectiveCamera(cameraOptions.fov, width / height, cameraOptions.near, cameraOptions.far)
    this.camera = new Camera(this.threeCamera, () => tilesets?.tileset.ellipsoid ?? null)
    this.rendererAdapter = createRendererAdapter(options)
    this.renderer = this.rendererAdapter.renderer
    this.rendererType = this.rendererAdapter.type
    this.ready = this.rendererAdapter.ready
    this.rendererAdapter.setPixelRatio(this.currentResolutionScale)
    this.rendererAdapter.setSize(width, height)
    this.renderer.toneMapping = THREE.AgXToneMapping
    this.renderer.toneMappingExposure = this.currentToneMappingExposure
    // 同步色调映射状态给实体颜色反求，使实体颜色在 setEffects 后处理管线下仍能"所见即所得"。
    // Sync tone-mapping state for entity color inversion so entity colors stay
    // WYSIWYG under the setEffects post-processing pipeline.
    setToneMappingState(this.renderer.toneMapping, this.renderer.toneMappingExposure)
    resolvedContainer.appendChild(this.renderer.domElement)
    this.transparentOverlayTexture = this.createTransparentOverlayTexture()

    this.scene = new Scene(
      sceneOptions,
      (state) => atmosphere?.applyAtmosphereState(state),
      (state) => atmosphere?.applyCloudsState(state),
      () => {
        postProcessing?.applyEffects()
        if (atmosphere instanceof WebGPUAtmosphereManager) {
          atmosphere.setAtmosphereVisible(this.scene.atmosphere.show)
        }
      },
      () => {
        if (tilesets) this.syncSurfaceMaterialMode()
      }
    )
    this.atmosphere = this.createAtmosphereManager(() => postProcessing?.applyEffects())
    atmosphere = this.atmosphere
    this.atmosphere?.addLightSourcesTo(this.scene.threeScene)
    this.scene.syncRuntimeEffects()
    this.clock = new Clock(() => this.atmosphere?.updateSunDirection(this.clock.currentTime))

    this.dracoLoader = new DRACOLoader()
    this.dracoLoader.setDecoderPath(options.dracoDecoderPath ?? '/draco/gltf/')
    this.gltfLoader = new GLTFLoader()
    this.gltfLoader.setDRACOLoader(this.dracoLoader)

    this.tilesets = new TilesetManager({
      scene: this.scene.threeScene,
      camera: this.threeCamera,
      renderer: this.renderer,
      useWebGPUCompatibleSurfaceOverlay: this.rendererType === 'webgpu',
      dracoLoader: this.dracoLoader,
      transparentOverlayTexture: this.transparentOverlayTexture,
      terrain: options.terrain,
      surfaceMaterialMode: resolveSurfaceMaterialMode(
        sceneOptions.surface.materialMode,
        sceneOptions.atmosphere.lighting.mode
      ),
      surfaceMaterialOptions: sceneOptions.surface.material,
      sceneTilesetMaterialMode: resolveSceneContentMaterialMode(sceneOptions.atmosphere.lighting.mode)
    })
    tilesets = this.tilesets
    this.cartographicPicker = new CartographicPicker(this.renderer.domElement, this.threeCamera, this.tilesets)
    this.tilesetFeaturePicker = new TilesetFeaturePicker(this.renderer.domElement, this.threeCamera, this.tilesets)
    this.heightSampler = new HeightSampler(this.tilesets, (input) => this.resolveCartographicInput(input))
    // 贴地分类 pass 仅 WebGL（依赖 setEffects 深度纹理链）；WebGPU 下为 null。
    this.groundClampPass = this.rendererAdapter.supportsWebGLEffects
      ? new GroundClampPass(this.threeCamera)
      : null
    this.entitiesManager = new EntityManager({
      scene: this.scene.threeScene,
      toVector3: (input, target) => this.cartographicToVector3(input, target),
      ellipsoid: () => this.tilesets.tileset.ellipsoid,
      groundClamp: this.groundClampPass
        ? { root: this.groundClampPass.root, uniforms: this.groundClampPass.sharedUniforms }
        : null,
      pixelRatio: () => this.currentResolutionScale
    })
    this.entityRenderManager = new EntityRenderManager({
      root: this.entitiesManager.root,
      camera: this.threeCamera,
      requestedMode: sceneOptions.entities.transparency.mode,
      supportsWeightedOit: this.rendererAdapter.supportsWebGLEffects
    })
    this.symbolOcclusionPass = this.rendererAdapter.supportsWebGLEffects
      ? new SymbolOcclusionPass(this.entitiesManager.root, this.threeCamera)
      : null
    this.entityPicker = new EntityPicker(this.renderer.domElement, this.threeCamera, this.entitiesManager)
    this.targetFlights = new TargetFlightController({
      camera: this.camera,
      tilesets: this.tilesets
    })
    this.viewport = new ViewportResizeManager({
      container: this.container,
      camera: this.threeCamera,
      renderer: this.rendererAdapter,
      tilesets: this.tilesets
    })
    this.camera.setView(cameraOptions)

    const controls = new TelluxGlobeControls(this.scene.threeScene, this.threeCamera, this.renderer.domElement)
    if (this.rendererType === 'webgpu') {
      controls.useWebGPUCompatiblePivotMaterial()
    }
    this.controls = controls
    this.syncControlsEllipsoid()
    this.layers = new LayerManager(options.layers, (layers, change) => {
      if (change.type === 'structure') {
        this.cancelMostDetailedHeightSampling()
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
    // 注入相机 pitch 读取：低角度禁拖判定用应用自身的俯仰源（Cesium 约定）。
    // Inject the camera-pitch reader so the low-angle no-drag test uses the app's own pitch
    // source (Cesium convention).
    this.controls.pitchProvider = () => this.camera.getPitch()
    // 注入飞行状态：相机 flyTo 期间禁止闲置 pitch 回弹，避免与飞行动画争抢相机控制。
    // Inject flight state so the idle pitch spring-back stays out of the way during flyTo
    // animations and doesn't fight them for camera control.
    this.controls.isFlyingProvider = () => this.camera.isFlying
    // viewer.camera.allowUnderground 变化时实时同步控件的离地约束（防穿地开关）。
    // Sync the controls' ground-clamp constraint live when viewer.camera.allowUnderground changes.
    this.camera.onAllowUndergroundChange = (value) => {
      this.controls.adjustHeight = !value
    }
    this.interactions = new ViewerInteractionManager({
      viewer: this,
      camera: this.camera,
      controls: this.controls,
      domElement: this.renderer.domElement,
      pickCartographic: (position) => this.pickCartographic(position),
      pick3DTilesFeature: (position) => this.pick3DTilesFeature(position),
      pickEntities: (position, pickOptions) => this.pickEntities(position, pickOptions)
    })

    this.postProcessing = this.rendererAdapter.supportsWebGLEffects && this.atmosphere
      ? new PostProcessingManager(
          this.renderer as TelluxWebGLRenderer,
          this.scene,
          this.scene.threeScene,
          this.threeCamera,
          this.atmosphere as AtmosphereManager,
          () => this.camera.getCurrentHeight(),
          this.entityRenderManager.mode === 'weighted-oit' ? this.entityRenderManager : undefined,
          this.groundClampPass ?? undefined,
          this.symbolOcclusionPass ?? undefined
        )
      : null
    postProcessing = this.postProcessing
    this.models = new ModelManager({
      scene: this.scene.threeScene,
      loader: this.gltfLoader,
      getMaterialMode: () => resolveModelMaterialMode(this.scene.atmosphere.lighting.mode),
      applyModelMatrix: (modelOptions, target) => {
        this.cartographicToMatrix4(modelOptions.coordinates, {
          heading: modelOptions.heading,
          pitch: modelOptions.pitch,
          roll: modelOptions.roll
        }, target)
      },
      setPostProcessMaterialLights: (enabled) => {
        this.atmosphere?.setPostProcessMaterialLights(enabled)
      }
    })
    this.widgets = new WidgetManager(this, options.widgets)
    this.widgets.applyInitialSettings()
    this.renderLoop = new ViewerRenderLoop({
      renderer: this.rendererAdapter,
      heightSampler: this.heightSampler,
      renderFrame: (deltaTime, time) => this.renderFrame(deltaTime, time)
    })
    this.postProcessing?.applyEffects()
    this.atmosphere?.loadTextures()
    this.atmosphere?.updateSunDirection(this.clock.currentTime)

    this.resize()

    this.widgets.mount()

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
    return this.renderLoop.useDefaultRenderLoop
  }

  set useDefaultRenderLoop(value: boolean) {
    this.renderLoop.useDefaultRenderLoop = value
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
    this.rendererAdapter.setPixelRatio(value)
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
    setToneMappingState(this.renderer.toneMapping, value)
  }

  /**
   * 注册 Viewer 事件监听函数。
   *
   * Registers a Viewer event listener.
   */
  on<T extends keyof ViewerEventMap>(type: T, listener: ViewerEventListener<T>) {
    this.interactions.on(type, listener)
    return this
  }

  /**
   * 移除 Viewer 事件监听函数。
   *
   * Removes a Viewer event listener.
   */
  off<T extends keyof ViewerEventMap>(type: T, listener: ViewerEventListener<T>) {
    this.interactions.off(type, listener)
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
    return this.models.add(options)
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
    this.targetFlights.flyToTarget(target, options)
    return this
  }

  /**
   * 运行时切换 Cesium quantized-mesh 地形或 Cesium Ion 地形，并保留当前影像、相机、控制器和渲染器状态。
   *
   * 传入 `null` 可移除当前地形并回到无地形模式。
   *
   * Switches Cesium quantized-mesh terrain or Cesium Ion terrain at runtime while
   * preserving the current imagery, camera, controls, and renderer state.
   *
   * Pass `null` to remove the current terrain and return to the non-terrain mode.
   */
  setTerrain(terrain: ViewerOptions['terrain'] | null) {
    this.cancelMostDetailedHeightSampling()
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
    return this.wrapTilesetLayer(this.tilesets.load3DTileset(options))
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
    this.cancelMostDetailedHeightSampling()
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
   * 拾取屏幕位置对应的最佳实体。
   *
   * 传入的坐标相对于 canvas 左上角。`options.tolerance` 可扩大点和线实体的屏幕空间拾取范围，
   * 单位为 CSS 像素。返回值等同于 {@link Viewer.pickEntities} 的第一个结果；未命中任何实体时返回 `null`。
   *
   * Picks the best entity at a screen position.
   *
   * The input position is relative to the top-left corner of the canvas.
   * `options.tolerance` expands point and polyline screen-space picking in CSS
   * pixels. The return value is equivalent to the first result from
   * {@link Viewer.pickEntities}; returns `null` when no entity is hit.
   */
  pickEntity(position: ScreenPosition, options: PickEntityOptions = {}): PickedEntity | null {
    return this.entityPicker.pick(position, options)
  }

  /**
   * 拾取屏幕位置对应的实体列表。
   *
   * 传入的坐标相对于 canvas 左上角。`options.tolerance` 可扩大点和线实体的屏幕空间拾取范围，
   * 单位为 CSS 像素。结果按距离从近到远排序，未命中任何实体时返回空数组。
   *
   * Picks entities at a screen position.
   *
   * The input position is relative to the top-left corner of the canvas.
   * `options.tolerance` expands point and polyline screen-space picking in CSS
   * pixels. Results are sorted nearest first; returns an empty array when no
   * entity is hit.
   */
  pickEntities(position: ScreenPosition, options: PickEntityOptions = {}): PickedEntity[] {
    return this.entityPicker.pickEntities(position, options)
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
    if (!this.rendererAdapter.hasInitialized()) return 0
    return this.renderLoop.render(time)
  }

  /**
   * 将渲染器和相机尺寸同步到容器尺寸。
   *
   * Resizes the renderer and camera to match the container.
   */
  resize() {
    this.viewport.resize()
    this.entitiesManager.syncResolution(
      this.renderer.domElement.width,
      this.renderer.domElement.height,
      this.currentResolutionScale
    )
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
    this.renderLoop.dispose()
    this.viewport.dispose()
    this.interactions.dispose()
    this.models.dispose()
    this.entityRenderManager.dispose()
    this.symbolOcclusionPass?.dispose()
    this.entitiesManager.dispose()
    this.groundClampPass?.dispose()
    this.widgets.dispose()
    this.heightSampler.dispose()
    this.targetFlights.dispose()

    this.postProcessing?.dispose()
    this.atmosphere?.dispose()
    this.transparentOverlayTexture.dispose()
    this.tilesets.dispose()
    this.controls.dispose()
    this.dracoLoader.dispose()
    this.rendererAdapter.dispose()

    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement)
    }
  }

  private renderFrame(deltaTime: number, time: number) {
    this.clearFrameBuffer()
    this.clock.tick(deltaTime)
    this.postProcessing?.setDeltaTime(deltaTime)
    this.resize()
    this.controls.update()
    this.widgets.update(deltaTime, time)
    const currentHeight = this.syncFallbackAmbientLight()
    this.postProcessing?.updateForCameraHeight(currentHeight)
    this.tilesets.update()
    if (this.atmosphere instanceof WebGPUAtmosphereManager) {
      this.atmosphere.setAtmosphereVisible(this.scene.atmosphere.show)
    }
    this.atmosphere?.updateLightSources()
    this.models.update(deltaTime)
    this.entitiesManager.update(deltaTime)
    this.entityRenderManager.beginFrame()
    this.symbolOcclusionPass?.beginFrame()
    this.rendererAdapter.render(this.scene.threeScene, this.threeCamera)
    this.renderSymbolsAfterComposite()
  }

  /**
   * 后合成绘制 symbol：canvas 已是 tone mapping + sRGB 后的最终图像，symbol 以
   * display 色彩空间直接混合（Mapbox 同款做法），字形边缘的 coverage 渐变不再被
   * AgX 压扁，也不再被 SMAA / dithering 二次处理。需旁路 effects 链避免递归。
   *
   * Post-composite symbol draw: the canvas already holds the tone-mapped sRGB frame,
   * so symbols alpha-blend in display space (as Mapbox does). Glyph coverage ramps
   * are no longer warped by AgX nor reprocessed by SMAA / dithering. The effects
   * chain is bypassed around the draw to avoid recursing into it.
   */
  private renderSymbolsAfterComposite() {
    const pass = this.symbolOcclusionPass
    if (!pass) return
    const renderer = this.renderer as TelluxWebGLRenderer
    const draw = () => pass.renderAfterComposite(renderer)
    if (this.postProcessing) {
      this.postProcessing.renderWithEffectsBypassed(draw)
      return
    }
    // 无后处理管线（如 atmosphere 关闭）时手动旁路：内置 setEffects 管线在
    // NoToneMapping + 空 effects 时才会放行直绘。
    const previousToneMapping = renderer.toneMapping
    renderer.toneMapping = THREE.NoToneMapping
    renderer.setEffects([])
    try {
      draw()
    } finally {
      renderer.toneMapping = previousToneMapping
    }
  }

  private clearFrameBuffer() {
    const renderTarget = this.rendererAdapter.getRenderTarget()
    this.rendererAdapter.setRenderTarget(null)
    this.rendererAdapter.clear(true, true, true)
    this.rendererAdapter.setRenderTarget(renderTarget)
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

  private syncSurfaceMaterialMode() {
    this.tilesets.setSurfaceMaterial(
      resolveSurfaceMaterialMode(this.scene.surface.materialMode, this.scene.atmosphere.lighting.mode),
      {
        roughness: this.scene.surface.material.roughness,
        metalness: this.scene.surface.material.metalness,
        useRoughnessMap: this.scene.surface.material.useRoughnessMap
      }
    )
    const contentMaterialMode = resolveSceneContentMaterialMode(this.scene.atmosphere.lighting.mode)
    this.tilesets.setSceneTilesetMaterialMode(contentMaterialMode)
    this.models.setMaterialMode(resolveModelMaterialMode(this.scene.atmosphere.lighting.mode))
  }

  private cancelMostDetailedHeightSampling() {
    this.heightSampler.cancelMostDetailedSampling()
  }

  private wrapTilesetLayer(layer: TilesetLayer): TilesetLayer {
    return {
      id: layer.id,
      tileset: layer.tileset,
      get show() {
        return layer.show
      },
      set show(value: boolean) {
        layer.show = value
      },
      remove: () => {
        this.cancelMostDetailedHeightSampling()
        layer.remove()
      }
    }
  }

  private createAtmosphereManager(onWebGLCompositionChange: () => void): ViewerAtmosphereManager | null {
    if (this.rendererAdapter.supportsWebGLEffects) {
      return new AtmosphereManager(this.renderer as TelluxWebGLRenderer, this.threeCamera, onWebGLCompositionChange)
    }

    if (this.rendererType === 'webgpu') {
      return new WebGPUAtmosphereManager(
        this.rendererAdapter,
        this.renderer as TelluxWebGPURenderer,
        this.scene.threeScene,
        this.threeCamera
      )
    }

    return null
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
