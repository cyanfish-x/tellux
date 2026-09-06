# three-geospatial 上游能力接入盘点

> 状态：2026-08-23 上游调研快照。下面的 npm `latest`、上游 `main` 和接入判断仅指调研当时；2026-09-06 整理未访问远程重新核实。用于升级决策前应核对锁文件和对应上游入口。

## 结论（2026-08-23）

Tellux 不存在 `@takram/three-geospatial` 的正式版本滞后：当前锁定的 core `0.9.1`、atmosphere `0.19.1`、clouds `0.7.6`、effects `0.6.4` 均是对应 npm `latest`。上游 `main` 当前仍为 `b012ad06d858fc035d88aacfd73f092f93c994e4`（2026-05-27），与此前 Water Area 调研基准一致。

因此本次盘点的重点不是升级依赖，而是：上游同一仓库中尚未发布或未被 Tellux 产品化的 WebGPU / TSL 能力，以及已发布但 Tellux 有意只使用一部分的基础工具。

> 成熟度规则：**已发布** 指 npm 的稳定入口；**主分支实验** 指 `main` 中的 WebGPU 子入口；**Storybook 案例** 指只存在于 `storybook-webgpu/`，不能视为 Tellux 可直接依赖的公开 API。

## 当前对照基线

| 范围 | Tellux 当前 | 上游状态 | 判断 |
| --- | --- | --- | --- |
| core | `@takram/three-geospatial@0.9.1` | npm latest `0.9.1` | 无版本差距 |
| atmosphere | `@takram/three-atmosphere@0.19.1` | npm latest `0.19.1` | 无版本差距 |
| clouds | `@takram/three-clouds@0.7.6` | npm latest `0.7.6` | 无版本差距 |
| effects | `@takram/three-geospatial-effects@0.6.4` | npm latest `0.6.4` | 无版本差距 |
| WebGPU / TSL | 基础大气天空、空气透视、`AtmosphereLight` 已接入 | 上游为 WIP API，要求 Three.js `>=0.182` | Tellux 的 `three@0.184.x` 满足版本门槛，当时的图缺口已有后续实现，当前入口见 Takram 接入边界 |

上游还保留 `webgpu/clouds` 分支，但该分支最后一次提交为 2026-04-10，只有噪声 / 天气等构件节点，未形成可用的体积云渲染效果；它不是“main 上已有、Tellux 漏接”的成熟功能。

## 原盘点及后续补记（非当前完整能力表）

- core：Tellux 直接使用 `STBNLoader`；其余 core 主要是 Takram 大气 / 云的间接依赖。
- WebGL 大气：预计算 LUT、空气透视、太阳/月亮、星空、昼夜过渡、云影和两种光照模式已由 `AtmosphereManager` 封装。
- WebGL 云和后处理：`CloudsEffect`、`LensFlareEffect`、`DitheringEffect`、SMAA，以及 Tellux 自有的点云 EDL / Normal / 实体等 pass 已接入。
- WebGPU：`WebGPUAtmosphereManager` 已安装 `AtmosphereContext`、`AtmosphereLight` / `AtmosphereLightNode`、`SkyNode` 和基础 `AerialPerspectiveNode`；基础地球、3D Tiles、terrain、imagery、模型和拾取可走 WebGPU。
- WebGPU 星空：已加载 Tellux 自带的 `stars.bin` 并以同步创建的上游 `StarsNode` 替换默认远端节点；`scene.atmosphere.sky.stars` 的 `show`、`intensity` 和 `pointSize` 已生效。

## 原接入建议及取舍（不自动成为排期）

### P1：补齐 WebGPU 渲染图的基础体验

| 能力 | 上游实现 | Tellux 现状与缺口 | 建议边界 |
| --- | --- | --- | --- |
| 高精度速度 + TAA | `HighpVelocityNode` + `TemporalAntialiasNode` | 已接入 `highpVelocity` MRT 与 TAA history stage | 使用 `postProcess.taa`，保持独立于 WebGL SMAA |
| 抖动 | `dithering` node | WebGPU 无 Dithering；当前 `PostProcessingManager` 仅创建于 WebGL | 保持不接入：暗部视觉噪声收益不稳定，现有 API 默认关闭 |
| 镜头光晕 | `LensFlareNode`（含 WebGPU glare） | 已接入 `WebGPULensFlareManager`，复用现有 LensFlare API | order 100，运行在 TAA 之前；质量档映射内部中间纹理分辨率 |

原建议是先形成独立的 `WebGPUPostProcessingManager`（现已实现，见 [当前接入边界](takram接入边界.md)）（负责 MRT、历史 RT、resize、dispose 和输出排序），再逐项加入节点；不要把 TAA / LensFlare 继续堆进 `WebGPUAtmosphereManager`。

### P1：WebGPU 大气的高价值缺口

| 能力 | 上游实现 | Tellux 现状与缺口 | 接入前提 |
| --- | --- | --- | --- |
| 光柱 / 大气阴影 | `ShadowLengthNode`，以 CSM 和 epipolar sampling 计算相机光线路径阴影 | 当前只传入 color/depth 给 `aerialPerspective`，没有 shadow-length MRT / CSM 链 | 先确定 Tellux 的 CSM 所有权和场景 / terrain / tiles 阴影一致性；这不是一个单 shader 开关 |
| 透明 / transmission 物体的空气透视 | `aerialPerspectiveBackdrop()` | 普通 aerial perspective 不能得到透明物体背后的散射光 | 做成 Tellux NodeMaterial / 材质适配能力；须与现有 entity OIT、透明实体大气兼容性回归一起设计 |
| 天空环境照明 | `SkyEnvironmentNode` | WebGPU 有 `AtmosphereLight`，但没有基于天空节点的可控环境采样接入 | 作为 PBR 模型和水面等材质的可选环境来源，先验证与 AgX 和本地 PMREM 的颜色边界 |

### P2：Water Area（摄影测量瓦片水域重着色）

上游的 Water Area 是 `storybook-webgpu` 案例，不是 core / atmosphere 包的可发布 API。它通过 MVT 水域 mask、Worker 栅格化、`ImageOverlayPlugin` 和 `MeshPhysicalNodeMaterial` 给 Google / 摄影测量 3D Tiles 重着色；它**不是**波浪或海洋模拟。

调研初始阶段尚无该扩展点；后续已经在 `examples/water-area/` 落地案例专用 adapter，仍没有公共 Water Area API。现有 `WebGPUTerrainOverlayPlugin` 只能把可见 imagery 直接作为地表 `map`，不能保留摄影测量原底图并额外采样 mask。

建议维持已经确立的边界：

```text
WaterAreaManager
├── WaterAreaMaskSource（Shortbread / 自建 MVT / GeoJSON 等数据适配）
├── SceneTilesetMaskOverlayAdapter（唯一允许触及 3d-tiles-renderer 内部接口的位置）
└── WaterAreaMaterialAdapter（仅负责 NodeMaterial 的 PBR 参数混合）
```

不要在公共 API 中暴露 `ImageOverlayPlugin`、`XYZImageSource` 或 Shortbread 图层名；数据服务 URL 和 attribution 必须由应用层配置。完整链路、已知 `ImageBitmap` 翻转和 3d-tiles-renderer 内部 API 风险见 [three-geospatial WebGPU Water Area案例调研.md](<three-geospatial WebGPU Water Area案例调研.md>)。

### P2：已发布 WebGL 能力的“深度封装”缺口

| 能力 | 上游能力 | Tellux 缺口 | 是否建议公开 |
| --- | --- | --- | --- |
| 自定义体积云资源和多层云 | `CloudLayer(s)`、`LocalWeather`、`CloudShape` / `CloudShapeDetail`、`Turbulence`、程序化纹理 | Tellux 目前只暴露一个低云层组、coverage/speed/look/shadow，并固定加载内置天气 / 湍流纹理 | 需要时扩展为 `scene.clouds.layers[]` 和显式 asset source；不要暴露 Takram 实例 |
| 色彩查找表 | effects 的 `createHaldLookupTexture` | 没有面向用户的 color-grading 领域 API | 仅在有明确调色用例时加入；必须与 AgX、display-referred 点云和最终 Output pass 一起验收 |
| Depth / Normal / Geometry 调试效果 | `DepthEffect`、`NormalEffect`、`GeometryEffect` / `GeometryPass` | Tellux 只有为功能服务的 NormalPass，不提供通用调试输出 | P3，优先作为 DebugSettingsPanel 的开发工具，不建议成为常规 Viewer 配置 |

### P3：core 工具未直接接入（大多应保持不接）

| 上游工具 | Tellux 状态 | 结论 |
| --- | --- | --- |
| `Geodetic`、`PointOfView` | Tellux 已有普通经纬高 tuple / object 与 `Camera.setView` / `flyTo` | 可作为内部 adapter 的候选；不应把第三方类暴露为公开 API，以免和 3d-tiles-renderer `Ellipsoid` 形成双类型体系 |
| `Rectangle`、`TileCoordinate`、`TilingScheme` | terrain / overlay / sampling 各自已有投影、瓦片和范围处理 | 有重构需求时再做内部复用；没有用户价值时不新增对外 API |
| `ArrayBufferLoader`、`TypedArrayLoader`、`DataTextureLoader`、EXR loaders | STBN 已用专用 loader；云纹理仍由 Tellux 手动 fetch / `TextureLoader` | 可用于统一资产加载、取消和 dispose，属于内部清理项；先定义 Tellux asset lifecycle，不直接透出 loader |
| `EllipsoidGeometry`、`QuadGeometry`、geometry 序列化、shader helpers、decorators、R3F 入口 | 未直接使用 | 调试 globe / worker geometry 时可取用；R3F 不在 Tellux 的 vanilla Viewer 产品边界内 |

## 推荐接入顺序

1. **WebGPU 后处理图基础设施**：已完成 MRT、resize、资源释放和最终输出排序，并接入高精度 velocity + TAA、LensFlare。dithering 经暗部视觉评估不排期，保留 WebGL 默认关闭能力。
2. **WebGPU 光柱与透明空气透视**：必须先完成 CSM / OIT / NodeMaterial 的责任划分和回归矩阵，不适合跳过图基础设施直接实现。
3. **Water Area**：按上面的三层 adapter 先做数据源无关 MVP；与 GPUOcean 保持组合关系，而不是互相替代。
4. **多层 / 自定义云资源、LUT 和 debug pass**：只由明确产品需求驱动；`webgpu/clouds` 在上游完成可用 cloud effect 前不排期。

## 验收与升级关注点

- WebGPU 每项都要在真 WebGPU 与 `renderer.forceWebGL` fallback 中分别验证；不能用 WebGL 成功替代 WebGPU 验收。
- TAA / 阴影 / Water Area 至少覆盖 ECEF 高空、近地、相机快速运动、resize、tiles unload/reload 和 `viewer.destroy()` 的资源释放。
- Water Area 要覆盖 mask 方向、桥梁/码头扣除、并发取消、来源 attribution，以及升级 `3d-tiles-renderer` 后的插件内部接口回归。
- 上游声明 WebGPU API 将替换当前 shader-chunk API，且 effects 计划并入 core；升级不能只看 semver，应复核 `packages/*/WEBGPU.md`、上游 main 提交和 Tellux 的 renderer adapter 边界。

## 一手来源

- 上游仓库与 WebGPU 路线说明：<https://github.com/takram-design-engineering/three-geospatial>
- upstream main 基准：<https://github.com/takram-design-engineering/three-geospatial/tree/b012ad06d858fc035d88aacfd73f092f93c994e4>
- core WebGPU API：<https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/packages/core/WEBGPU.md>
- atmosphere WebGPU API：<https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/packages/atmosphere/WEBGPU.md>
- npm core latest：<https://www.npmjs.com/package/@takram/three-geospatial>
