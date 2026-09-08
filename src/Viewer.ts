import * as THREE from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Camera } from './Camera'
import { Clock, type ClockChangeEvent } from './Clock'
import { EntityManager, syncEntityManagerResolution } from './entities/EntityManager'
import { EntityRenderManager } from './entities/EntityRenderManager'
import { SymbolOcclusionPass } from './entities/SymbolOcclusionPass'
import { ToneMappingColorResolver } from './entities/invertToneMapping'
import { CAMERA_FRAME, DEG2RAD } from './constants'
import { telluxConfig } from './config'
import { isLonLatPointList, readLonLatHeight } from './lonlat'
import { TargetFlightController } from './controls/TargetFlightController'
import { TelluxGlobeControls } from './controls/TelluxGlobeControls'
import type { ViewerControls } from './controls/ViewerControls'
import { ViewerInteractionManager } from './controls/ViewerInteractionManager'
import { Globe, createGlobe } from './Globe'
import { LayerManager } from './LayerManager'
import { Terrain, createTerrain } from './Terrain'
import { HismManager } from './hism'
import { HighlightManager } from './highlight'
import {
  getHighlightOutlineEffect,
  syncHighlightStyleFromSettings,
  updateHighlightManager
} from './highlight/HighlightManager'
import { ResourceScope, awaitReadyOrDestroy } from './lifecycle/ResourceLifecycle'
import {
  ModelManager,
  createModelManager,
  updateModelManager,
  disposeModelManager,
  setModelManagerMaterialMode
} from './models/ModelManager'
import { AtmosphereManager } from './rendering/AtmosphereManager'
import { PostProcessingManager } from './rendering/PostProcessingManager'
import { GroundClampPass } from './rendering/GroundClampPass'
import {
  createRendererAdapter,
  type TelluxRendererAdapter,
  type TelluxWebGLRenderer,
  type TelluxWebGPURenderer
} from './rendering/RendererAdapter'
import { ViewerRenderer, createViewerRenderer } from './rendering/ViewerRenderer'
import { ViewportResizeManager } from './rendering/ViewportResizeManager'
import { ViewerRenderLoop } from './rendering/ViewerRenderLoop'
import { WebGPUAtmosphereManager } from './rendering/WebGPUAtmosphereManager'
import { WebGPUBloomManager } from './rendering/WebGPUBloomManager'
import { WebGPULensFlareManager } from './rendering/WebGPULensFlareManager'
import { WebGPUPostProcessingManager } from './rendering/WebGPUPostProcessingManager'
import { WebGPUTemporalAntialiasManager } from './rendering/WebGPUTemporalAntialiasManager'
import { CartographicPicker } from './sampling/CartographicPicker'
import { EntityPicker } from './sampling/EntityPicker'
import { HeightSampler } from './sampling/HeightSampler'
import { TilesetFeaturePicker } from './sampling/TilesetFeaturePicker'
import { ObjectPicker } from './sampling/ObjectPicker'
import { ScenePicker } from './sampling/ScenePicker'
import { Scene, syncSceneRuntimeEffects, updateSceneFallbackAmbientLight } from './Scene'
import { HighlightSettings } from './scene/HighlightSettings'
import { PostProcessSettings } from './scene/PostProcessSettings'
import { SceneTilesetCollection, createSceneTilesetCollection } from './tiles/SceneTilesetCollection'
import { TilesetManager } from './tiles/TilesetManager'
import {
  resolveModelMaterialMode,
  resolveSceneContentMaterialMode,
  resolveSurfaceMaterialMode,
  resolveViewerClockOptions,
  resolveViewerCameraOptions,
  resolveViewerHighlightOptions,
  resolveViewerPostProcessOptions,
  resolveViewerResolutionScale,
  resolveViewerSceneOptions
} from './ViewerOptionsResolver'
import { WidgetManager } from './widgets/WidgetManager'
import type {
  CartographicFrameOptions,
  FlyToTargetOptions,
  FlyToTargetTarget,
  LonLatHeight,
  LonLatHeightLike,
  LonLatLike,
  Picked3DTilesFeature,
  SampleHeightMostDetailedOptions,
  SampleHeightOptions,
  ScreenPosition,
  ViewerEventListener,
  ViewerEventMap,
  ViewerOptions,
  ViewerPickOptions,
  ViewerPickResult
} from './types'

export { Camera } from './Camera'
export {
  Clock,
  type ClockChangeEvent,
  type ClockChangeReason,
  type ClockEventListener,
  type ClockEventMap,
  type ClockOptions,
  type ClockTickEvent,
  type DateTimeInput
} from './Clock'
export { Entity } from './entities/Entity'
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
export { EntityManager } from './entities/EntityManager'
export { HighlightManager } from './highlight'
export { HismManager, type HismManagerOptions } from './hism'
export {
  PositionPipeline,
  HismCluster,
  HismPickMarker,
  createInstancedVegetationPipeline,
  createRTCPositionPipeline,
  createRTCPositionStage,
  createWindSwayLeavesMaterial,
  createWindSwayStage,
  createWindSwayUniforms,
  collectHismRuntimeStats,
  hasTelluxPositionPipeline,
  TELLUX_POSITION_PIPELINE_KEY,
  RTC_POSITION_STAGE_NAME,
  RTC_POSITION_STAGE_ORDER,
  WIND_SWAY_STAGE_NAME,
  WIND_SWAY_STAGE_ORDER,
  type PositionPipelineStage,
  type PositionPipelineStageContext,
  type PositionPipelineStagePhase,
  type PositionPipelineApplyOptions,
  type PositionPipelineComposeOptions,
  type WindSwayLeavesMaterialOptions,
  type WindSwayUniformValues
} from './hism'
export { ImageryLayer, LayerManager } from './LayerManager'
export { Globe } from './Globe'
export { Terrain } from './Terrain'
export { Scene } from './Scene'
export { SceneTilesetCollection } from './tiles/SceneTilesetCollection'
export { ModelManager } from './models/ModelManager'
export { ViewerRenderer } from './rendering/ViewerRenderer'
export { TelluxGlobeControls } from './controls/TelluxGlobeControls'
export type { ViewerControls } from './controls/ViewerControls'
export { SpringControl, type SpringControlOptions } from './SpringControl'
export { telluxConfig, type TelluxConfig } from './config'
export { AtmosphereLightingMode } from './types'
export {
  DEFAULT_POINT_CLOUD_SHADING,
  resolvePointCloudShading
} from './types/pointCloudShading'
export { DebugSettingsPanel, Timeline, type DebugSettingsPanelOptions, type TimelineOptions } from './widgets'
export type { TelluxRenderer, TelluxWebGLRenderer, TelluxWebGPURenderer } from './rendering/RendererAdapter'
export type {
  CameraDestination,
  CameraEllipsoid,
  CameraEllipsoidProvider,
  CameraFlyToOptions,
  CameraFlightEasingFunction,
  CameraOrientation,
  CameraProjectionOptions,
  CameraState,
  CameraSetViewOptions
} from './Camera'
export type {
  AddModelOptions,
  CloudQualityPreset,
  CloudShadowQuality,
  LensFlareQuality,
  CartographicFrameOptions,
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
  GltfModelLightingMode,
  GltfModelMaterialMode,
  GltfModelOptions,
  ColorInput,
  EntityOptions,
  GraphicOutlineOptions,
  PointOptions,
  PolylineOptions,
  PolygonOptions,
  PolygonOutlineOptions,
  SymbolOptions,
  IconOptions,
  TextOptions,
  SymbolAnchor,
  SymbolTextRelative,
  ImageryLayerOptions,
  ImageryLayerSourceOptions,
  ImageryLayerStyleOptions,
  AddHismLayerOptions,
  HismApplyInstanceMatrix,
  HismLayer,
  HismLayerRuntimeStats,
  HismPickResult,
  HismRuntimeStats,
  HismArchetype,
  HismInstancePlacement,
  HismLodLevel,
  HismMeshPart,
  Load3DTilesetOptions,
  LonLat,
  LonLatHeight,
  LonLatHeightLike,
  LonLatLike,
  ModelLayer,
  MVTImagerySourceOptions,
  MVTFeatureProperties,
  MVTFeatureStyle,
  PointCloudShadingOptions,
  ResolvedPointCloudShading,
  MVTGetStyleCallback,
  Picked3DTilesFeature,
  PickedObject,
  PickEntityOptions,
  PickObjectOptions,
  PickedEntity,
  ScreenPosition,
  SampleHeightMostDetailedOptions,
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
  ViewerPickLayer,
  ViewerPickOptions,
  ViewerPickResult,
  ViewerAtmosphereLightingOptions,
  ViewerAtmospherePhotometricOptions,
  ViewerAtmosphereNightOptions,
  ViewerAtmosphereOptions,
  ViewerAtmosphereScatteringOptions,
  ViewerAtmosphereShadowOptions,
  ViewerAtmosphereSkyOptions,
  ViewerAtmosphereStarsOptions,
  ViewerAutoExposureOptions,
  ViewerBloomOptions,
  ViewerCloudLayerOptions,
  ViewerCloudLookOptions,
  ViewerCloudOptions,
  ViewerCloudShadowOptions,
  ViewerEntityOptions,
  ViewerEntityTransparencyOptions,
  ViewerFallbackAmbientLightOptions,
  ViewerLensFlareOptions,
  ViewerLensFlareThresholdOptions,
  ViewerPostProcessOptions,
  ViewerPostProcessStageOptions,
  ViewerRendererOptions,
  ViewerRendererType,
  ViewerSceneOptions,
  ViewerSurfaceOptions,
  ViewerWidgetOptions,
  ViewerOptions,
  HighlightTarget,
  ViewerHighlightOptions,
  ViewerHighlightOutlineOptions,
  ViewerHighlightOverlayOptions,
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
   * 场景控制项和底层 Three.js 场景（`scene.raw`）。
   *
   * Scene controls and the underlying Three.js scene (`scene.raw`).
   */
  readonly scene: Scene
  /**
   * 大气管理器。
   *
   * Atmosphere manager.
   */
  readonly atmosphere: ViewerAtmosphereManager | null
  /**
   * 带 Cesium 风格视角辅助方法的相机控制项。
   *
   * Camera controls with Cesium-style view helpers.
   */
  readonly camera: Camera
  /**
   * 渲染器门面：类型、像素比与原生 renderer 逃生舱。
   *
   * Renderer facade: type, pixel ratio, and the native renderer escape hatch.
   */
  readonly renderer: ViewerRenderer
  /**
   * Renderer 初始化完成 Promise。
   *
   * WebGPU renderer 需要异步初始化。使用外部手动渲染循环时，建议等待该
   * Promise 完成后再调用 {@link Viewer.render}。若直接使用构造函数且该
   * Promise 拒绝，调用方仍需执行 {@link Viewer.destroy}；需要自动清理时
   * 请优先使用 {@link Viewer.create}。
   *
   * Promise resolved when the renderer is initialized.
   *
   * WebGPU renderers require asynchronous initialization. When using an external
   * manual render loop, wait for this Promise before calling {@link Viewer.render}.
   * Callers using the constructor must still call {@link Viewer.destroy} if this
   * promise rejects; prefer {@link Viewer.create} for automatic cleanup.
   */
  readonly ready: Promise<void>
  /**
   * 场景统一模拟时钟。当前用于驱动太阳、月亮和大气方向。
   *
   * Unified scene simulation clock. Currently drives sun, moon, and atmosphere directions.
   */
  readonly clock: Clock
  /**
   * 表面叠加图层管理器。
   *
   * Surface overlay layer manager.
   */
  readonly overlays: LayerManager
  /**
   * 场景 3D Tiles 集合。
   *
   * Scene 3D Tiles collection.
   */
  readonly tilesets: SceneTilesetCollection
  /**
   * glTF 模型集合。
   *
   * glTF model collection.
   */
  readonly models: ModelManager
  /**
   * 地形门面。
   *
   * Terrain facade.
   */
  readonly terrain: Terrain
  /**
   * 地球表面门面（裸球或当前地形）。
   *
   * Globe surface facade (base ellipsoid or current terrain).
   */
  readonly globe: Globe
  /**
   * 后处理运行时设置。
   *
   * Post-processing runtime settings.
   */
  readonly postProcess: PostProcessSettings
  /**
   * 地球交互控制器。公开类型为 {@link ViewerControls}；完整上游 API 见 `.raw`。
   *
   * Globe interaction controls. The public type is {@link ViewerControls};
   * the full upstream API is on `.raw`.
   */
  readonly controls: ViewerControls

  /**
   * 实体集合管理器，用于运行时添加、查询和移除点、线、面实体。
   *
   * Entity collection manager, used to add, query and remove point, polyline
   * and polygon entities at runtime.
   */
  get entities() {
    return this.entitiesManager
  }

  /**
   * HISM 实例化图层管理器，用于大规模静态实例渲染。
   *
   * HISM instanced layer manager for large-scale static instance rendering.
   */
  get hism() {
    return this.hismManager
  }

  /**
   * 统一高亮门面：整对象描边或 3D Tiles feature 叠加，并承载描边 / 叠加样式。
   *
   * Unified highlight facade for object outlines or 3D Tiles feature overlays,
   * including outline / overlay style.
   */
  readonly highlighter: HighlightManager

  private readonly threeCamera: THREE.PerspectiveCamera
  private readonly rendererAdapter: TelluxRendererAdapter
  private readonly dracoLoader: DRACOLoader
  private readonly transparentOverlayTexture: THREE.CanvasTexture
  private readonly cameraCartographicScratch = { lat: 0, lon: 0, height: 0, azimuth: 0, elevation: 0, roll: 0 }
  private readonly gltfLoader: GLTFLoader
  private readonly hismManager: HismManager
  private readonly highlightSettings: HighlightSettings
  private readonly entitiesManager: EntityManager
  private readonly colorResolver: ToneMappingColorResolver
  private readonly entityRenderManager: EntityRenderManager
  private readonly symbolOcclusionPass: SymbolOcclusionPass | null
  private readonly groundClampPass: GroundClampPass | null
  private readonly viewport: ViewportResizeManager
  private readonly postProcessing: PostProcessingManager | null
  private readonly webgpuPostProcessing: WebGPUPostProcessingManager | null
  private readonly webgpuBloom: WebGPUBloomManager | null
  private readonly webgpuLensFlare: WebGPULensFlareManager | null
  private readonly webgpuTemporalAntialias: WebGPUTemporalAntialiasManager | null
  private readonly tilesetManager: TilesetManager
  private readonly cartographicPicker: CartographicPicker
  private readonly tilesetFeaturePicker: TilesetFeaturePicker
  private readonly entityPicker: EntityPicker
  private readonly objectPicker: ObjectPicker
  private readonly scenePicker: ScenePicker
  private readonly heightSampler: HeightSampler
  private readonly targetFlights: TargetFlightController
  private readonly interactions: ViewerInteractionManager
  private readonly widgets: WidgetManager
  private readonly renderLoop: ViewerRenderLoop
  private isDestroyed = false
  private currentResolutionScale: number
  private readonly handleClockChange = (event: ClockChangeEvent) => {
    if (event.reason === 'currentTime' || event.reason === 'tick') {
      this.atmosphere?.updateSunDirection(event.currentTime)
    }
  }

  /**
   * 创建 Viewer 并等待 renderer 初始化完成。
   *
   * WebGPU renderer 需要异步初始化；该工厂方法适合 WebGPU 或外部手动渲染循环。
   * 初始化失败时会自动销毁已经创建的 Viewer 资源。
   *
   * Creates a Viewer and waits for renderer initialization.
   *
   * WebGPU renderers require asynchronous initialization; this factory is useful
   * for WebGPU or external manual render loops. If initialization fails, all
   * resources already owned by the Viewer are destroyed automatically.
   */
  static async create(container: HTMLElement | string, options: ViewerOptions = {}) {
    return awaitReadyOrDestroy(new Viewer(container, options))
  }

  /**
   * 在非空容器元素内创建 viewer。传入字符串时，会将其作为元素 ID 获取容器。
   *
   * Creates a viewer inside a non-empty container element. When a string is
   * provided, it is treated as an element ID and resolved with `getElementById`.
   */
  constructor(container: HTMLElement | string, options: ViewerOptions = {}) {
    const resolvedContainer = Viewer.resolveContainer(container)
    const constructionScope = new ResourceScope()

    try {
      this.container = resolvedContainer
      this.currentResolutionScale = resolveViewerResolutionScale(options)
      const sceneOptions = resolveViewerSceneOptions(options.scene)
      const postProcessOptions = resolveViewerPostProcessOptions(options.postProcess)

      const width = resolvedContainer.clientWidth || 1
      const height = resolvedContainer.clientHeight || 1
      const cameraOptions = resolveViewerCameraOptions(options.camera)
      let atmosphere: ViewerAtmosphereManager | null = null
      let postProcessing: PostProcessingManager | null = null
      let tilesets: TilesetManager | null = null

      this.threeCamera = new THREE.PerspectiveCamera(
        cameraOptions.projection.fov,
        width / height,
        cameraOptions.projection.near,
        cameraOptions.projection.far
      )
      this.camera = new Camera(this.threeCamera, () => tilesets?.tileset.ellipsoid ?? null)
      this.rendererAdapter = createRendererAdapter(options)
      constructionScope.defer(() => this.rendererAdapter.dispose())
      this.renderer = createViewerRenderer(this.rendererAdapter, {
        getResolutionScale: () => this.currentResolutionScale,
        setResolutionScale: (value) => {
          this.currentResolutionScale = value
          this.rendererAdapter.setPixelRatio(value)
          this.resize()
        }
      })
      this.ready = this.rendererAdapter.ready
      void this.ready.catch(() => undefined)
      this.rendererAdapter.setPixelRatio(this.currentResolutionScale)
      this.rendererAdapter.setSize(width, height)
      this.renderer.raw.toneMapping = THREE.AgXToneMapping
      this.renderer.raw.toneMappingExposure = postProcessOptions.toneMappingExposure
      this.colorResolver = new ToneMappingColorResolver({
        toneMapping: this.renderer.raw.toneMapping,
        exposure: this.renderer.raw.toneMappingExposure
      })
      resolvedContainer.appendChild(this.renderer.raw.domElement)
      constructionScope.defer(() => {
        this.renderer.raw.domElement.parentElement?.removeChild(this.renderer.raw.domElement)
      })
      this.transparentOverlayTexture = this.createTransparentOverlayTexture()
      constructionScope.defer(() => this.transparentOverlayTexture.dispose())

      let highlightManager: HighlightManager | null = null
      let entityRenderManager: EntityRenderManager | null = null
      let webgpuBloom: WebGPUBloomManager | null = null
      let webgpuLensFlare: WebGPULensFlareManager | null = null
      let webgpuTemporalAntialias: WebGPUTemporalAntialiasManager | null = null
      this.postProcess = new PostProcessSettings(
        postProcessOptions,
        () => {
          postProcessing?.applyEffects()
          webgpuBloom?.sync(this.postProcess.bloom)
          webgpuLensFlare?.sync(this.postProcess.lensFlare)
          webgpuTemporalAntialias?.setEnabled(this.postProcess.taa.enabled)
        },
        (exposure) => this.applyToneMappingExposure(exposure)
      )
      this.highlightSettings = new HighlightSettings(
        resolveViewerHighlightOptions(options.highlighter),
        () => {
          if (highlightManager) syncHighlightStyleFromSettings(highlightManager)
          postProcessing?.applyEffects()
        }
      )
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
        },
        (mode) => {
          entityRenderManager?.setRequestedMode(mode)
          postProcessing?.applyEffects()
        },
        (matrix) => atmosphere?.setWorldToECEFMatrix(matrix)
      )
      this.webgpuPostProcessing = this.renderer.type === 'webgpu'
        ? new WebGPUPostProcessingManager(
            this.rendererAdapter,
            this.renderer.raw as TelluxWebGPURenderer,
            this.scene.raw,
            this.threeCamera
          )
        : null
      constructionScope.defer(() => this.webgpuPostProcessing?.dispose())
      this.webgpuBloom = this.webgpuPostProcessing
        ? new WebGPUBloomManager(this.webgpuPostProcessing)
        : null
      constructionScope.defer(() => this.webgpuBloom?.dispose())
      webgpuBloom = this.webgpuBloom
      this.webgpuLensFlare = this.webgpuPostProcessing
        ? new WebGPULensFlareManager(this.webgpuPostProcessing)
        : null
      constructionScope.defer(() => this.webgpuLensFlare?.dispose())
      webgpuLensFlare = this.webgpuLensFlare
      this.webgpuTemporalAntialias = this.webgpuPostProcessing
        ? new WebGPUTemporalAntialiasManager(this.webgpuPostProcessing, this.threeCamera)
        : null
      constructionScope.defer(() => this.webgpuTemporalAntialias?.dispose())
      webgpuTemporalAntialias = this.webgpuTemporalAntialias
      this.atmosphere = this.createAtmosphereManager(() => postProcessing?.applyEffects())
      constructionScope.defer(() => this.atmosphere?.dispose())
      atmosphere = this.atmosphere
      this.atmosphere?.addLightSourcesTo(this.scene.raw)
      syncSceneRuntimeEffects(this.scene)
      this.webgpuBloom?.sync(this.postProcess.bloom)
      this.webgpuLensFlare?.sync(this.postProcess.lensFlare)
      this.webgpuTemporalAntialias?.setEnabled(this.postProcess.taa.enabled)
      this.clock = new Clock(resolveViewerClockOptions(options))
      this.clock.on('change', this.handleClockChange)
      constructionScope.defer(() => this.clock.off('change', this.handleClockChange))

      this.dracoLoader = new DRACOLoader()
      constructionScope.defer(() => this.dracoLoader.dispose())
      this.dracoLoader.setDecoderPath(options.dracoDecoderPath ?? '/draco/')
      this.gltfLoader = new GLTFLoader()
      this.gltfLoader.setDRACOLoader(this.dracoLoader)

      this.tilesetManager = new TilesetManager({
        scene: this.scene.raw,
        camera: this.threeCamera,
        renderer: this.renderer.raw,
        useWebGPUCompatibleSurfaceOverlay: this.renderer.type === 'webgpu',
        dracoLoader: this.dracoLoader,
        transparentOverlayTexture: this.transparentOverlayTexture,
        terrain: options.terrain,
        surfaceMaterialMode: resolveSurfaceMaterialMode(
          sceneOptions.surface.materialMode,
          sceneOptions.atmosphere.lighting.mode
        ),
        surfaceMaterialOptions: sceneOptions.surface.material,
        sceneTilesetMaterialMode: resolveSceneContentMaterialMode(sceneOptions.atmosphere.lighting.mode),
        onPointCloudEdlChange: () => this.postProcessing?.applyEffects()
      })
      constructionScope.defer(() => this.tilesetManager.dispose())
      tilesets = this.tilesetManager
      this.cartographicPicker = new CartographicPicker(this.renderer.raw.domElement, this.threeCamera, this.tilesetManager)
      this.tilesetFeaturePicker = new TilesetFeaturePicker(this.renderer.raw.domElement, this.threeCamera, this.tilesetManager)
      this.heightSampler = new HeightSampler(this.tilesetManager)
      constructionScope.defer(() => this.heightSampler.dispose())
      this.tilesets = createSceneTilesetCollection(
        this.tilesetManager,
        () => this.cancelMostDetailedHeightSampling()
      )
      this.globe = createGlobe(this.tilesetManager)
      this.terrain = createTerrain(
        () => this.tilesetManager.terrainOptions,
        (terrain) => {
          this.heightSampler.resetForTerrainChange()
          this.tilesetManager.setTerrain(terrain)
        }
      )
      // 贴地分类 pass 仅 WebGL（依赖 setEffects 深度纹理链）；WebGPU 下为 null。
      this.groundClampPass = this.rendererAdapter.supportsWebGLEffects
        ? new GroundClampPass(this.threeCamera)
        : null
      constructionScope.defer(() => this.groundClampPass?.dispose())
      this.entitiesManager = new EntityManager({
        scene: this.scene.raw,
        toVector3: (input, target) => this.cartographicToVector3(input, target),
        ellipsoid: () => this.tilesetManager.tileset.ellipsoid,
        groundClamp: this.groundClampPass
          ? { root: this.groundClampPass.root, uniforms: this.groundClampPass.sharedUniforms }
          : null,
        pixelRatio: () => this.currentResolutionScale,
        resolveColor: this.colorResolver.resolveColor
      })
      constructionScope.defer(() => this.entitiesManager.dispose())
      this.entityRenderManager = new EntityRenderManager({
        root: this.entitiesManager.root,
        camera: this.threeCamera,
        requestedMode: sceneOptions.entities.transparency.mode,
        supportsWeightedOit: this.rendererAdapter.supportsWebGLEffects
      })
      entityRenderManager = this.entityRenderManager
      constructionScope.defer(() => this.entityRenderManager.dispose())
      this.symbolOcclusionPass = this.rendererAdapter.supportsWebGLEffects
        ? new SymbolOcclusionPass(this.entitiesManager.root, this.threeCamera)
        : null
      constructionScope.defer(() => this.symbolOcclusionPass?.dispose())
      this.entityPicker = new EntityPicker(this.renderer.raw.domElement, this.threeCamera, this.entitiesManager)
      this.objectPicker = new ObjectPicker(this.renderer.raw.domElement, this.threeCamera, this.scene.raw)
      this.targetFlights = new TargetFlightController({
        camera: this.camera,
        tilesets: this.tilesetManager
      })
      constructionScope.defer(() => this.targetFlights.dispose())
      this.viewport = new ViewportResizeManager({
        container: this.container,
        camera: this.threeCamera,
        renderer: this.rendererAdapter,
        tilesets: this.tilesetManager,
        onResize: (width, height) => this.webgpuPostProcessing?.setSize(width, height)
      })
      constructionScope.defer(() => this.viewport.dispose())
      this.camera.setView({
        destination: cameraOptions.destination,
        orientation: cameraOptions.orientation
      })

      const controls = new TelluxGlobeControls(this.scene.raw, this.threeCamera, this.renderer.raw.domElement)
      this.controls = controls
      constructionScope.defer(() => this.controls.dispose())
      if (this.renderer.type === 'webgpu') {
        controls.useWebGPUCompatiblePivotMaterial()
      }
      this.syncControlsEllipsoid()
      this.overlays = new LayerManager(options.overlays, (layers, change) => {
        if (change.type === 'structure') {
          this.cancelMostDetailedHeightSampling()
          this.tilesetManager.setImageryLayers(layers)
          this.syncControlsEllipsoid()
        } else if (change.type === 'order') {
          this.tilesetManager.syncImageryLayerOrder(layers)
        } else if (change.type === 'visibility' || change.type === 'style') {
          this.tilesetManager.syncImageryLayer(change.layer)
        }
      })
      this.controls.enableDamping = true
      this.controls.adjustHeight = false
      controls.pitchProvider = () => this.camera.getPitch()
      controls.isFlyingProvider = () => this.camera.isFlying
      // viewer.camera.allowUnderground 变化时实时同步控件的离地约束（防穿地开关）。
      // Sync the controls' ground-clamp constraint live when viewer.camera.allowUnderground changes.
      this.camera.onAllowUndergroundChange = (value) => {
        this.controls.adjustHeight = !value
      }

      const hismScaleMatrix = new THREE.Matrix4()
      this.hismManager = new HismManager({
        scene: this.scene.raw,
        camera: this.threeCamera,
        domElement: this.renderer.raw.domElement,
        showPickMarker: options.hism?.showPickMarker,
        applyInstanceMatrix: (coordinates, frame, scale, target) => {
          this.cartographicToMatrix4(coordinates, frame, target)
          if (scale === undefined) return
          if (typeof scale === 'number') {
            hismScaleMatrix.makeScale(scale, scale, scale)
          } else {
            hismScaleMatrix.makeScale(scale[0], scale[1], scale[2])
          }
          target.multiply(hismScaleMatrix)
        }
      })
      constructionScope.defer(() => this.hismManager.dispose())

      this.scenePicker = new ScenePicker({
        entityPicker: this.entityPicker,
        tilesetFeaturePicker: this.tilesetFeaturePicker,
        objectPicker: this.objectPicker,
        hismManager: this.hismManager,
        getObjectRoot: () => this.scene.raw
      })

      this.interactions = new ViewerInteractionManager({
        viewer: this,
        camera: this.camera,
        controls,
        domElement: this.renderer.raw.domElement,
        pickCartographic: (position) => this.pickCartographic(position),
        pickNearest: (position, pickOptions) => this.pick(position, pickOptions),
        pickAll: (position, pickOptions) => this.pickAll(position, pickOptions)
      })
      constructionScope.defer(() => this.interactions.dispose())

      this.highlighter = new HighlightManager({
        scene: this.scene.raw,
        camera: this.threeCamera,
        settings: this.highlightSettings,
        webglOutlineAvailable: this.rendererAdapter.supportsWebGLEffects,
        resolveColor: this.colorResolver.resolveColor,
        resolveHismInstanceParts: (pick) =>
          this.hismManager.resolveInstanceParts(pick),
        hideHismPickMarker: () => this.hismManager.hidePickMarker()
      })
      constructionScope.defer(() => this.highlighter.dispose())
      highlightManager = this.highlighter

      this.postProcessing = this.rendererAdapter.supportsWebGLEffects && this.atmosphere
        ? new PostProcessingManager(
            this.renderer.raw as TelluxWebGLRenderer,
            this.scene,
            this.postProcess,
            this.highlightSettings,
            this.scene.raw,
            this.threeCamera,
            this.atmosphere as AtmosphereManager,
            () => this.camera.getCurrentHeight(),
            this.entityRenderManager,
            this.groundClampPass ?? undefined,
            this.symbolOcclusionPass ?? undefined,
            getHighlightOutlineEffect(this.highlighter),
            () => this.tilesetManager.getPointCloudEdlState()
          )
        : null
      constructionScope.defer(() => this.postProcessing?.dispose())
      postProcessing = this.postProcessing
      this.models = createModelManager({
        scene: this.scene.raw,
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
        },
        setHasLocalLighting: (enabled) => {
          this.postProcessing?.setHasLocalLighting(enabled)
        }
      })
      constructionScope.defer(() => disposeModelManager(this.models))
      this.widgets = new WidgetManager(this, options.widgets)
      constructionScope.defer(() => this.widgets.dispose())
      this.widgets.applyInitialSettings()
      this.renderLoop = new ViewerRenderLoop({
        renderer: this.rendererAdapter,
        heightSampler: this.heightSampler,
        renderFrame: (deltaTime, time) => this.renderFrame(deltaTime, time)
      })
      constructionScope.defer(() => this.renderLoop.dispose())
      this.postProcessing?.applyEffects()
      this.atmosphere?.loadTextures()
      this.atmosphere?.updateSunDirection(this.clock.currentTime)

      this.resize()

      this.widgets.mount()

      if (options.useDefaultRenderLoop !== false) {
        this.useDefaultRenderLoop = true
      }
      constructionScope.commit()
    } catch (error) {
      constructionScope.rollback()
      throw error
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

  private applyToneMappingExposure(value: number) {
    this.renderer.raw.toneMappingExposure = value
    this.colorResolver.setState({
      toneMapping: this.renderer.raw.toneMapping,
      exposure: value
    })
    this.entitiesManager.refreshColors()
    syncHighlightStyleFromSettings(this.highlighter)
  }

  private updateAutoExposure(deltaTime: number) {
    const autoExposure = this.postProcess.autoExposure
    if (!autoExposure.enabled) return

    const nightFactor = this.atmosphere?.getNightFactor() ?? 0
    const min = Math.min(autoExposure.min, autoExposure.max)
    const max = Math.max(autoExposure.min, autoExposure.max)
    const target = THREE.MathUtils.lerp(min, max, nightFactor)
    const current = this.postProcess.toneMappingExposure
    const next =
      autoExposure.speed <= 0
        ? target
        : THREE.MathUtils.damp(current, target, autoExposure.speed, deltaTime)
    if (Math.abs(next - current) < 1e-4) return
    this.postProcess.toneMappingExposure = next
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
  cartographicToVector3(input: LonLatHeightLike, target = new THREE.Vector3()) {
    const cartographic = readLonLatHeight(input)
    return this.tilesetManager.tileset.ellipsoid.getCartographicToPosition(
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
  cartographicToMatrix4(input: LonLatHeightLike, options: CartographicFrameOptions = {}, target = new THREE.Matrix4()) {
    const cartographic = readLonLatHeight(input)
    return this.tilesetManager.tileset.ellipsoid.getObjectFrame(
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
   * 拾取屏幕位置最近的可选中对象。
   *
   * 默认图层为 entity / hismInstance / tilesFeature；传入 `root` 且未指定 `layers`
   * 时仅拾取 object 层。无 HISM 图层时自动跳过 hismInstance。
   *
   * Picks the nearest selectable object at a screen position.
   *
   * Default layers are entity / hismInstance / tilesFeature. When `root` is set
   * and `layers` is omitted, only the object layer is tested. The hismInstance
   * layer is skipped when no HISM layers are registered.
   */
  pick(
    position: ScreenPosition,
    options: ViewerPickOptions = {}
  ): ViewerPickResult | null {
    return this.scenePicker.pick(position, options)
  }

  /**
   * 拾取屏幕位置全部可选中对象，每个逻辑对象只返回一次，由近到远。
   * 可通过 `options.limit` 截取全局排序后的前 N 项。
   *
   * Picks all selectable objects at a screen position once per logical object,
   * nearest first. Use `options.limit` to keep the first N globally sorted hits.
   */
  pickAll(
    position: ScreenPosition,
    options: ViewerPickOptions = {}
  ): ViewerPickResult[] {
    return this.scenePicker.pickAll(position, options)
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
  pickCartographic(position: ScreenPosition): LonLatHeight | null {
    return this.cartographicPicker.pick(position)
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
   * 采样指定经纬度在当前已加载内容上的表面高度。
   *
   * 方法沿当地地表法线向下发射射线，只使用当前已经加载到场景中的地形和
   * 3D Tiles。视角外或尚未加载的瓦片不会被额外请求；未命中时返回
   * `undefined`。
   *
   * 批量重载把 tileset 列表和世界矩阵准备提到循环外，比逐点调用更省固定开销；
   * 采样精度仍完全取决于当前已加载瓦片，不会为这批点请求任何数据。
   *
   * Samples the surface height at longitude/latitude from currently loaded
   * content.
   *
   * The method casts a ray downward along the local surface normal and only
   * uses terrain and 3D Tiles already loaded in the scene. Tiles outside the
   * current view or not yet loaded are not requested; returns `undefined` when
   * no surface is hit.
   *
   * The batch overload prepares the tileset list and world matrices once.
   * Precision still depends entirely on already-loaded tiles; no data is
   * requested for the batch.
   */
  sampleHeight(point: LonLatLike, options?: SampleHeightOptions): number | undefined
  sampleHeight(points: readonly LonLatLike[], options?: SampleHeightOptions): (number | undefined)[]
  sampleHeight(
    pointOrPoints: LonLatLike | readonly LonLatLike[],
    options: SampleHeightOptions = {}
  ) {
    if (isLonLatPointList(pointOrPoints)) {
      return this.heightSampler.sampleHeight(pointOrPoints, options)
    }
    return this.heightSampler.sampleHeight(pointOrPoints, options)
  }

  /**
   * 以更高精度异步采样经纬度的表面高度。
   *
   * 地形模式会直接按 quantized-mesh availability 加载最高可用层级并插值高度。
   * 3D Tiles 或混合模式会优先在主场景 tileset 上临时添加局部加载区域，
   * 让采样区域的瓦片细化后再 raycast；这样采样完成后，该区域也会保留在
   * 主场景缓存中。必要时会退回到采样专用 tileset。
   *
   * 批量重载整批共享 LoadRegion 与离屏相机，跨帧等待加载稳定。逐点 `await`
   * 会退化成 N 轮串行加载，慢一到两个数量级——异步批量不是可选项，不用就是错的。
   *
   * terrain 或参与采样的图层变化、以及 Viewer 销毁会取消未完成任务；
   * 取消时返回的 Promise 以 `AbortError` 拒绝。
   *
   * 当 {@link Viewer.useDefaultRenderLoop} 为 `false` 时，需要继续调用
   * {@link Viewer.render} 推进采样任务。
   *
   * Asynchronously samples surface height at longitude/latitude with higher
   * detail.
   *
   * Terrain mode loads the most detailed available quantized-mesh tiles directly
   * from terrain availability and interpolates height. 3D Tiles and mixed modes
   * first add temporary local load regions to the scene tilesets, refine the
   * sampling area, and then raycast; the loaded region remains warm in the scene
   * cache. A sampling-only tileset path is kept as a fallback.
   *
   * The batch overload shares LoadRegions and the offscreen camera across the
   * whole set and waits across frames for loading to settle. Awaiting point by
   * point degrades into N serial load rounds and is one to two orders of
   * magnitude slower — the async batch is not optional.
   *
   * Terrain or sampled-layer changes and Viewer destruction cancel unfinished
   * work. Cancellation rejects the returned promise with an `AbortError`.
   *
   * When {@link Viewer.useDefaultRenderLoop} is `false`, continue calling
   * {@link Viewer.render} to advance pending sampling tasks.
   */
  sampleHeightMostDetailed(
    point: LonLatLike,
    options?: SampleHeightMostDetailedOptions
  ): Promise<number | undefined>
  sampleHeightMostDetailed(
    points: readonly LonLatLike[],
    options?: SampleHeightMostDetailedOptions
  ): Promise<(number | undefined)[]>
  sampleHeightMostDetailed(
    pointOrPoints: LonLatLike | readonly LonLatLike[],
    options: SampleHeightMostDetailedOptions = {}
  ) {
    if (isLonLatPointList(pointOrPoints)) {
      return this.heightSampler.sampleHeightMostDetailed(pointOrPoints, options)
    }
    return this.heightSampler.sampleHeightMostDetailed(pointOrPoints, options)
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
    syncEntityManagerResolution(
      this.entitiesManager,
      this.renderer.raw.domElement.width,
      this.renderer.raw.domElement.height,
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
    this.clock.off('change', this.handleClockChange)
    this.camera.cancelFlight()
    this.renderLoop.dispose()
    this.viewport.dispose()
    this.interactions.dispose()
    disposeModelManager(this.models)
    this.hismManager.dispose()
    this.highlighter.dispose()
    this.entityRenderManager.dispose()
    this.symbolOcclusionPass?.dispose()
    this.entitiesManager.dispose()
    this.groundClampPass?.dispose()
    this.widgets.dispose()
    this.heightSampler.dispose()
    this.targetFlights.dispose()

    this.postProcessing?.dispose()
    this.webgpuTemporalAntialias?.dispose()
    this.webgpuLensFlare?.dispose()
    this.webgpuBloom?.dispose()
    this.atmosphere?.dispose()
    this.webgpuPostProcessing?.dispose()
    this.transparentOverlayTexture.dispose()
    this.tilesetManager.dispose()
    this.controls.dispose()
    this.dracoLoader.dispose()
    this.rendererAdapter.dispose()

    if (this.renderer.raw.domElement.parentElement) {
      this.renderer.raw.domElement.parentElement.removeChild(this.renderer.raw.domElement)
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
    this.tilesetManager.update()
    if (this.atmosphere instanceof WebGPUAtmosphereManager) {
      this.atmosphere.setAtmosphereVisible(this.scene.atmosphere.show)
    }
    this.atmosphere?.updateLightSources()
    this.updateAutoExposure(deltaTime)
    updateModelManager(this.models, deltaTime)
    this.hismManager.update(deltaTime)
    updateHighlightManager(this.highlighter)
    this.entitiesManager.update(deltaTime)
    this.entityRenderManager.beginFrame()
    this.symbolOcclusionPass?.beginFrame()
    this.rendererAdapter.render(this.scene.raw, this.threeCamera)
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
    const renderer = this.renderer.raw as TelluxWebGLRenderer
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
    this.controls.setEllipsoid(this.tilesetManager.surfaceTileset.ellipsoid, this.tilesetManager.surfaceTileset.group)
  }

  private syncFallbackAmbientLight() {
    this.threeCamera.updateMatrix()
    const cartographic = this.tilesetManager.tileset.ellipsoid.getCartographicFromObjectFrame(
      this.threeCamera.matrix,
      this.cameraCartographicScratch,
      CAMERA_FRAME
    )
    updateSceneFallbackAmbientLight(this.scene, cartographic.height)
    return cartographic.height
  }

  private syncSurfaceMaterialMode() {
    this.tilesetManager.setSurfaceMaterial(
      resolveSurfaceMaterialMode(this.scene.surface.materialMode, this.scene.atmosphere.lighting.mode),
      {
        roughness: this.scene.surface.material.roughness,
        metalness: this.scene.surface.material.metalness,
        useRoughnessMap: this.scene.surface.material.useRoughnessMap
      }
    )
    const contentMaterialMode = resolveSceneContentMaterialMode(this.scene.atmosphere.lighting.mode)
    this.tilesetManager.setSceneTilesetMaterialMode(contentMaterialMode)
    setModelManagerMaterialMode(this.models, resolveModelMaterialMode(this.scene.atmosphere.lighting.mode))
  }

  private cancelMostDetailedHeightSampling() {
    this.heightSampler.cancelMostDetailedSampling()
  }

  private createAtmosphereManager(onWebGLCompositionChange: () => void): ViewerAtmosphereManager | null {
    if (this.rendererAdapter.supportsWebGLEffects) {
      return new AtmosphereManager(this.renderer.raw as TelluxWebGLRenderer, this.threeCamera, onWebGLCompositionChange)
    }

    if (this.renderer.type === 'webgpu') {
      if (!this.webgpuPostProcessing) {
        throw new Error('WebGPU post-processing graph must be created before the atmosphere manager.')
      }
      return new WebGPUAtmosphereManager(
        this.webgpuPostProcessing,
        this.renderer.raw as TelluxWebGPURenderer,
        this.scene.raw,
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
