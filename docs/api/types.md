# 类型入口

Tellux 的类型入口是 `dist/index.d.ts`，源码中的公开类型主要从 `src/types.ts` 导出。

## Viewer 配置

常用类型：

- `ViewerOptions`
- `ViewerSceneOptions`
- `ViewerAtmosphereOptions`
- `ViewerCloudOptions`
- `ViewerEntityOptions`
- `ViewerEntityTransparencyOptions`
- `ViewerSurfaceOptions`
- `ViewerSurfaceMaterialOptions`
- `ViewerPostProcessOptions`
- `ViewerHighlightOptions` / `ViewerHighlightOutlineOptions` / `ViewerHighlightOverlayOptions`
- `AtmosphereLightingMode`
- `CloudQualityPreset`
- `EntityTransparencyMode`
- `SurfaceMaterialMode`
- `TerrainOptions`
- `ImageryLayerOptions`
- `Load3DTilesetOptions`
- `AddModelOptions`
- `SampleHeightOptions`
- `SampleHeightMostDetailedOptions`
- `ViewerRendererOptions`
- `ViewerRendererType`

底层 Three.js renderer 实例类型也从 `tellux` 导出，用于在外部渲染循环或自定义 pass 中直接操作 renderer：

- `TelluxRenderer`：`TelluxWebGLRenderer | TelluxWebGPURenderer` 的联合类型。
- `TelluxWebGLRenderer`：WebGL 模式下的 renderer（带 Tellux 效果扩展的 `WebGLRenderer`）。
- `TelluxWebGPURenderer`：WebGPU 模式下的 `WebGPURenderer`。

## 场景配置

`ViewerOptions.scene` 使用按领域分组的配置结构，避免把大气、云、地表和后处理参数拍平成同一层。

```ts
const viewer = new Viewer(container, {
  scene: {
    atmosphere: {
      show: true,
      lighting: {
        mode: 'light-source',
        sunLight: true,
        skyLight: true,
        sunLightIntensity: 1,
        skyLightIntensity: 1,
        albedoScale: 1
      },
      scattering: {
        intensity: 0.6,
        horizonBlend: true,
        horizonRange: [0, 0.6]
      },
      sky: {
        stars: true,
        starsIntensity: 1,
        starsPointSize: 1
      },
      fallbackAmbientLight: {
        show: true,
        intensity: 0.5
      }
    },
    clouds: {
      show: true,
      quality: 'medium',
      coverage: 0.3,
      speed: 0.001,
      layer: {
        altitude: 1500,
        height: 650
      }
    },
    entities: {
      transparency: {
        mode: 'auto'
      }
    },
    surface: {
      materialMode: 'auto',
      material: {
        roughness: 1,
        metalness: 0,
        useRoughnessMap: false
      }
    },
    postProcess: {
      toneMappingExposure: 10,
      lensFlare: true,
      smaa: true,
      dithering: false
    }
  }
})
```

对应的运行时控制入口也保持同样的分组：

```ts
viewer.scene.atmosphere.lighting.mode = 'post-process'
viewer.scene.atmosphere.scattering.intensity = 0.45
viewer.scene.atmosphere.sky.stars.show = false
viewer.scene.clouds.quality = 'high'
viewer.scene.clouds.coverage = 0.35
viewer.scene.surface.materialMode = 'standard'
viewer.scene.surface.material.roughness = 0.9
viewer.scene.postProcess.smaa.enabled = true
viewer.toneMappingExposure = 8
```

详细的逐项说明见下文「配置项参考」。

## 配置项参考

下面用一个带注释的完整配置对象说明 `ViewerOptions` 的每一项。结构上和真实配置同构：每一层对应一个领域对象，每个字段的注释标明了功能、默认值和单位。注释里标「默认 xxx」的即为不传时的取值；未标默认值的字段默认为空或未启用。

初始化配置与运行时入口同构（路径一致），因此这里的字段路径同时适用于 `new Viewer(container, { ... })` 的初始值和 `viewer.scene.*` 的运行时修改。

```ts
const viewer = new tellux.Viewer(container, {
  // —— 影像图层：按数组顺序从下到上贴到裸球或地形表面，详见「地形与影像」
  layers: [
    { name: '底图', source: { type: 'xyz', url: '...', levels: 19 } }
  ],

  // —— 地形：Cesium quantized-mesh 格式，自托管 url 或 cesium-ion。不传为裸球
  terrain: {
    // type: 'cesium-ion' 或省略（按 url 处理）
    url: 'https://example.com/terrain/layer.json',
    tileLoading: {
      errorTarget: 1,            // 地形瓦片目标屏幕空间误差，越小越精细，默认 1
      imageryResolution: 256,    // 每个地形瓦片合成影像纹理的画布分辨率，默认 256
      enableTileSplitting: false // 是否拆分地形瓦片以贴合影像边界，默认 false
    }
  },

  // —— 相机：经纬度和姿态角用「度」，height / near / far 用「米」
  camera: {
    latitude: 35.6812,   // 初始纬度（度），默认 35.6812
    longitude: 139.8,    // 初始经度（度），默认 139.8
    height: 500,         // 初始相机高度（米），默认 500
    heading: -90,        // 航向角（度），相对当地正北顺时针，默认 -90
    pitch: -10,          // 俯仰角（度），0 水平、-90 垂直俯视，默认 -10
    roll: 0,             // 翻滚角（度），默认 0
    fov: 75,             // 透视相机垂直视场角（度），默认 75
    near: 10,            // 近裁剪面（米），默认 10
    far: 1000000         // 远裁剪面（米），默认 1000000
  },

  // —— 场景：按 atmosphere / clouds / surface / postProcess 分组
  scene: {
    // 大气：天空、空气透视、光照、夜景、云影
    atmosphere: {
      show: true,         // 是否启用大气天空和空气透视，默认 true

      // 光照：详见「光照模式与参数」
      lighting: {
        mode: 'light-source',    // 光照模式 'light-source' | 'post-process'，默认 'light-source'
        sunLight: true,          // 是否应用太阳直射光照，默认 true
        skyLight: true,          // 是否应用天空环境光照，默认 true
        sunLightIntensity: 1,    // 太阳光源辐射强度缩放（主要作用于 light-source），默认 1
        skyLightIntensity: 1,    // 天空光探针辐射强度缩放（主要作用于 light-source），默认 1
        albedoScale: 1           // 后处理光照反照率缩放（主要作用于 post-process），默认 1
      },

      // 夜间光照：太阳落山后的补光
      night: {
        enabled: true,            // 是否启用自动夜间光照，默认 true
        moonLight: true,          // 是否启用月光照明，默认 true
        ambientLight: true,       // 是否启用冷色环境补光，默认 true
        color: 0x9bbcff,          // 夜间光照颜色，默认 0x9bbcff
        moonLightIntensity: 0.18, // 月光最大强度，默认 0.18
        ambientIntensity: 0.08,   // 夜间环境补光最大强度，默认 0.08
        useMoonPhase: true,       // 是否按月相衰减月光强度，默认 true
        transitionRange: [-0.08, 0.05] // 昼夜过渡范围（地表法线·太阳方向点积），默认 [-0.08, 0.05]
      },

      // 空气散射：远处发蓝发雾的物理参数
      scattering: {
        transmittance: true,           // 是否应用大气透射衰减，默认 true
        inscatter: true,               // 是否应用进入视线的空气散射光，默认 true
        intensity: 0.6,                // 空气散射强度 0~1，默认 0.6
        horizonBlend: true,            // 是否按地平线 / 球体边缘混合散射，默认 true
        horizonRange: [0, 0.6],        // 地平线混合范围，默认 [0, 0.6]
        correctAltitude: true,         // 是否修正相机高度误差，默认 true
        correctGeometricError: true,   // 是否修正瓦片几何误差光照伪影，默认 true
        solarIrradianceScale: 1,       // 大气顶太阳光谱强度缩放，默认 1
        rayleighScatteringScale: 1,    // 瑞利散射系数缩放（影响天空蓝色），默认 1
        mieScatteringScale: 1,         // 米氏散射系数缩放（影响光晕 / 朝晚霞），默认 1
        mieExtinctionScale: 1,         // 米氏消光系数缩放，默认 1
        miePhaseFunctionG: 0.8,        // 米氏相函数不对称因子，默认 0.8
        absorptionExtinctionScale: 1,  // 臭氧等吸收介质消光缩放，默认 1
        groundAlbedo: 0.1              // 大气模型平均地表反照率，默认 0.1
      },

      // 天空元素：太阳 / 月亮 / 星空
      sky: {
        stars: true,              // 是否启用星空，默认 true
        starsIntensity: 1,        // 星空亮度缩放，默认 1
        starsPointSize: 1,        // 星点大小（像素），默认 1
        sun: true,                // 是否绘制太阳盘，默认 true
        moon: true,               // 是否绘制月亮，默认 true
        ground: true,             // 是否绘制天空里的地面项，默认 true
        sunAngularRadius: 0.004675, // 太阳角半径（弧度），默认 0.004675
        moonAngularRadius: 0.0045,  // 月亮角半径（弧度），默认 0.0045
        lunarRadianceScale: 1     // 月光辐射亮度缩放，默认 1
      },

      // 云影：体积云投在地表的阴影
      shadow: {
        radius: 3,        // 云影屏幕模糊半径，默认 3
        sampleCount: 8    // 云影 PCF 采样数量 1~16，默认 8
      },

      // 兜底环境光：独立于夜景，保证暗面不纯黑
      fallbackAmbientLight: {
        show: true,       // 是否启用，默认 true
        intensity: 0.5    // 最大强度，默认 0.5
      }
    },

    // 体积云（WebGL 专属，WebGPU 模式下不渲染）
    clouds: {
      show: true,         // 是否启用体积云，默认 true
      quality: 'medium',  // 质量档位 'low' | 'medium' | 'high' | 'ultra'
      lightShafts: true,  // 是否启用云缝光柱，默认 true
      coverage: 0.3,      // 云覆盖率 0~1，默认 0.3
      speed: 0.001,       // 天气纹理水平移动速度（UV 偏移/秒），默认 0.001
      layer: {
        altitude: 1500,   // 低云层组云底高度（米），默认 1500
        height: 650       // 低云层组厚度（米），默认 650
      }
    },

    // 实体：点 / 线 / 面的透明渲染策略
    entities: {
      transparency: {
        mode: 'auto'      // 'auto' | 'weighted-oit' | 'sorted'，默认 'auto'
      }
    },

    // 地表材质：只作用于基础地球和地形，不影响 load3DTileset / addModel
    surface: {
      materialMode: 'auto',    // 'auto'（随光照模式）| 'basic' | 'standard'，默认 'auto'
      material: {
        roughness: 1,          // 表面粗糙度 0~1，默认 1
        metalness: 0,          // 表面金属度 0~1，默认 0
        useRoughnessMap: false // 是否沿用地形 / 上游粗糙度贴图，默认 false（避免海面强反光）
      }
    },

    // 后处理（SMAA / 光晕 / 抖动为 WebGL 专属，WebGPU 模式下不渲染）
    postProcess: {
      toneMappingExposure: 10, // 色调映射曝光，默认 10；运行时也可用 viewer.toneMappingExposure 调整
      lensFlare: true,         // 是否启用镜头光晕，默认 true
      smaa: true,              // 是否启用 SMAA 抗锯齿，默认 true
      dithering: false         // 是否启用抖动（减少色带），默认 false
    }
  },

  // —— Renderer：底层 Three.js renderer 创建配置，详见「Renderer 类型」
  renderer: {
    type: 'webgl',     // 'webgl'（默认）| 'webgpu'（实验性）
    transparent: false, // 是否启用透明渲染背景，优先级高于顶层 transparent
    antialias: undefined, // 是否启用 renderer 级抗锯齿
    samples: undefined,   // 多重采样数量
    forceWebGL: undefined // 仅 type:'webgpu' 生效，强制走 Three.js WebGL2 fallback backend
  },

  // —— 渲染循环
  useDefaultRenderLoop: true,  // 是否自动启动渲染循环，默认 true；接外部循环时设 false 并手动 render()

  // —— 像素比：降低可提升性能，默认 min(devicePixelRatio, 2)
  resolutionScale: Math.min(window.devicePixelRatio, 2),

  // —— 透明背景：新代码优先用 renderer.transparent，默认 false
  transparent: false,

  // —— Draco 解码器路径，默认 '/draco/gltf/'
  dracoDecoderPath: '/draco/gltf/',

  // —— 内置控件
  widgets: {
    settingPanel: false, // 是否挂载内置调试设置面板，默认 false；传对象作为初始值
    timeline: false      // 是否挂载内置时间条，默认 false；传对象配置起止时间 / 倍率 / 弹簧过渡
  }
})
```

几个值得注意的约定：

- **领域边界**：scene 内部按 atmosphere / clouds / surface / postProcess / highlight 分组，而不是用前缀字段拍平。新增同领域能力时会扩展对应分组对象，而非新增顶层前缀字段。
- **单位**：对外 API 统一使用度和米——经纬度、heading / pitch / roll 用度，高度、裁剪面、云层高度用米；角半径（`sunAngularRadius` 等）是弧度。
- **WebGPU 限制**：`clouds`、`sky.stars` 以及 `postProcess` 的 SMAA / 镜头光晕 / 抖动在 WebGPU 模式下不渲染，调整开关无视觉效果。
- **Entity 透明**：`scene.entities.transparency.mode` 默认 `auto`；WebGL 后处理管线可用时使用 weighted blended OIT，WebGPU 或不支持时退回 `sorted`。`weighted-oit` 能减少 entity 之间随视角跳变的排序异常，但它是工程近似，不是逐片元严格排序；`sorted` 保留 Three.js 默认透明排序路径，便于兼容和排查。
- **作用范围**：`surface` 只影响 Viewer 管理的基础地球和地形；`load3DTileset` / `addModel` 加载的内容有自己的材质模式（见「光照模式与参数」）。

## Renderer 类型

`ViewerOptions.renderer` 控制底层 Three.js renderer 的创建方式，对应 `ViewerRendererOptions`：

```ts
const viewer = await tellux.Viewer.create(container, {
  renderer: {
    type: 'webgpu'
  }
})
```

`type` 取值对应 `ViewerRendererType`：

- `webgl`（默认）：使用 Three.js `WebGLRenderer`，完整支持大气、云、星空和后处理效果。
- `webgpu`（实验性）：使用 Three.js `WebGPURenderer`。基础地球、3D Tiles、地形、影像、模型、拾取和大气天空 / 空气透视走 WebGPU 管线；体积云、星空和 WebGL 专属后处理效果仍会降级为不渲染。

WebGPU renderer 需要异步初始化。推荐用 `Viewer.create(...)`，它会在返回前等待 `viewer.ready`；若使用 `new Viewer(...)` 并接入外部手动渲染循环，建议先 `await viewer.ready` 再调用 `viewer.render()`。WebGPU 模式目前不会在不支持的环境上自动回退 WebGL，需要应用层自行检测后再决定 `type`，或使用 `renderer.forceWebGL` 让 WebGPURenderer 走 Three.js 的 WebGL2 fallback backend。

## 坐标类型

```ts
type CartographicCoordinateTuple = [
  longitude: number,
  latitude: number,
  height?: number
]

interface CartographicCoordinates {
  latitude: number
  longitude: number
  height: number
}
```

数组输入顺序是 `[经度, 纬度, 高度]`。对象输入使用 `{ longitude, latitude, height }`。

## 事件类型

```ts
viewer.on('mousemove', (event) => {
  event.position
  event.cartographic
})
```

`event.position` 是相对于 canvas 左上角的像素坐标，`event.cartographic` 是命中的经纬高，未命中时为 `null`。
