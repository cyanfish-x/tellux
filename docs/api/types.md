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
- `ClockOptions`
- `LonLat` / `LonLatHeight` / `LonLatLike` / `LonLatHeightLike`
- `CameraDestination` / `CameraSetViewOptions` / `ViewerControls`

底层 Three.js renderer 实例类型也从 `tellux` 导出，用于在外部渲染循环或自定义 pass 中直接操作 renderer：

- `TelluxRenderer`：`TelluxWebGLRenderer | TelluxWebGPURenderer` 的联合类型。
- `TelluxWebGLRenderer`：WebGL 模式下的 renderer（带 Tellux 效果扩展的 `WebGLRenderer`）。
- `TelluxWebGPURenderer`：WebGPU 模式下的 `WebGPURenderer`。

## 场景配置

`ViewerOptions.scene` 使用按领域分组的配置结构，避免把大气、云和地表参数拍平成同一层。后处理在顶层 `ViewerOptions.postProcess`。

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
        stars: {
          show: true,
          intensity: 1,
          pointSize: 1
        }
      },
      fallbackAmbientLight: {
        enabled: true,
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
      },
      look: {
        detail: true,
        turbulence: true,
        haze: true
      },
      shadow: {
        quality: 'medium'
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
    }
  },
  postProcess: {
    toneMappingExposure: 5,
    lensFlare: {
      enabled: true,
      intensity: 0.005,
      threshold: { level: 10, range: 1 },
      quality: 'medium'
    },
    smaa: { enabled: true },
    taa: { enabled: false },
    dithering: { enabled: false }
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
viewer.postProcess.smaa.enabled = true
viewer.postProcess.taa.enabled = true // WebGPU
viewer.postProcess.toneMappingExposure = 8
```

详细的逐项说明见下文「配置项参考」。

## 配置项参考

下面用一个带注释的完整配置对象说明 `ViewerOptions` 的每一项。结构上和真实配置同构：每一层对应一个领域对象，每个字段的注释标明了功能、默认值和单位。注释里标「默认 xxx」的即为不传时的取值；未标默认值的字段默认为空或未启用。

初始化配置与运行时入口同构（路径一致），因此这里的字段路径同时适用于 `new Viewer(container, { ... })` 的初始值和 `viewer.scene.*` / `viewer.postProcess.*` 的运行时修改。

```ts
const viewer = new tellux.Viewer(container, {
  // —— 影像图层：按数组顺序从下到上贴到裸球或地形表面，详见「地形与影像」
  overlays: [
    { name: '底图', source: { type: 'xyz', url: '...', levels: 19 } }
  ],

  // —— 地形：Cesium quantized-mesh 格式，自托管 url 或 cesium-ion。不传为裸球
  terrain: {
    type: 'url',
    url: 'https://example.com/terrain/layer.json',
    tileLoading: {
      errorTarget: 1,            // 地形瓦片目标屏幕空间误差，越小越精细，默认 1
      imageryResolution: 256,    // 每个地形瓦片合成影像纹理的画布分辨率，默认 256
      enableTileSplitting: false // 是否拆分地形瓦片以贴合影像边界，默认 false
    }
  },

  // —— 相机：经纬度和姿态角用「度」，height / near / far 用「米」
  camera: {
      destination: {
        longitude: 139.8,
        latitude: 35.6812,
        height: 500,
      },
      orientation: {
        heading: -90,
        pitch: -10,
        roll: 0,
      },
      projection: {
        fov: 75,
        near: 10,
        far: 1000000         // 远裁剪面（米），默认 1000000,
      },
    },

  // —— 场景时钟：currentTime 初始化支持 Date / 日期字符串 / 毫秒时间戳
  clock: {
    currentTime: '2026-09-01T08:00:00Z',
    shouldAnimate: false, // 是否随渲染循环推进；省略时，开启 Timeline 则默认 true，否则 false
    multiplier: 1        // 模拟时间倍率，默认 1；负数表示倒放
  },

  // —— 场景：按 atmosphere / clouds / surface 分组；后处理见顶层 postProcess
  scene: {
    // 大气：天空、空气透视、光照、夜景、云影
    atmosphere: {
      show: true,         // 是否启用大气天空和空气透视，默认 true

      // 光照：详见「光照模式与参数」
      lighting: {
        mode: 'post-process',    // 光照模式 'light-source' | 'post-process'，默认 'post-process'
        sunLight: true,          // 是否应用太阳直射光照，默认 true
        skyLight: true,          // 是否应用天空环境光照，默认 true
        sunLightIntensity: 1,    // 太阳光源辐射强度缩放（主要作用于 light-source），默认 1
        skyLightIntensity: 1,    // 天空光探针辐射强度缩放（主要作用于 light-source），默认 1
        albedoScale: 1,          // 后处理光照反照率缩放（主要作用于 post-process），默认 1
        photometric: {           // 光度单位，默认关闭
          enabled: false,
          sunIlluminance: 111000 // 正午太阳照度锚（lux），映射 Takram 强度缩放，不是 GPU intensity=111000
        }
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
        // stars 也可传 boolean，等价于 { show }
        stars: {
          show: true,           // 是否启用星空，默认 true
          intensity: 1,         // 星空亮度缩放，默认 1
          pointSize: 1          // 星点大小（像素），默认 1
        },
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
        enabled: true,    // 是否启用，默认 true
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
      },
      look: {
        detail: true,     // 是否启用 shape detail，默认 true
        turbulence: true, // 是否启用湍流，默认 true
        haze: true        // 是否启用雾霾，默认 true
      },
      shadow: {
        quality: 'medium' // 云影质量档位 'low' | 'medium' | 'high'，默认 medium
      }
    },

    // 实体：点 / 线 / 面的透明渲染策略
    entities: {
      transparency: {
        mode: 'auto'      // 'auto' | 'weighted-oit' | 'sorted'，默认 'auto'
      }
    },

    // 地表材质：只作用于基础地球和地形，不影响 tilesets.add / models.add
    surface: {
      materialMode: 'auto',    // 'auto'（随光照模式）| 'basic' | 'standard'，默认 'auto'
      material: {
        roughness: 1,          // 表面粗糙度 0~1，默认 1
        metalness: 0,          // 表面金属度 0~1，默认 0
        useRoughnessMap: false // 是否沿用地形 / 上游粗糙度贴图，默认 false（避免海面强反光）
      }
    }
  },

  // —— 后处理（Bloom / TAA / 镜头光晕支持 WebGPU；SMAA / 抖动为 WebGL 专属）
  // bloom / lensFlare / smaa / taa / dithering 也可传 boolean，等价于 { enabled }
  postProcess: {
    toneMappingExposure: 5,  // 色调映射曝光，默认 5；运行时也可用 viewer.postProcess.toneMappingExposure 调整
    autoExposure: {          // 自动曝光，默认关闭；用太阳高度在 min（白天）与 max（夜晚）之间插值
      enabled: false,
      min: 2,
      max: 10,
      speed: 1.5
    },
    bloom: {
      enabled: false,             // 是否启用亮部泛光，默认 false
      intensity: 1,               // 泛光强度，默认 1；乘的是已提取亮部，不是画面亮度百分比
      luminanceThreshold: 1,      // HDR 线性亮度阈值（AgX / 曝光之前），默认 1
      luminanceSmoothing: 0.03,   // 阈值过渡宽度 0~1，默认 0.03
      radius: 0.85                // 模糊扩散半径 0~1，默认 0.85
    },
    lensFlare: {
      enabled: true,         // 是否启用镜头光晕，默认 true
      intensity: 0.005,      // 光晕强度，默认 0.005
      threshold: {
        level: 10,           // 亮部提取阈值，默认 10
        range: 1             // 亮部提取过渡宽度，默认 1
      },
      quality: 'medium'      // 光晕质量档位 'low' | 'medium' | 'high'，默认 medium
    },
    smaa: { enabled: true },      // 是否启用 SMAA 抗锯齿，默认 true
    taa: { enabled: false },      // 是否启用 WebGPU TAA，默认 false
    dithering: { enabled: false } // 是否启用抖动（减少色带），默认 false
  },

  // —— Renderer：底层 Three.js renderer 创建配置，详见「Renderer 类型」
  renderer: {
    type: 'webgl',     // 'webgl'（默认）| 'webgpu'（实验性）
    transparent: false, // 是否启用透明渲染背景，优先级高于顶层 transparent
    antialias: undefined, // 是否启用 renderer 级抗锯齿
    samples: undefined,   // 多重采样数量
    forceWebGL: undefined, // 仅 type:'webgpu' 生效，强制走 Three.js WebGL2 fallback backend
    resolutionScale: Math.min(window.devicePixelRatio, 2) // 像素比，降低可提升性能
  },

  // —— 渲染循环
  useDefaultRenderLoop: true,  // 是否自动启动渲染循环，默认 true；接外部循环时设 false 并手动 render()

  // —— Draco 解码器路径，默认 '/draco/'（完整 decoder，支持 mesh 与点云）
  dracoDecoderPath: '/draco/',

  // —— 内置控件
  widgets: {
    settingsPanel: false, // 是否挂载内置调试设置面板，默认 false；传对象作为初始值
    timeline: false      // 是否挂载内置时间条，默认 false；启用后若未显式配置 shouldAnimate，则时钟默认播放
  }
})
```

几个值得注意的约定：

- **领域边界**：scene 内部按 atmosphere / clouds / surface 分组；后处理在顶层 `postProcess`，高亮在顶层 `highlighter`。新增同领域能力时会扩展对应分组对象，而非新增顶层前缀字段。
- **单位**：对外 API 统一使用度和米——经纬度、heading / pitch / roll 用度，高度、裁剪面、云层高度用米；角半径（`sunAngularRadius` 等）是弧度。
- **WebGPU 限制**：`clouds` 以及 `postProcess` 的 SMAA / 抖动在 WebGPU 模式下不渲染，调整开关无视觉效果；`bloom`、`lensFlare` 与 `taa` 已接入统一后处理图，顺序为 Bloom → LensFlare → TAA；`sky.stars` 已支持，并沿用其 `show`、`intensity` 和 `pointSize` 配置。
- **Entity 透明**：`scene.entities.transparency.mode` 默认 `auto`；WebGL 后处理管线可用时使用 weighted blended OIT，WebGPU 或不支持时退回 `sorted`。`weighted-oit` 能减少 entity 之间随视角跳变的排序异常，但它是工程近似，不是逐片元严格排序；`sorted` 保留 Three.js 默认透明排序路径，便于兼容和排查。
- **作用范围**：`surface` 只影响 Viewer 管理的基础地球和地形；`tilesets.add` / `models.add` 加载的内容有自己的材质模式（见「光照模式与参数」）。

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
- `webgpu`（实验性）：使用 Three.js `WebGPURenderer`。基础地球、3D Tiles、地形、影像、模型、拾取以及大气天空 / 空气透视 / 星空、Bloom、LensFlare 和 TAA 走 WebGPU 管线；体积云、SMAA 与抖动仍会降级为不渲染。

WebGPU renderer 需要异步初始化。推荐用 `Viewer.create(...)`，它会在返回前等待 `viewer.ready`；若使用 `new Viewer(...)` 并接入外部手动渲染循环，建议先 `await viewer.ready` 再调用 `viewer.render()`。WebGPU 模式目前不会在不支持的环境上自动回退 WebGL，需要应用层自行检测后再决定 `type`，或使用 `renderer.forceWebGL` 让 WebGPURenderer 走 Three.js 的 WebGL2 fallback backend。

## 坐标类型

```ts
interface LonLat {
  readonly longitude: number
  readonly latitude: number
}

interface LonLatHeight extends LonLat {
  readonly height: number
}

type LonLatLike = LonLat | readonly [longitude: number, latitude: number]

type LonLatHeightLike =
  | LonLatHeight
  | readonly [longitude: number, latitude: number, height: number]
```

`LonLat` 只有经纬度；`LonLatHeight` 高度必填。数组输入顺序是 `[经度, 纬度]` 或 `[经度, 纬度, 高度]`。实现不会把缺省高度补成 `0`。

## 事件类型

```ts
viewer.on('mousemove', (event) => {
  event.position
  event.cartographic
})
```

`event.position` 是相对于 canvas 左上角的像素坐标，`event.cartographic` 是命中的经纬高（`LonLatHeight`），未命中时为 `null`。
