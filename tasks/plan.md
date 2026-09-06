# Implementation Plan: WebGPU 水域外观第一阶段

## 文档信息

- 状态：代码已实施并通过自动化验证，待 WebGPU 浏览器视觉与性能验收
- 日期：2026-08-23
- 分支：`feat-water`
- 交付形态：`examples/water-area` 案例级增强
- 公开 API：本阶段不进入 `src/`，不承诺稳定 API
- 配套任务清单：[`tasks/todo.md`](todo.md)
- 既有调研：[`notes/research/three-geospatial WebGPU Water Area案例调研.md`](<../notes/research/three-geospatial WebGPU Water Area案例调研.md>)

## 目标

在现有 OSM Shortbread MVT 水域 Mask 和 Google Photorealistic 3D Tiles 材质替换链路上，增加第一版可见、连续、可调的水面外观：

1. 水面具有持续运动且周期复位不可见的 Valve / Water2 双相位法线波纹。
2. 波纹在相机移动、瓦片加载和 LOD 切换时保持地理位置稳定，不随瓦片 UV 重置。
3. 继续使用 `MeshPhysicalNodeMaterial` 的 IOR、粗糙度和镜面 BRDF 表达 Fresnel 与太阳高光，不重复实现第二套不守恒的高光模型。
4. 水色、粗糙度、波浪强度、尺度、速度和方向可以在现有通用参数面板中实时调整。
5. 所有运行时调整通过共享 TSL uniform 生效，不重建 tileset、不重新编译 shader、不增加独立渲染循环。

本阶段的核心问题不是“模拟真实海洋”，而是验证：在大范围 3D Tiles 水域 Mask 上，能否以很小的运行成本获得稳定、可信的动态水面质感。

## 非目标

本阶段明确不包含：

- 独立水面 Mesh、统一水位面或顶点位移。
- Gerstner、FFT、GPUOcean 或浅水方程模拟。
- 平面反射、SSR、额外场景反射 RenderTarget。
- 场景颜色/深度折射、水下、水线和焦散。
- 真实水深、bathymetry、浅水颜色或岸线距离场。
- 岸线泡沫、浪花、船只尾流和交互涟漪。
- `WaterAreaController`、`Load3DTilesetOptions.waterArea` 等内部或公开 API。
- 修改 MVT Worker 数量、LIFO 调度、Mask 格式和缓存策略。

岸线距离、泡沫和独立水面几何分别属于后续阶段，不应为了第一版视觉效果混入本次交付。

## 当前基线

当前 `WaterAreaNodeMaterial` 已经：

- 使用 `MeshPhysicalNodeMaterial`，`ior = 1.33`、`metalness = 0`。
- 按 Mask 混合水色、粗糙度和镜面强度。
- 把水域法线压平到 WGS84 椭球法线，消除摄影测量水面的噪声法线。
- 继续参与 Tellux WebGPU 大气、光源式照明和 tone mapping。
- 通过共享 `WaterAreaEffect.weightNode` 控制 Mask 效果显隐。

当前尚无随时间变化的法线，也没有可调外观参数。水域看起来更像一块深色、光滑区域，而不是真正运动的水面。

## 架构决策

### 1. 保持案例级边界

第一版继续放在 `examples/water-area/`：

```text
WaterAreaDemo
├── WaterAreaMaterialPlugin
│   └── WaterAreaEffect（共享用户态和 TSL uniforms）
├── WaterAreaNodeMaterial（材质图）
├── WaterAreaOverlayPlugin（Mask 绑定）
└── WaterArea Worker Pool（保持不变）
```

只有浏览器视觉和性能验收通过后，才评估是否提取到 `src/`。这样可以避免尚未稳定的波纹坐标、参数范围和光照语义提前扩散成公共 API。

### 2. 使用 Valve / Three.js Water2 双相位流动

实际实现固定复用 Three.js r184 Water2 案例的 `Water_1_M_Normal.jpg` 与 `Water_2_M_Normal.jpg`。两张资源随 Tellux 案例本地打包，在同一 ENU 基础 UV 上使用同一流向和尺度，分别承担相隔半周期的 A/B 动画相位：

```text
A 相位 normal sample ─┐
                     ├─ 三角形权重交叉淡入
B 相位 normal sample ─┘
          （相位恒差半周期）
          ↓
切平面法线 + 距离衰减
          ↓
按 Water Area Mask 与椭球法线混合
```

选择该方案的原因：

- 对齐 Valve Water Flow 与 Three.js r184 `Water2Mesh` 的核心周期逻辑。
- 不需要每帧 compute，也不增加 RenderTarget。
- A/B 相位恒差半周期，在一个相位回绕时由另一个相位接管，隐藏 reset 跳变。
- 两张法线贴图不再反向或大角度交叉滚动，运动由一个地理主流向统一控制。
- 资源固定到 Three.js r184，不在运行时热链 GitHub，也不随上游 `dev` 分支漂移。

这一版是刻意隔离的 Valve 基线，不叠加 Unity 的 simulation bands，也不叠加 Unreal 的方向扩散。后续实验必须作为独立增量加入，视觉效果不成立时可以单独丢弃。

Three.js Water2 同时支持 `flowMap` 和固定 `flowDirection`。当前 Water Area 尚无河道/海流矢量场输入，因此本阶段明确使用固定 `flowDirection` 分支；双相位与交叉淡入逻辑保持一致，但不宣称已经实现空间变化的流场。真实弯曲河流流向需要后续单独提供 flow map 或矢量场数据。

纹理按 `NoColorSpace` 数据纹理处理，并启用 RepeatWrapping、mipmap、三线性与各向异性过滤。其生命周期归 `WaterAreaEffect` 所有，在案例销毁时成对释放。`WaterAreaNormalTexture.ts` 中的确定性生成纹理仅保留为无 DOM 测试和直接构造材质时的后备输入，不再是案例默认视觉资源。资源来源、许可证链接和校验值记录在 `examples/water-area/assets/NOTICE.md`；若后续进入严格商业发行，需要重新确认图片资产的独立来源声明或替换为自有/CC0 资源。

### 3. 波纹使用固定地点 ENU 米制坐标，不使用瓦片 UV

`layer_uv_0` 只用于采样水域 Mask。波纹不能直接使用它，否则每个 overlay tile 会重新开始纹理相位，形成可见接缝。

第一选择是在案例中心建立固定 ENU（East-North-Up）切平面，以米为单位计算波纹坐标：

1. 使用固定地点作为 wave origin。
2. 将片元相对 origin 的位置投影到 east/north 方向。
3. 用 ENU 米制坐标计算共享的基础 normal UV。
4. 将合成后的切平面法线转换到 view space。

坐标计算必须优先使用 camera-relative/view-space 量，避免直接把约 6,000 km 的 ECEF 坐标乘以高频纹理尺度。Viewer 已开启 Three.js WebGPU `highPrecision`，但这不等于可以忽略 shader 中的大数相减风险。

如果固定 ENU 方案在相机平移时仍出现 phase swimming 或亚像素抖动，应先修正坐标链路；不得以屏幕空间 UV 或每瓦片随机相位掩盖问题。

### 4. 动画复用 Three.js render-group uniform

波纹相位使用 `WaterAreaEffect` 共享的 TSL uniform，并通过 `renderGroup.onRenderUpdate` 每次 render 推进一次。相位始终回绕在 `0..0.15`，既对齐 Water2 的小范围 `flowConfig`，也避免把长期运行后的大时间值带进 shader；运行时修改速度只改变后续推进量，不会让当前相位跳变。禁止新增：

- `requestAnimationFrame`。
- 第二个 canvas 或 renderer。
- 为每个 tile 注册 JS 帧回调。
- 每帧遍历所有水域材质更新 uniform。

所有 `WaterAreaNodeMaterial` 继续共享同一个 `WaterAreaEffect`，已加载和后加载瓦片必须观察到相同参数与流动相位。

### 5. Fresnel 和太阳高光优先复用现有 PBR

`MeshPhysicalNodeMaterial` 已经根据 IOR 和视角计算介质 Fresnel。第一版应通过以下输入驱动现有 BRDF：

- `ior = 1.33`。
- 水域 roughness。
- Valve 双相位动态 normal。
- 现有 AtmosphereLight 的太阳直射光与 sky light。

不额外叠加一个独立的 `pow(1 - N·V, 5)` 颜色项，也不添加不受粗糙度和能量约束的假高光。只有浏览器证据证明现有 AtmosphereLight 无法产生可接受的太阳高光时，才单独提出补充方案。

### 6. 距离过滤属于第一阶段

重复法线在远距离容易产生闪烁和摩尔纹。材质需要根据相机到片元的距离逐步降低法线扰动强度：

- 近景：完整双相位法线扰动。
- 中景：逐渐衰减扰动强度。
- 远景：回退到接近椭球法线的平滑高光。

该衰减只能降低波纹强度，不能改变 Mask 边界或让水域在远景消失。

## 案例参数

`WaterAreaEffect` 从只有 `show` 的共享状态扩展为案例级 appearance 状态。建议第一版暴露：

| 参数 | 语义 | 初始范围方向 |
| --- | --- | --- |
| `show` | 水域外观贡献显隐 | `boolean` |
| `color` | 主水色 | HTML color |
| `colorMix` | 原摄影测量颜色向主水色混合的比例 | `0..1` |
| `roughness` | 水面微表面粗糙度 | `0.05..0.8` |
| `waveStrength` | 动态法线总强度 | `0..1` |
| `waveScale` | 双相位共享基础 UV 的米制尺度倍率 | 正数，使用有限上下限 |
| `waveSpeed` | Water2 流动相位的时间倍率 | `0..2` 左右，具体默认值经视觉调试确定 |
| `waveDirection` | 主波向，地理方位角，顺时针从北开始 | `0..360` 度 |

周期长度、半周期间距和基础相位速度按 Three.js r184 Water2 固定为材质内部常量，避免第一版面板变成底层 shader 调试器。只有视觉验收证明单一控制不足时，再把 Unity bands 或 Unreal 方向扩散作为独立实验加入。

初始化和运行时使用同一对象形状：

```ts
const demo = createWaterAreaDemo({
  viewer,
  apiToken,
  appearance: {
    show: true,
    color: '#06172d',
    colorMix: 0.8,
    roughness: 0.34,
    waveStrength: 0.22,
    waveScale: 1,
    waveSpeed: 1,
    waveDirection: 35
  }
})

demo.appearance.waveStrength = 0.5
```

这只是 Sandcastle helper 的案例级接口，不进入 Tellux 公共类型。

## 参数面板

继续复用项目通用 `.example-panel`：

- Token 输入框继续保留，按 Enter 重新加载数据源。
- “显示水域 Mask 效果”调整为“显示水域外观”，语义包含颜色和波纹贡献。
- 增加“外观”分组：颜色、颜色混合、粗糙度。
- 增加“波纹”分组：强度、尺度、速度、方向。
- 参数改变时只更新 `WaterAreaEffect` uniforms。
- 所有新增静态文案同步 `_messages.json` 并重新生成中英文词典。
- 不新增独立面板实现、第三方 GUI 或旧 `.toolbar` 外壳。

默认值应以当前固定镜头下“能看到运动但不夸张”为准，同时验证向近景缩放后的表现。默认值最终由浏览器视觉检查确定，计划阶段不把临时调试值视为 API 契约。

## 依赖关系

```text
任务 1：ENU 波纹坐标与 TSL 编译验证
    │
    ├── 任务 2：Valve 双相位法线与 PBR 外观
    │       │
    │       └── 任务 3：共享 appearance 状态和案例接口
    │               │
    │               └── 任务 4：通用参数面板接入
    │
    └── 任务 5：单元、构建和浏览器视觉/性能验收
```

任务 1 是 fail-fast 检查。波纹坐标不稳定时，不应继续堆颜色、高光和 UI。

## 实施任务

### Task 1：验证稳定的 ENU 波纹坐标

**描述：** 在固定案例中心建立 ENU frame，用 camera-relative/view-space 路径得到连续米制波纹坐标，先用临时可视化或单频法线验证相机移动、tile 边界和大数精度。

**验收标准：**

- [ ] 相机静止时波纹持续运动。
- [ ] 相机平移、旋转和缩放时，波纹相位固定在地理表面，不随屏幕或瓦片游动。
- [ ] 相邻瓦片和 LOD 切换处没有由波纹坐标造成的相位接缝。

**验证：**

- [x] `pnpm type-check`
- [ ] 固定镜头、近景和相机运动三组 WebGPU 手工检查。
- [ ] 浏览器控制台没有 shader 编译错误或持续 warning。

**依赖：** 无。

**可能涉及文件：**

- `examples/water-area/WaterAreaNodeMaterial.ts`
- `examples/water-area/createWaterAreaDemo.ts`
- `examples/water-area/WaterAreaAppearance.ts`（如需拆分坐标和状态）

**规模：** M，2–3 个文件。

### Task 2：实现 Valve / Water2 双相位动态法线和 PBR 外观

**描述：** 加入 Three.js Water2 的两张法线资源，以同一基础 UV 和主流向采样相隔半周期的 A/B 相位，并按三角形权重交叉淡入；使用 Mask 与椭球法线混合，增加远距离衰减，继续由现有物理材质负责 Fresnel 和太阳高光。

**验收标准：**

- [ ] 水域运动方向统一，周期回绕没有可见 reset，陆地和扣除结构不受影响。
- [ ] 远景没有明显摩尔纹、闪烁或破碎高光。
- [ ] `show = false` 时动态法线、颜色和水域高光贡献一并关闭。

**验证：**

- [x] 聚焦材质测试通过。
- [x] `pnpm type-check`
- [ ] 固定时间、白天低太阳角和高太阳角三组视觉检查。

**依赖：** Task 1。

**可能涉及文件：**

- `examples/water-area/WaterAreaNodeMaterial.ts`
- `examples/water-area/WaterAreaAppearance.ts`
- `examples/water-area/assets/Water_*_M_Normal.jpg`
- `examples/water-area/assets/NOTICE.md`

**规模：** M，2–3 个文件和 1 个小型资源。

### Task 3：收口共享 appearance 状态和案例接口

**描述：** 将颜色、混合比例、粗糙度和波纹参数统一放进 `WaterAreaEffect` 或独立的 `WaterAreaAppearance`，让所有材质共享 uniform，并让 `createWaterAreaDemo()` 的初始化配置与 `demo.appearance` 运行时入口同构。

**验收标准：**

- [x] 已加载瓦片和参数修改后新加载瓦片使用同一组状态。
- [x] 参数更新不重建材质、不重新注册 plugin、不重新加载 tileset。
- [x] 输入值经过有限值、范围和颜色归一化，不允许 `NaN` 进入 uniform。

**验证：**

- [x] 补充 `WaterAreaMaterialPlugin.test.ts` 或独立 appearance 单元测试。
- [x] `pnpm test:run -- examples/water-area`
- [x] `pnpm type-check`

**依赖：** Task 2。

**可能涉及文件：**

- `examples/water-area/WaterAreaAppearance.ts`
- `examples/water-area/WaterAreaNodeMaterial.ts`
- `examples/water-area/WaterAreaMaterialPlugin.ts`
- `examples/water-area/createWaterAreaDemo.ts`
- `examples/water-area/WaterAreaMaterialPlugin.test.ts`

**规模：** M，4–5 个文件。

### Checkpoint A：材质链路

- [ ] ENU 波纹坐标已通过相机运动验证。
- [ ] Valve 双相位 normal 没有 tile 接缝或周期复位跳变。
- [x] 现有 Mask、8 Worker 和 overlay 生命周期未被修改。
- [x] 聚焦测试和类型检查通过。

### Task 4：接入通用参数面板

**描述：** 在现有 `.example-panel` 中增加外观和波纹控件，参数直接绑定 `demo.appearance`，保留 Token 输入与显隐控制，并同步中英文文案。

**验收标准：**

- [x] 面板只使用项目通用控件结构和样式。
- [x] 修改参数立即影响已加载水域，不触发 tileset 重载。
- [x] Token Enter 重载后保留当前 appearance 参数和显隐状态。

**验证：**

- [ ] 独立示例和 Sandcastle 中控件均可操作。
- [ ] 键盘操作、label 绑定和状态文案正常。
- [x] i18n 生成文件与 `_messages.json` 一致。

**依赖：** Task 3。

**可能涉及文件：**

- `examples/water-area.html`
- `examples/water-area.ts`
- `examples/i18n/_messages.json`
- `examples/i18n/messages/zh.ts`
- `examples/i18n/messages/en.ts`

**规模：** M，5 个文件，其中 2 个为生成词典。

### Task 5：回归、构建和视觉性能验收

**描述：** 验证 Mask、Worker、材质替换、Sandcastle 动态 binding、构建预算和 WebGPU 运行表现，记录基线与增强后的差异。

**验收标准：**

- [ ] 水面运动可见但不过度夸张，太阳高光随视角和光照变化。
- [ ] 桥梁、码头、水坝和陆地没有被波纹或水色污染。
- [ ] 快速移动、LOD 切换和显隐切换后无黑块、白块、纹理翻转或状态滞留。
- [ ] 不增加 draw call、RenderTarget、Worker 或独立渲染循环。
- [ ] 相同设备、分辨率和镜头下，增强版 60 秒 P95 帧时间相对基线增加不超过 10%。

**验证：**

- [x] `pnpm test:run`
- [x] `pnpm type-check`
- [x] `pnpm build:examples`
- [x] `git diff --check`
- [ ] WebGPU 浏览器控制台无持续 error / warning。
- [ ] 记录固定镜头截图、近景截图和 60 秒性能采样。

**依赖：** Task 4。

**可能涉及文件：**

- `examples/water-area/**`
- `examples/sandcastle/runtime-bindings.test.ts`（仅在 binding 变化时）
- `notes/research/three-geospatial WebGPU Water Area案例调研.md`（补充最终实现与验收）

**规模：** S–M，主要是验证和文档回填。

### Checkpoint B：第一阶段完成

- [x] 全量测试、类型检查和 examples 构建通过。
- [ ] 浏览器视觉验收通过且无持续控制台错误。
- [ ] 性能和构建体积未越过既有预算。
- [ ] 调研文档记录实际实现、默认参数、证据链和已知限制。
- [ ] 仍保持案例级实现，没有提前扩展公共 API。

## 视觉验收矩阵

| 场景 | 需要观察的结果 |
| --- | --- |
| 当前默认 100 km 镜头 | 大范围水域有连续、克制的运动高光，不出现密集闪烁 |
| 中距离斜视 | 主流向可辨，两张贴图不再表现为交叉流动 |
| 近距离观察 | A/B 交叉淡入不出现周期复位、明显脉冲或纹理方格 |
| 相机平移/旋转 | 波纹固定在地表，不粘屏、不跳相位 |
| LOD 加载/替换 | 新旧 tile 的颜色、波纹和参数一致 |
| 岸线与结构物 | Mask 边界保持原有精度，桥梁、码头、水坝不受影响 |
| 显隐切换 | 一次 uniform 更新完成切换，无重载和闪帧 |
| Token 重载 | 外观参数保持，只有数据图层重新创建 |

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
| --- | --- | --- |
| ECEF 大数导致波纹抖动 | 高 | 固定 ENU anchor、camera-relative/view-space 投影；坐标验证先于视觉堆叠 |
| 使用 overlay UV 造成 tile 接缝 | 高 | overlay UV 仅采 Mask；波纹统一使用 ENU 米制坐标 |
| 动态 normal 方向与椭球切平面不一致 | 高 | 明确 east/north/up 基向量和 view-space 转换，使用法线可视化检查 |
| 高频 normal 在远景闪烁 | 中 | 按距离衰减整体扰动；必要时提高 roughness，而不是增加后处理模糊 |
| 自定义 Fresnel 与 PBR 重复计能 | 中 | 第一版只使用 MeshPhysicalNodeMaterial 现有 IOR/BRDF |
| 法线资源色彩空间或翻转错误 | 中 | 使用线性数据纹理、固定 wrap、单独验证方向；不复用 Mask 的 ImageBitmap 翻转规则 |
| Three.js 示例图片缺少独立资产来源声明 | 中 | 固定 r184、记录仓库 MIT 许可证和 SHA-256；严格商业发布前替换为自有/CC0 资源或补齐独立授权 |
| 参数面板修改触发 shader 重编译 | 中 | 所有运行时参数使用共享 uniform，避免 define 和材质重建 |
| 3D Tiles 原几何并非真实水平面 | 中 | 接受第一阶段能力边界；真正轮廓和水位留给独立水面 Mesh |
| 默认参数只适合当前镜头 | 中 | 同时验证默认、中距、近距；以米制尺度表达参数并保留有限调节范围 |

## 性能预算

第一阶段的目标成本边界：

- 0 个新增 Worker。
- 0 个新增 render pass / RenderTarget。
- 0 个新增 draw call。
- 2 个 512 × 512 JPEG 法线纹理资源，合计约 824 KiB raw；由 Vite 作为按需案例资源输出。
- 每个水域片元增加两次 normal texture sample、少量向量运算和距离衰减。
- 不增加主线程每帧材质遍历。
- 同场景 P95 帧时间相对静态 Water Area 基线增幅不超过 10%。

若无法满足预算，应优先降低远景高频采样或在远距离只保留一个 normal sample，不应直接放宽预算。

## 后续阶段接口预留

本阶段只预留领域边界，不实现能力：

```text
WaterAreaAppearance（本阶段）
├── color / roughness / IOR
├── normal waves
└── distance filtering

ShoreAppearance（后续）
├── shore distance / SDF
├── foam / wet edge
└── flow direction

WaterSurface（后续独立系统）
├── water level / mesh LOD
├── Gerstner / FFT / GPUOcean
├── reflection / refraction
└── underwater / interaction
```

`WaterAreaAppearance` 不应依赖未来的 `WaterSurface`，两者最终可以由更高层 controller 组合，但不能互相拥有资源生命周期。

## 参考方案

- [CesiumJS Terrain Water Effects](https://cesium.com/learn/cesiumjs-learn/cesiumjs-terrain/)
- [ArcGIS Realistic Water Visualization](https://developers.arcgis.com/javascript/latest/sample-code/visualization-realistic-water/)
- [Three.js WebGPU WaterMesh](https://threejs.org/docs/pages/WaterMesh.html)
- [Unity HDRP Water System](https://unity.com/blog/engine-platform/new-hdrp-water-system-in-2022-lts-and-2023-1)
- [Unreal Single Layer Water](https://dev.epicgames.com/documentation/unreal-engine/single-layer-water-shading-model-in-unreal-engine)
- [The Technical Art of Sea of Thieves](https://history.siggraph.org/wp-content/uploads/2022/09/2018-Talks-Ang_The-Technical-Art-of-Sea-of-Thieves.pdf)
