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

/**
 * 创建 {@link Viewer} 时使用的配置项。
 *
 * Options used to create a {@link Viewer}.
 */
export interface ViewerOptions {
  /**
   * Cesium Ion 资源和授权配置。
   *
   * 不传时，Tellux 会使用默认资源 id `2275207` 和空 token。
   *
   * Cesium Ion asset and authorization options.
   *
   * When omitted, Tellux uses the default asset id `2275207` with an empty token.
   */
  imageryProvider?: CesiumIonResourceOptions
  /**
   * 初始相机视角。
   *
   * 经纬度和姿态角使用度作为单位；高度、near 和 far 使用米作为单位。
   *
   * Initial camera view.
   *
   * Geographic coordinates and orientation angles are expressed in degrees.
   * Height, near, and far are expressed in meters.
   */
  camera?: {
    /** 初始纬度（度），默认 `35.6812`。Initial latitude in degrees. Defaults to `35.6812`. */
    latitude?: number
    /** 初始经度（度），默认 `139.8`。Initial longitude in degrees. Defaults to `139.8`. */
    longitude?: number
    /** 初始相机高度（米），默认 `500`。Initial camera height in meters. Defaults to `500`. */
    height?: number
    /** 初始航向角（度），默认 `-90`。Initial heading in degrees. Defaults to `-90`. */
    heading?: number
    /** 初始俯仰角（度），默认 `-10`。Initial pitch in degrees. Defaults to `-10`. */
    pitch?: number
    /** 初始翻滚角（度），默认 `0`。Initial roll in degrees. Defaults to `0`. */
    roll?: number
    /** 透视相机垂直视场角（度），默认 `75`。Perspective camera vertical field of view in degrees. Defaults to `75`. */
    fov?: number
    /** 透视相机近裁剪面（米），默认 `10`。Perspective camera near clipping plane in meters. Defaults to `10`. */
    near?: number
    /** 透视相机远裁剪面（米），默认 `1000000`。Perspective camera far clipping plane in meters. Defaults to `1000000`. */
    far?: number
  }
  /**
   * 初始场景和后处理配置。
   *
   * Initial scene and post-processing options.
   */
  scene?: {
    /** 是否启用体积云，默认 `true`。Enables volumetric clouds. Defaults to `true`. */
    clouds?: boolean
    /** 是否启用大气天空和空气透视，默认 `true`。Enables atmospheric sky and aerial perspective. Defaults to `true`. */
    skyAtmosphere?: boolean
    /** 是否启用镜头光晕后处理，默认 `true`。Enables lens flare post-processing. Defaults to `true`. */
    lensFlare?: boolean
    /** 是否启用 SMAA 抗锯齿后处理，默认 `true`。Enables SMAA anti-aliasing post-processing. Defaults to `true`. */
    smaa?: boolean
    /** 是否启用抖动后处理，默认 `false`。Enables dithering post-processing. Defaults to `false`. */
    dithering?: boolean
    /** 渲染器色调映射曝光值，默认 `10`。Renderer tone mapping exposure. Defaults to `10`. */
    toneMappingExposure?: number
    /** 云覆盖率，范围 `0` 到 `1`，默认 `0.3`。Cloud coverage from `0` to `1`. Defaults to `0.3`. */
    cloudCoverage?: number
  }
  /**
   * 为 `true` 时自动启动渲染循环。
   *
   * 默认 `true`。接入外部渲染循环时可设为 `false`，并手动调用 {@link Viewer.render}。
   *
   * Starts the render loop automatically when `true`.
   *
   * Defaults to `true`. Set this to `false` when integrating with an external
   * render loop and call {@link Viewer.render} yourself.
   */
  useDefaultRenderLoop?: boolean
  /**
   * 渲染器像素比，默认 `Math.min(window.devicePixelRatio, 2)`。
   *
   * Renderer pixel ratio. Defaults to `Math.min(window.devicePixelRatio, 2)`.
   */
  resolutionScale?: number
  /**
   * Draco 解码器文件的公开 URL 路径。
   *
   * 默认 `/draco/gltf/`。
   *
   * Public URL path for Draco decoder files.
   *
   * Defaults to `/draco/gltf/`.
   */
  dracoDecoderPath?: string
}

/**
 * Cesium Ion 资源配置，用于 {@link ViewerOptions.imageryProvider}。
 *
 * Cesium Ion resource options used by {@link ViewerOptions.imageryProvider}.
 */
export interface CesiumIonResourceOptions {
  /** Cesium Ion 访问令牌。Cesium Ion access token. */
  apiToken: string
  /** 要加载的 Cesium Ion 资源 id。Cesium Ion asset id to load. */
  assetId: string | number
  /** 是否自动刷新 Cesium Ion endpoint 授权，默认 `true`。Refreshes Cesium Ion endpoint authorization automatically. Defaults to `true`. */
  autoRefreshToken?: boolean
}

/**
 * Viewer 事件的基础信息。
 *
 * Base information for Viewer events.
 */
export interface ViewerEvent {
  /** 事件类型。Event type. */
  type: keyof ViewerEventMap
  /** 触发事件的 Viewer 实例。Viewer instance that emitted the event. */
  viewer: Viewer
}

/**
 * Viewer canvas 上的点击事件。
 *
 * Click event on the Viewer canvas.
 */
export interface ViewerClickEvent extends ViewerEvent {
  /** 事件类型。Event type. */
  type: 'click'
  /** 原始 DOM 鼠标事件。Original DOM mouse event. */
  originalEvent: MouseEvent
  /** 相对于 canvas 左上角的像素坐标。Pixel position relative to the top-left corner of the canvas. */
  position: {
    /** 横向像素坐标。Horizontal pixel coordinate. */
    x: number
    /** 纵向像素坐标。Vertical pixel coordinate. */
    y: number
  }
}

/**
 * Viewer 支持的事件映射。
 *
 * Event map supported by Viewer.
 */
export interface ViewerEventMap {
  click: ViewerClickEvent
}

/**
 * Viewer 事件监听函数。
 *
 * Viewer event listener.
 */
export type ViewerEventListener<T extends keyof ViewerEventMap> = (event: ViewerEventMap[T]) => void

type AnyViewerEventListener = (event: ViewerEventMap[keyof ViewerEventMap]) => void

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

/**
 * Tellux 全局配置。
 *
 * Global Tellux configuration.
 */
export interface TelluxConfig {
  /**
   * Tellux 静态资源父级目录。
   *
   * 设置后，内置云和 STBN 纹理会从该目录加载
   * `local_weather.png`、`turbulence.png`、`shape.bin`、`shape_detail.bin` 和 `stbn.bin`。
   * 留空时使用上游包默认资源地址。
   *
   * Parent directory for Tellux static assets.
   *
   * When set, built-in cloud and STBN textures are loaded from this directory:
   * `local_weather.png`, `turbulence.png`, `shape.bin`, `shape_detail.bin`, and `stbn.bin`.
   * Leave it empty to use the upstream package defaults.
   */
  baseUrl: string
}

export const telluxConfig: TelluxConfig = {
  baseUrl: ''
}

function getTelluxAssetUrl(defaultUrl: string): string {
  const baseUrl = telluxConfig.baseUrl.trim()
  if (baseUrl.length === 0) return defaultUrl

  const assetName = getUrlFileName(defaultUrl)
  const separator = baseUrl.endsWith('/') ? '' : '/'
  return `${baseUrl}${separator}${assetName}`
}

function getUrlFileName(url: string): string {
  const path = url.split(/[?#]/, 1)[0]
  const index = path.lastIndexOf('/')
  return index >= 0 ? path.slice(index + 1) : path
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

/**
 * 场景时钟，用于太阳方向和随时间变化的大气光照。
 *
 * Scene clock used for sun direction and time-dependent atmosphere lighting.
 */
export class Clock {
  private currentHourUTC = 0
  private readonly onChange: () => void

  constructor(onChange: () => void) {
    this.onChange = onChange
  }

  /**
   * 当前 UTC 小时偏移量，用于计算太阳方向。
   *
   * Current UTC hour offset used to compute sun direction.
   */
  get hourUTC() {
    return this.currentHourUTC
  }

  set hourUTC(value: number) {
    this.setHourUTC(value)
  }

  /**
   * 设置 UTC 小时偏移量，并更新随时间变化的光照。
   *
   * Sets the UTC hour offset and updates time-dependent lighting.
   */
  setHourUTC(value: number) {
    this.currentHourUTC = value
    this.onChange()
  }

  /**
   * 内部用于太阳方向计算的日期。
   *
   * Date used internally for sun direction calculations.
   */
  get currentTime() {
    return new Date(Date.UTC(2024, 2, 1) + this.currentHourUTC * 3600000)
  }
}

/**
 * 创建 Cesium Ion 资源配置的辅助类。
 *
 * Helper for creating Cesium Ion resource options.
 */
export class CesiumIonResource {
  /**
   * 根据 Cesium Ion 资源 id 和 token 配置创建资源选项。
   *
   * Creates a resource option object from a Cesium Ion asset id and token options.
   */
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

  /**
   * 场景功能是否可见。
   *
   * Whether the scene feature is visible.
   */
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

  /**
   * 该后处理阶段是否启用。
   *
   * Whether this post-processing stage is enabled.
   */
  get enabled() {
    return this.isEnabled
  }

  set enabled(value: boolean) {
    if (this.isEnabled === value) return
    this.isEnabled = value
    this.onChange()
  }
}

class PostProcessStages {
  /** 镜头光晕后处理阶段。Lens flare post-processing stage. */
  lensFlare: PostProcessStage
  /** SMAA 抗锯齿后处理阶段。SMAA anti-aliasing post-processing stage. */
  smaa: PostProcessStage
  /** 抖动后处理阶段。Dithering post-processing stage. */
  dithering: PostProcessStage

  constructor(options: Required<NonNullable<ViewerOptions['scene']>>, onChange: () => void) {
    this.lensFlare = new PostProcessStage(options.lensFlare, onChange)
    this.smaa = new PostProcessStage(options.smaa, onChange)
    this.dithering = new PostProcessStage(options.dithering, onChange)
  }
}

/**
 * 场景级控制项和底层 Three.js 场景。
 *
 * 通常通过 {@link Viewer.scene} 访问。
 *
 * Scene-level controls and the underlying Three.js scene.
 *
 * Access this through {@link Viewer.scene}.
 */
export class Scene {
  /**
   * 底层 Three.js 场景，可用于添加自定义对象。
   *
   * Underlying Three.js scene for adding custom objects.
   */
  readonly threeScene = new THREE.Scene()
  /**
   * 云层可见性开关。
   *
   * Cloud visibility toggle.
   */
  clouds: SceneToggle
  /**
   * 大气可见性开关。
   *
   * Atmosphere visibility toggle.
   */
  skyAtmosphere: SceneToggle
  /**
   * 后处理阶段控制项。
   *
   * Post-processing stage controls.
   */
  postProcessStages: PostProcessStages
  private currentCloudCoverage: number
  private readonly getCloudsEffect: () => CloudsEffect | null

  constructor(
    options: Required<NonNullable<ViewerOptions['scene']>>,
    getCloudsEffect: () => CloudsEffect | null,
    onEffectsChange: () => void
  ) {
    this.currentCloudCoverage = options.cloudCoverage
    this.getCloudsEffect = getCloudsEffect
    this.clouds = new SceneToggle(options.clouds, onEffectsChange)
    this.skyAtmosphere = new SceneToggle(options.skyAtmosphere, onEffectsChange)
    this.postProcessStages = new PostProcessStages(options, onEffectsChange)
  }

  /**
   * 云覆盖率，范围 `0` 到 `1`。
   *
   * Cloud coverage from `0` to `1`.
   */
  get cloudCoverage() {
    return this.currentCloudCoverage
  }

  set cloudCoverage(value: number) {
    this.currentCloudCoverage = value
    const clouds = this.getCloudsEffect()
    if (clouds) clouds.coverage = value
  }
}

/**
 * 相机控制器，提供 Cesium 风格的视角方法。
 *
 * Camera controller with Cesium-style view methods.
 */
export class Camera {
  /**
   * 底层 Three.js 透视相机。
   *
   * Underlying Three.js perspective camera.
   */
  readonly threeCamera: THREE.PerspectiveCamera

  constructor(camera: THREE.PerspectiveCamera) {
    this.threeCamera = camera
  }

  /**
   * 将相机移动到目标位置。
   *
   * 当前会立即应用目标视角；`duration` 保留给未来的动画飞行支持。
   *
   * Moves the camera to a destination.
   *
   * This currently applies the target view immediately; `duration` is reserved
   * for future animated flight support.
   */
  flyTo(options: {
    destination: {
      /** 目标纬度（度）。Destination latitude in degrees. */
      latitude: number
      /** 目标经度（度）。Destination longitude in degrees. */
      longitude: number
      /** 目标高度（米），默认使用 viewer 相机高度。Destination height in meters. Defaults to the viewer camera height. */
      height?: number
    }
    orientation?: {
      /** 航向角（度）。Heading in degrees. */
      heading?: number
      /** 俯仰角（度）。Pitch in degrees. */
      pitch?: number
      /** 翻滚角（度）。Roll in degrees. */
      roll?: number
    }
    /** 保留给未来的动画飞行支持。Reserved for future animated flight support. */
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

  /**
   * 立即设置相机视角。
   *
   * Sets the camera view immediately.
   */
  setView(options: {
    /** 纬度（度）。Latitude in degrees. */
    latitude: number
    /** 经度（度）。Longitude in degrees. */
    longitude: number
    /** 高度（米），默认使用 viewer 相机高度。Height in meters. Defaults to the viewer camera height. */
    height?: number
    /** 航向角（度）。Heading in degrees. */
    heading?: number
    /** 俯仰角（度）。Pitch in degrees. */
    pitch?: number
    /** 翻滚角（度）。Roll in degrees. */
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
   * Underlying 3D Tiles renderer.
   */
  readonly tileset: TilesRenderer
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
  private readonly eventListeners = new Map<keyof ViewerEventMap, Set<AnyViewerEventListener>>()
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
  private readonly handleCanvasClick = (originalEvent: MouseEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.dispatchEvent('click', {
      type: 'click',
      viewer: this,
      originalEvent,
      position: {
        x: originalEvent.clientX - rect.left,
        y: originalEvent.clientY - rect.top
      }
    })
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
    this.renderer.domElement.addEventListener('click', this.handleCanvasClick)

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
    console.log('注册事件')
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
    this.tileset.update()
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
    this.tileset.setResolutionFromRenderer(this.threeCamera, this.renderer)
  }

  /**
   * 释放 WebGL 资源、事件监听器、控制器和已加载纹理。
   *
   * Releases WebGL resources, event listeners, controls, and loaded textures.
   */
  destroy() {
    this.isDestroyed = true
    this.useDefaultRenderLoop = false
    window.removeEventListener('resize', this.handleWindowResize)
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('pointerdown', this.enableAdjustHeight)
    this.renderer.domElement.removeEventListener('wheel', this.enableAdjustHeight)
    this.renderer.domElement.removeEventListener('click', this.handleCanvasClick)
    this.renderer.setEffects(null)
    this.cloudsEffect?.events.removeEventListener('change', this.handleCloudsChange)
    this.clearEventListeners()

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
