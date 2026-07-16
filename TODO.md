# Tellux 待办事项

## 实体贴地（Ground Clamp）

完整设计见 [docs/design/ground-clamp.md](./docs/design/ground-clamp.md)。

- 背景：当前实体位置是绝对椭球高，无任何地形跟随；点 / 线 / 面需要真·贴地。
- 方案：GPU 阴影体 + 深度纹理逐片元分类（对标 Cesium `GroundPrimitive` / `GroundPolylinePrimitive`），**否决** CPU 采样重建的妥协路线。
- 渲染器：WebGL 优先全量实现；WebGPU 暂不处理（`onBeforeCompile` 在 WebGPU 失效，后续单独立项）。

- [X] P0 深度分类管线 + 贴地线

  - 新增 `GroundClampPass`（effects pass，同 `EntityRenderManager` 形态），复用 `readBuffer.depthTexture` 作地表深度源。
  - port Cesium `createGroundPolylineGeometry`：沿椭球细分 + 墙体积几何（8 顶点 / 36 索引）。
  - port `PolylineShadowVolumeFS/VS`：片元读深度还原地表点 → 右 / 起 / 终平面 + 半宽判定。
  - 落实工程细节 1：`EncodedCartesian3` 高 / 低双精度拆分（抗地球尺度抖动）。
  - 落实工程细节 2：法向 `±EPSILON5` 微偏移治 z-fighting（不抬高度）。
  - API：`PolylineOptions.heightReference: 'CLAMP_TO_GROUND'`。
- [X] P1 贴地面

  - `GroundPolygonGraphic` 阴影体几何（port `PolygonGeometry` + `createShadowVolume`）。
  - 模板两遍材质（stencil-depth + color，port `ShadowVolumeAppearanceFS`）。
  - `PolygonOptions.heightReference: 'CLAMP_TO_GROUND'`。
- [ ] P2 点 heightReference

  - 接入 `HeightSampler`：add 即摆椭球高，`sampleHeightMostDetailed` resolve 后 snap。
  - LOD 变化去抖重采样（点仅 1 顶点）。
  - `PointOptions.heightReference: 'CLAMP_TO_GROUND'`。
- [ ] P3 terrain / 3D Tiles 深度分离

  - 主渲染插入 terrain-only 深度快照 → `CLAMP_TO_TERRAIN` / `CLAMP_TO_TILESET`。
- [ ] P4 RELATIVE_TO_GROUND + 打磨

  - `RELATIVE_TO_GROUND`（地表高 + height 偏移）；性能（scissor / 包络）、与 OIT 交互、拾取语义厘清。

## Symbol 实体（Icon + 文字标签）

完整设计见 [docs/design/symbol-entity.md](./docs/design/symbol-entity.md)。

- 背景：实体目前无图标 / 文字标注；点图形用 `THREE.Points` 圆形纹理，无法承载任意图片或文字。
- 方案：对标 Mapbox `symbol` layer——一个 symbol = icon + text 共享同一锚点 / 排布 / 着色器，内部共用屏幕空间四边形原语 `AnchorQuadGraphic`。文字 v1 用 canvas 覆盖纹理 + shader tint（WYSIWYG，走 `resolveColor`）；SDF / instanced collection 为量级驱动的后续升级，接口预留。
- 不做（非目标）：沿线标签、地图级碰撞检测（地球引擎少量标注用不上）。

- [ ] S0 AnchorQuadGraphic 原语

  - 自写 ShaderMaterial：camera-facing、像素 / 世界大小、anchor、pixelOffset、rotation、tint、opacity；FS main 末尾显式 `gl_FragColor` 以命中 [EntityRenderManager](./src/entities/EntityRenderManager.ts) OIT 注入 fallback 分支。
  - 验证：单 quad 贴图渲染 + 缩放 / 旋转 / 偏移 / tint 正确；半透明经 OIT 无黑边。
- [ ] S1 SymbolGraphic + Icon

  - `IconOptions`、image 异步加载 + 共享缓存 + dispose、`SymbolGraphics` / `IconGraphics` 句柄、Entity 集成（position / show / dispose / `get symbol`）。
  - 验证：icon 跟随 position，raycast 命中（零拾取改动，Mesh 走现有 raycast 路径），颜色 WYSIWYG。
- [ ] S2 Text（canvas 纹理）

  - `TextOptions`、canvas coverage 构建（白色字形 / 描边，色作 uniform）、fill / outline / bg 经 `resolveColor`、布局（textRelative / anchor / spacing）、`TextGraphics` 句柄。
  - 验证：文字锐利、halo 正确、改色不重建 canvas、改文字重建、icon+text 组合排布正确。
- [ ] S3 打磨 + 案例

  - 多行 / maxWidth 换行、行高、背景框、与 point 共存、sandcastle 案例（[examples/entities.ts](./examples/entities.ts) 模式）。
- [ ] S4 贴地 clamp（单点 HeightSampler 采样，同点语义）
- [ ] S5 距离衰减（scaleByDistance / translucencyByDistance / disableDepthTestDistance）

## 实例化渲染（对标 UE5 HISM）

目标：实现引擎级通用高性能实例化渲染系统，以 UE5 的 **HISM（Hierarchical Instanced Static Mesh）** 为标杆——层级空间结构驱动的逐实例视锥剔除 + 逐实例 LOD 选择 + 按 LOD 分桶的实例化批次。vegetation 是第一个客户，后续覆盖草地、岩石、建筑、鸟群、车流等。

完整架构与依赖策略见 [docs/design/engine-ownership-and-dependency-strategy.md](./docs/design/engine-ownership-and-dependency-strategy.md)（§1 PositionPipeline、§2 通用实例化系统、C1-C7 交付路线）。

- 背景：现状实例化只有 vegetation 内的 [src/rendering/applyRTCInstancing.ts](./src/rendering/applyRTCInstancing.ts)（RTC 高/低精度平移 + 手工包围盒），无 shader 组合层、无剔除、无 LOD、无拾取，且 shader 注入是 ez-tree 风摆与 RTC 两方字符串 patch 的脆弱状态（见 [notes/坑点记录/ez-tree风摆与RTC争抢project_vertex坑点.md](./notes/坑点记录/ez-tree风摆与RTC争抢project_vertex坑点.md)）。
- 对标范围：HISM 的「层级剔除 + 逐实例 LOD」是核心目标；**明确不做** HZB 遮挡剔除（WebGL2 下 ROI 低）与 UE5 Nanite 级 GPU-driven meshlet（需 WebGPU + compute，另立项）。
- 前置约束：必须先建 PositionPipeline 再迁 ez-tree，不得先 vendor ez-tree（会用 vendor 替代架构思考）。每个 chunk 必须可独立验证（画面等价或可量化指标），避免大爆炸式集成。
- 验证 demo：[examples/vegetation.ts](./examples/vegetation.ts)（第一个客户，C1-C6 的画面等价基准）。

- [ ] C1 PositionPipeline 协议 + 单元测试

  - 建 position 管线组合协议：所有位置贡献者（RTC / 风摆 / 剔除 / LOD）通过 stage 注册，引擎独占 `<project_vertex>` 最终输出，单一 `onBeforeCompile` 按 order 拼接。
  - 协议字段按 TSL PositionNode 形态设计（预留未来 A→B 迁移）；拍板是否预留 `vertexPosition`(pre-project) / `clipPosition`(post-project) 钩子（决定能否做 GPU 实例剔除）。
  - 验证：给 fake stage 组合后 GLSL 正确（单元测试 + 输出快照 hash），不接业务。
- [ ] C2 RTC 注入迁到 PositionPipeline

  - 把 `applyRTCInstancing.ts` 的高/低精度 RTE 数学重写为 PositionPipeline stage，消除对 `#include <project_vertex>` 的正则 patch。
  - 验证：vegetation 视觉等价。
- [ ] C3 ez-tree 风摆迁到 PositionPipeline stage

  - 按「提取重写」策略：保留 ez-tree geometry 生成，丢弃其 `createLeavesGeometry` 里的 `MeshPhongMaterial + onBeforeCompile`，风摆改为 Tellux 自有 stage。
  - 验证：风摆视觉等价；ez-tree 与 RTC 不再争抢 `<project_vertex>`。
- [ ] C4 InstancedSceneObject 通用类 + 簇划分 + 逐实例视锥剔除（HISM 核心）

  - 通用实例化容器类，实例变换建层级空间结构（BVH / 网格簇，集成 [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)），对标 HISM 的 cluster tree。
  - 逐簇 + 逐实例视锥剔除，动态回填可见实例到 `instanceMatrix`（含 positionHigh/Low 通道）。
  - 验证：draw call / 提交实例数随视锥下降，画面等价。
- [ ] C5 LOD bucketing + 简化几何管线（HISM 核心）

  - 距离驱动逐实例 LOD 选择，按 LOD 层级分桶为独立实例化批次；含 LOD 切换去抖 / 过渡。
  - 验证：远距离帧率提升，近距离画面等价。
- [ ] C6 拾取（集成 three-mesh-bvh）

  - 实例化射线拾取，复用 C4 的空间结构。
  - 验证：鼠标点树 / 实例能正确选中。
- [ ] C7 第二个客户接入验证 API 通用性

  - 用非 vegetation 场景（如岩石 / 建筑）接入，验证系统不是 vegetation-specific。
  - 验证：新客户 < 200 行接入。

## WebGPU 渲染模式

- [ ] 实现 WebGPU 渲染模式下的瓦片 LOD fade 过渡效果

  - 背景：WebGPU 模式下地球瓦片层级切换时直接 pop，没有 WebGL 版的丝滑淡入淡出。
  - 根因：`TilesFadePlugin` 依赖 Three.js `onBeforeCompile` GLSL 注入，WebGPURenderer 不支持该机制。
  - 详细分析与完善方向见 [notes/坑点记录/WebGPU下onBeforeCompile着色器机制失效坑点.md](./notes/坑点记录/WebGPU下onBeforeCompile着色器机制失效坑点.md)。

## 场景裁剪（Clipping）

设计文档待建（`docs/design/clipping.md`）。

- 背景：当前无法对地形 / 3D Tiles / 模型 / 实体做剖切或区域裁剪；地下漫游、基坑开挖、建筑剖面等场景需要对标 Cesium `ClippingPlaneCollection` / `ClippingPolygon` 的裁剪能力。
- 方案方向：引擎级裁剪集合（平面 / 多边形），统一作用于 tileset、地形 mesh、模型图层与实体 pass；裁剪面由世界坐标定义，支持 union / intersection 模式与运行时增删改。
- 渲染器：WebGL 优先（shader discard / clip distance）；WebGPU 单独立项（TSL clip node 或 stencil 路径）。

- [ ] CL0 裁剪 API 与领域边界

  - 公开 `viewer.clipping`（或等价分组对象）：`addPlane` / `addPolygon` / `remove` / `clear` / `enabled` / `unionClippingRegions`。
  - 裁剪目标选择：`terrain` / `tilesets` / `models` / `entities` / `all`。
  - 验证：API 形状与初始化 / 运行时控制同构（对齐 `scene.clouds.quality` 模式）。
- [ ] CL1 平面裁剪（单面剖切）

  - 世界空间平面方程 → 各受控渲染 pass 的 fragment discard 或 `clipDistance`。
  - 接入 3D Tiles tileset 与 glTF 模型图层（优先用户可见收益最大的两类）。
  - 验证：单平面剖切 tileset / 模型，剖面边缘稳定、无 z-fighting 闪烁。
- [ ] CL2 多边形裁剪（区域开挖）

  - 椭球面 / 局部 ENU 多边形挤出体裁剪（port Cesium `ClippingPolygon` 语义）。
  - 接入地形 mesh（Quantized Mesh / heightmap 路径）。
  - 验证：矩形开挖区内地形与 tileset 被正确裁掉，边界与影像对齐。
- [ ] CL3 实体与后处理交互

  - 实体 OIT pass 与裁剪 pass 合成顺序厘清；被裁实体不参与拾取。
  - 与大气 / 云层 / 后处理链无双重 discard 或深度冲突。
  - 验证：裁掉一半建筑后，剩余部分拾取与半透明合成正确。
- [ ] CL4 案例 + 文档

  - Sandcastle / examples 案例：基坑剖切、隧道纵剖、模型切片浏览。
  - `docs/guide/` 裁剪使用指南。

## 动态特效图元（Effect Primitives）

设计文档待建（`docs/design/effect-primitives.md`）。

- 背景：实体层目前只有静态点 / 线 / 面 / symbol，缺少 GIS 可视化常见的动态 shader 特效（流光、雷达扫描、能量罩、脉冲扩散、光锥等）。
- 方案方向：在 Entity 体系下新增特效图形组件（`FlowLineGraphic`、`RadarGraphic`、`EnergyDomeGraphic`、`PulseCircleGraphic`、`LightConeGraphic`），共享位置 / show / dispose / 拾取语义；材质走自定义 ShaderMaterial + `uTime` 动画，半透明走现有 OIT 路径。
- 非目标（v1）：粒子系统、后处理全屏泛光（依赖单独 bloom pass）、WebGPU 路径。

### 流光线（Flow Line）

- [ ] E1 FlowLineGraphic 原语

  - 沿折线 UV 的流动纹理 / 渐变 shader（`speed`、`color`、`glowPower`、`repeat`）；支持 `width` 与 `clampToGround`。
  - 验证：折线上流光方向正确、线宽像素恒定、缩放相机时动画速率视觉一致。
- [ ] E2 Entity 集成 + API

  - `FlowLineGraphics` 句柄、`FlowLineOptions`、`entity.flowLine`；与 `polyline` 互斥或可共存策略拍板。
  - 验证：add / remove / setPositions / setShow 生命周期正确。

### 扫光雷达（Radar Sweep）

- [ ] E3 RadarGraphic 原语

  - 扇形 / 圆形扫描区域：中心锚点 + `radius` + `startAngle` / `endAngle` + `sweepSpeed`；扫描臂渐变尾迹 + 可选同心波纹。
  - 支持贴地（`clampToGround`）与绝对高（空中雷达）。
  - 验证：扫描臂旋转流畅、扇形边界抗锯齿、贴地时贴地形无穿插。
- [ ] E4 Entity 集成 + API

  - `RadarGraphics` 句柄、`RadarOptions`、`entity.radar`。
  - 验证：多个雷达实例互不干扰，raycast 命中扇形区域。

### 能量罩（Energy Dome）

- [ ] E5 EnergyDomeGraphic 原语

  - 半球 / 椭球罩：菲涅尔边缘发光 + 网格 / 六边形纹理 + 呼吸式透明度脉动（`pulseSpeed`、`baseColor`、`rimColor`）。
  - 验证：内外视角均可见边缘光，相机穿入罩内无闪烁或背面剔除异常。
- [ ] E6 Entity 集成 + API

  - `EnergyDomeGraphics` 句柄、`EnergyDomeOptions`、`entity.energyDome`。
  - 验证：缩放半径 / 修改脉动参数实时生效。

### 脉冲圆（Pulse Circle）

- [ ] E7 PulseCircleGraphic 原语

  - 地面同心扩散环：中心锚点 + `maxRadius` + `ringCount` + `speed` + `color` 衰减；环带宽度与间隔可配。
  - 支持贴地椭圆（ENU 缩放）与正圆两种模式。
  - 验证：多环错峰扩散、环到达 `maxRadius` 后淡出或循环重置可配置。
- [ ] E8 Entity 集成 + API

  - `PulseCircleGraphics` 句柄、`PulseCircleOptions`、`entity.pulseCircle`。
  - 验证：与雷达 / 能量罩同屏多实例性能可接受。

### 光锥特效集成案例

- [ ] E9 LightConeGraphic 原语

  - 锥形光束：顶点锚点 + 方向（heading / pitch 或终点坐标）+ `angle` + `length` + 体积光渐变 / 噪声闪烁。
  - 验证：锥体方向随 ENU 旋转正确，近处亮远端衰减，半透明不与地形深度冲突。
- [ ] E10 Entity 集成 + API

  - `LightConeGraphics` 句柄、`LightConeOptions`、`entity.lightCone`。
  - 验证：动态改长度 / 角度 / 颜色实时更新。
- [ ] E11 综合集成案例

  - 新增 `examples/effect-primitives.ts`（或 Sandcastle 条目）：同屏演示流光线路径 + 扫光雷达 + 能量罩 + 脉冲圆 + 光锥（如「基地警戒」场景）。
  - 注册 vite 入口与 Sandcastle registry；`docs/guide/entities.md` 或独立 `docs/guide/effect-primitives.md` 补充用法。
  - 验证：案例可一键运行，各特效可独立 toggle，destroy 无泄漏。
