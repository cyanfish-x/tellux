# 场景效果：大气 / 光照 / 体积云 / 后处理 / 地表材质

所有视觉氛围能力按领域分组：大气 / 云 / 地表在 `viewer.scene` 下，后处理在顶层 `viewer.postProcess`。**初始化配置与运行时入口同构**（路径一致），下文示例两种用法通用。

## 光照模式（先选模式再调参）

Tellux 有两种大气光照模式，默认 `post-process`。这是最关键的选择，决定材质和受光方式。

```ts
viewer.scene.atmosphere.lighting.mode = 'light-source'   // 或 'post-process'
```

| 模式 | 原理 | 适用 |
| --- | --- | --- |
| `'post-process'`（默认） | 把渲染结果当 albedo，在 `AerialPerspectiveEffect` 里应用大气光照 | 需要统一大气后处理的高级场景；输入材质必须是不受光的（basic / unlit） |
| `'light-source'` | 用 Takram 太阳方向光 + 天空光探针，材质走 Three.js 常规受光 | 3D Tiles、地形、overlay、自定义模型、PBR——**大多数 GIS 场景** |

### light-source 调光

```ts
viewer.scene.atmosphere.lighting.sunLight = true
viewer.scene.atmosphere.lighting.skyLight = true
viewer.scene.atmosphere.lighting.sunLightIntensity = 1.2
viewer.scene.atmosphere.lighting.skyLightIntensity = 0.8
viewer.scene.atmosphere.lighting.photometric.enabled = true
viewer.scene.atmosphere.lighting.photometric.sunIlluminance = 111000
```

### post-process 注意事项

PBR / 受光材质在 post-process 模式下光源会被关闭，瓦片可能变暗变黑。此时要么改回 `light-source`，要么给需要后处理光照的 3D Tiles 用 `materialMode: 'unlit'`：

```ts
const layer = viewer.tilesets.add({
  source: {
    type: 'url',
    url: '...'
  },
  materialMode: 'unlit'
})
viewer.scene.atmosphere.lighting.albedoScale = 0.6
```

## 大气与天空

```ts
viewer.scene.atmosphere.show = true   // 总开关，关掉则天空/空气透视/太阳光都不渲染
```

默认世界是 ECEF，不必改大气矩阵。仅当应用已经把 Three.js 世界从 ECEF 换走时：

```ts
viewer.scene.atmosphere.setWorldToECEFMatrix(worldToECEF) // 与场景重基准同一套；正交、只含平移旋转
viewer.scene.atmosphere.getWorldToECEFMatrix()
viewer.scene.atmosphere.setWorldToECEFMatrix(new THREE.Matrix4()) // 单位阵恢复默认
```

不要用 `viewer.atmosphere`。`cartographicToMatrix4` 是物体 Y-up / Z-forward，不是 ENU；仅当整个世界就用这套框架时才能把它当作 world→ECEF。地球 / 相机 / 控件仍按 ECEF。

### 空气散射（远处发蓝发雾）

```ts
viewer.scene.atmosphere.scattering.intensity = 0.6              // 0~1，内散射强度
viewer.scene.atmosphere.scattering.transmittance = true         // 远处光被大气衰减
viewer.scene.atmosphere.scattering.inscatter = true             // 进入视线的散射光
viewer.scene.atmosphere.scattering.rayleighScatteringScale = 1  // 影响天空蓝色
viewer.scene.atmosphere.scattering.mieScatteringScale = 1       // 影响光晕/朝晚霞
viewer.scene.atmosphere.scattering.groundAlbedo = 0.1           // 地表对天空的反射
// 其余：solarIrradianceScale / mieExtinctionScale / miePhaseFunctionG / absorptionExtinctionScale
```

> WebGPU 模式下部分散射调试参数不映射，`light-source` 模式支持更完整。

### 天空元素（太阳/月亮/星空）

```ts
viewer.scene.atmosphere.sky.sun = true
viewer.scene.atmosphere.sky.moon = true
viewer.scene.atmosphere.sky.stars.show = true
viewer.scene.atmosphere.sky.stars.intensity = 1
viewer.scene.atmosphere.sky.sunAngularRadius = 0.004675   // 弧度！
```

> 星空在 WebGPU 模式下已支持，并沿用 `show`、`intensity` 与 `pointSize` 配置。

### 夜景（太阳落山后的补光）

```ts
viewer.scene.atmosphere.night.enabled = true
viewer.scene.atmosphere.night.moonLight = true            // 月光方向光
viewer.scene.atmosphere.night.ambientLight = true         // 冷色环境补光
viewer.scene.atmosphere.night.moonLightIntensity = 0.18
viewer.scene.atmosphere.night.useMoonPhase = true         // 按月相衰减月光
```

### 云影 & 兜底环境光

```ts
viewer.scene.atmosphere.shadow.radius = 8         // 体积云投地阴影的模糊半径
viewer.scene.atmosphere.shadow.sampleCount = 4    // 1~16

viewer.scene.atmosphere.fallbackAmbientLight.enabled = true   // 独立于夜景的兜底环境光
viewer.scene.atmosphere.fallbackAmbientLight.intensity = 0.5
```

## 体积云

WebGL 云专用贴图按需加载：初始关闭云时不请求天气、湍流、形状和细节贴图。大气与云同时开启、且大气散射纹理就绪后加载；关闭再开启复用成功项，仅失败项在再次开启时重试。大气共用的 STBN 仍加载，云效果对象仍在初始化时创建。

> **WebGL 专属，WebGPU 模式下完全不渲染**——WebGPU 下应 `clouds.show = false`。

```ts
viewer.scene.clouds.show = true
viewer.scene.clouds.quality = 'medium'   // 'low' | 'medium' | 'high' | 'ultra'
viewer.scene.clouds.coverage = 0.35      // 0~1 覆盖率
viewer.scene.clouds.lightShafts = true   // 云缝光柱
viewer.scene.clouds.speed = 0.001        // UV 偏移/秒
viewer.scene.clouds.layer.altitude = 1500 // 低云层组云底高度（米）
viewer.scene.clouds.layer.height = 650    // 低云层组厚度（米）
viewer.scene.clouds.look.detail = true
viewer.scene.clouds.look.turbulence = true
viewer.scene.clouds.look.haze = true
viewer.scene.clouds.shadow.quality = 'medium' // 'low' | 'medium' | 'high'
```

典型用法：阴天效果 `coverage = 0.7, quality = 'high'`；关云 `show = false`。体积云从大约 20 km 起随相机高度淡出，约 40 km 以上不渲染；`show` / `coverage` 不会被改写。

## 地球皮肤

只作用于 Viewer 管理的基础地球和地形，不影响 `tilesets.add` / `models.add`。没有 `ViewerOptions.globe`，构造后赋值。

```ts
viewer.globe.show = true
viewer.globe.opacity = 1                 // 整张皮肤透明度；不等于 overlay.style.opacity
viewer.globe.material.mode = 'auto'      // 'auto'(随光照) | 'basic' | 'standard'
viewer.globe.material.roughness = 1
viewer.globe.material.metalness = 0
viewer.globe.material.useRoughnessMap = false   // 关掉可避免海面强太阳反光
```

## 后处理

每个阶段用 `.enabled` 单独控制；色调曝光是顶层属性。

```ts
viewer.postProcess.smaa.enabled = true
viewer.postProcess.bloom.enabled = true
viewer.postProcess.bloom.intensity = 1.2
viewer.postProcess.bloom.luminanceThreshold = 0.6
viewer.postProcess.lensFlare.enabled = true
viewer.postProcess.lensFlare.intensity = 0.005
viewer.postProcess.lensFlare.quality = 'medium'
viewer.postProcess.taa.enabled = true // WebGPU，默认 false
viewer.postProcess.dithering.enabled = false
viewer.postProcess.autoExposure.enabled = false
viewer.postProcess.toneMapping.exposure = 10
viewer.postProcess.toneMapping.mode = 'agx'
```

> Bloom 在 WebGL / WebGPU 均可用，基于整帧 HDR 亮度提取。`luminanceThreshold` 比的是 AgX / 曝光之前的线性 luma，不是屏幕看起来有多亮。`intensity` 乘的是已经提取的亮部，不是画面亮度百分比。城市夜景用 `models.add({ lighting: 'local' })`，点光挂在带 `scale` 的 glTF 根上并按 `(scale / 0.01)²` 补偿 intensity，打开 `photometric`（只缩放太阳）+ `autoExposure`；不要关太阳。夜景不依赖 Bloom（上游 Non-geospatial 未开）。WebGPU 顺序固定为 Bloom → LensFlare → TAA；SMAA / 抖动仍不渲染。WebGPU 暂无 lighting mask。

## 完整初始化示例

```ts
const viewer = new tellux.Viewer(container, {
  scene: {
    atmosphere: {
      show: true,
      lighting: { mode: 'light-source', sunLightIntensity: 1.2, skyLightIntensity: 0.8 },
      night: { enabled: true, moonLight: true },
      scattering: { intensity: 0.6 },
      sky: { stars: { show: true, intensity: 1 } }
    },
    clouds: {
      show: true,
      quality: 'medium',
      coverage: 0.35,
      look: { detail: true, turbulence: true, haze: true },
      shadow: { quality: 'medium' }
    }
  },
  postProcess: {
    bloom: { enabled: false, intensity: 1, luminanceThreshold: 1, luminanceSmoothing: 0.03, radius: 0.85 },
    lensFlare: { enabled: true, intensity: 0.005, quality: 'medium' },
    smaa: true,
    autoExposure: false,
    toneMapping: { exposure: 5 }
  }
})
```
# 渲染边界实验入口

2026-09-12 已调整计划：用户目标是遮挡正确、性能良好，优先复用上游；A1 联合积分是参考研究，A2 新增折射不在本次范围，A3 按实际算法依赖引用。旧 A1–A3 不再是实施前置，不能将实验 helper 当成应用开发或核心重构的默认路线。当前范围见 `notes/decisions/统一场景渲染与大气透明合成架构.md`。

`examples/rendering-stages.ts`、`rendering-splat-atmosphere.ts`、`rendering-cloud-transparency.ts` 是 WebGL Sandcastle 实验。使用说明见 `docs/guide/rendering-prototypes.md`。所有 `rendering-*` 实验页登记在 `examples/experimental-examples.ts`，只由开发服务提供，生产构建不含其入口、源码与 helper。实验 helper 访问内部管线并注入 shader，不能作为公开应用 API 范例；这些原型本身不提供云穿插或跨渲染器统一排序。

2026-09-13 阶段 0 复验入口为 `examples/rendering-prototypes/verify-stages.mjs`，需已运行的 Vite 开发服务。它包含 Three.js 材质组／深度／阴影／回调的小场景正负对照和真实入口观测；执行成功不等于视觉或性能验收。`withSubmissionState` 只供实验，不是应用 API，也不承诺动态回调、transmission 和跨渲染器排序。

同日开发分支已完成云／大气开关下统一的内部 `SceneSubmission`、共享透明空气透视，以及普通透明／实体 OIT／Spark 的有限混合分段；应用继续使用原领域 API，无需调用内部适配器。最多剥离八层表面，超出部分保留原排序近似并继续绘制。用户确认的 RTX 3060 Ti、1920×1080、DPR 1 场景平均 76.33 FPS，达到本版 60 FPS 目标，运动、生命周期与实际入口兼容检查通过；不是任意场景的帧率保证。云穿插暂缓，既有 WebGPU 能力边界不变。最终证据和限制见 `notes/research/阶段2混合透明分段实现与验证.md`。架构收尾后，实体单独与混合均由统一透明阶段调度；深度由本帧资源上下文显式提供，移除实体独立 pass、去重标志与双缓冲深度探测。标注仍在输出后绘制，异常时清理帧状态。应用只使用既有领域 API，不调用这些内部帧接口。

`examples/rendering-medium-integration.ts` 是 A1 算法实验，不是生产大气 API。联合参考支持直接单次散射与 LUT 有限区间等效空气源项，默认 64 步空气网格、云内 5 m 细化及 T < 1e-6 终止；不代表空气与云完整多次散射耦合。

GPU 检查包括 14 组解析积分、55 组稳定球面映射、真实介质对 8192 步加边界参考及 4096 步差异。吸收权重深度近似使用稳定球面映射，保留原采样质量和历史资源，参考控件在这两种模式禁用。固定稳定映射云样本的合成比较会统一关闭 shadow length，仅用于隔离空气合成误差。分别记录整帧与额外参考 draw 成本；性能要求同条件不低于原方案，不能从解析通过或单场景耗时推出管线已验收。详见 `docs/guide/rendering-prototypes.md` 与 `notes/research/A1联合介质积分验证.md`。

`examples/rendering-medium-coverage.ts` 为 A3 有效域实验，以解析介质证明双线性查询足迹必须完整覆盖、截断尾段必须部分积分、无效历史不能当真空。独立/Sandcastle、DPR 与 resize 检查不等于真实云、透视重投影或折射已支持；不可当作公开介质查询 API。

`examples/rendering-refraction-medium.ts` 为 A2 原生 transmission 与解析介质路径实验，使用原生光学厚度和平行界面参考。粗糙、离屏和遮挡必须保留能力/有效性含义，不能将实验 helper 当作公开折射 API，也不能以解析对照批准真实云质量。
