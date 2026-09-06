# Tellux 待办事项

## 已完成（近期，归档对照）

以下能力已合入主干，此处仅作进度对照，细节见对应文档。

- [X] 统一高亮 `viewer.highlight` / `scene.highlight`

  - Object3D 后处理描边、3D Tiles feature 叠加几何、HISM 单实例 proxy 描边。
  - 见 [docs/guide/highlight.md](./docs/guide/highlight.md)。
- [X] 统一对象拾取 `viewer.pick` / `viewer.pickAll`

  - 判别联合 `ViewerPickResult`；事件字段 `pick` / `picks`；保留独立的 `pickCartographic`。
  - 默认 layers：`entity` / `hismInstance` / `tilesFeature`；传入 `root` 时默认仅 `object`。
  - 见 [docs/guide/interaction.md](./docs/guide/interaction.md)。
- [X] HISM C1–C6（PositionPipeline、簇剔除、LOD、BVH 拾取）与演示

  - 公开 `viewer.addHismLayer`；演示见 `examples/hism/hism-forest`、`hism-compare`。
  - 见 [docs/guide/hism.md](./docs/guide/hism.md)。
- [X] Symbol 实体 S0–S3（AnchorQuad + Icon/Text SDF、案例）

  - 文字走 per-symbol / GlyphAtlas SDF（非原计划 canvas 覆盖 v1）；案例见 `examples/symbol.ts`。
  - 见 [docs/guide/entities.md](./docs/guide/entities.md)、[docs/design/symbol-entity.md](./docs/design/symbol-entity.md)。
- [X] 折线 / 多边形真·贴地（`clamp: true`，WebGL）

  - API 为统一 `clamp` 字段（非 Cesium 式 `heightReference` 枚举）。
  - 见 [docs/guide/entities.md](./docs/guide/entities.md)、[docs/design/ground-clamp.md](./docs/design/ground-clamp.md)。

## 社区优秀案例展示

目标：在项目主页建设社区优秀案例展示区，集中分享基于 Tellux 构建的数字地球、数字孪生、三维地图及行业应用，促进案例传播与生态共建。案例以「url + 封面图床直链」维护，点击卡片新标签页静态跳转，不做详情页与 iframe 内嵌预览。

- [X] C0 展示区定位与内容规范

  - 入选标准：基于 Tellux 构建、可公开访问的作品。
  - 案例字段：`title` / `description` / `cover` / `url` / `tags` / `author` / `date`。
  - 封面由作者上传自己的图床后填直链；页面按 `date` 降序展示。
- [X] C1 展示区基础

  - 独立 gallery 页 `examples/gallery.html`（复用 portal 壳 + 搜索 + 标签筛选），首页仅保留「最新 3 条 + 查看全部」精选条，空数据时隐藏。
  - 卡片新标签页跳转（`target="_blank"` + `rel="noopener"`）+ 响应式布局 + 封面加载失败兜底（`is-broken` 占位）。
  - 决策背景见 [notes/decisions/0001-community-showcase-gallery-page.md](notes/decisions/0001-community-showcase-gallery-page.md)。
- [X] C2 案例数据与维护流程

  - `examples/showcase-data.ts` 单一数据源（可版本管理）。
  - 提交模板 = GitHub issue / PR；审核、署名、更新与下架由维护者在 PR 中把关。
- [ ] C3 与示例、文档联动

  - 本期只收社区外部案例；后续可评估是否收录官方示例与 Sandcastle 条目（需为本地资源并自配封面）。
- [ ] C4 发布与质量验证

  - `scripts/check-showcase-links.mjs` 链接健康检查（校验 `url` / `cover`）。
  - 移动端体验与页面构建验证；发布首批社区案例。

## 实体贴地（Ground Clamp）

完整设计见 [docs/design/ground-clamp.md](./docs/design/ground-clamp.md)。使用说明见 [docs/guide/entities.md](./docs/guide/entities.md)「贴地」。

- 背景：折线 / 多边形已支持 GPU 真·贴地；点 / Symbol 仍为绝对椭球高。
- 方案：线 / 面用 GPU 阴影体 + 深度纹理逐片元分类（对标 Cesium `GroundPrimitive` / `GroundPolylinePrimitive`）；点 / Symbol 走 CPU `sampleHeightMostDetailed` 采样（Cesium 正解，非妥协）。
- 稳定公开 API：当前仅折线 / 多边形提供 `clamp?: boolean`；深度源、偏移、点 / Symbol 贴地在实现完成前不进入公开类型。
- 渲染器：WebGL 优先；WebGPU 暂不处理（`onBeforeCompile` 失效，后续单独立项）。

- [X] P0 深度分类管线 + 贴地线

  - `GroundClampPass` + `GroundPolylineGraphic`；`EncodedCartesian3`、法向微偏移治 z-fighting。
  - API：`PolylineOptions.clamp`。
- [X] P1 贴地面

  - `GroundPolygonGraphic` 阴影体 + 模板两遍材质。
  - API：`PolygonOptions.clamp`。
- [ ] P2 点 clamp

  - 接入 HeightSampler：add 即摆椭球高，`sampleHeightMostDetailed` resolve 后 snap。
  - LOD 变化去抖重采样（点仅 1 顶点）。
  - 实现、生命周期与降级语义验证完成后再设计公开 API。
- [ ] P3 terrain / 3D Tiles 深度分离（`source`）

  - 主渲染插入 terrain-only / tileset-only 深度快照；公开配置形状待实现阶段评审。
  - 当前贴地深度为地形与 3D Tiles 并集（`source: 'all'`）。
- [ ] P4 `offset > 0`（相对地表抬高）+ 打磨

  - 地表高 + `offset` 米；性能（scissor / 包络）、与 OIT 交互、拾取语义厘清。
  - 未进入公开类型，不提供 warning 降级分支。

## Symbol 实体（Icon + 文字标签）

完整设计见 [docs/design/symbol-entity.md](./docs/design/symbol-entity.md)。

- 背景：点图形无法承载任意图片或文字；已落地 icon + text 共享锚点的 Symbol。
- 实现要点：`AnchorQuadGraphic` + `SymbolGraphic`；文字 / 图标走 SDF（含 GlyphAtlas / TinySDF、可选 MSDF）；锚点遮挡 pass；拾取按 UV 采样 SDF alpha。
- 不做（非目标 v1）：沿线标签、地图级碰撞检测。

- [X] S0 AnchorQuadGraphic 原语
- [X] S1 SymbolGraphic + Icon（含 Entity 集成、拾取）
- [X] S2 Text（per-symbol SDF；原计划 canvas 覆盖已跳过）
- [X] S3 打磨 + 案例（多行 / 背景 / 与 point 共存；`examples/symbol.ts`）
- [ ] S4 贴地 clamp（单点 HeightSampler，同点语义）
- [ ] S5 距离衰减（`scaleByDistance` / `translucencyByDistance` / `disableDepthTestDistance`）与 `sizeInMeters`
- [ ] S6 量级升级（可选）：完整字形图集 / instanced collection（接口不暴露纹理来源，便于整体替换）

## 实例化渲染（HISM）

目标：引擎级通用高性能实例化——层级空间结构驱动的逐实例视锥剔除 + 逐实例 LOD + 按 LOD 分桶的实例化批次。vegetation / 森林是第一个客户，后续覆盖草地、岩石、建筑等。

架构见 [docs/design/engine-ownership-and-dependency-strategy.md](./notes/archive/engine-ownership-and-dependency-strategy.md)；使用见 [docs/guide/hism.md](./docs/guide/hism.md)。

- 现状：`src/hism/` 已落地 PositionPipeline、RTC stage、风摆 stage、簇网格、视锥剔除、LOD bucketing、BVH 拾取、`viewer.addHismLayer` / `viewer.pick(..., { layers: ['hismInstance'] })` / `viewer.highlight.set(hismPick)`。
- 演示：`examples/hism/hism-forest`（功能 + 描边高亮）、`examples/hism/hism-compare`（legacy InstancedMesh vs HISM 性能对照）；旧 `examples/vegetation.ts` 仍可作对照基线。
- **明确不做**：HZB 遮挡剔除；Nanite 级 GPU-driven meshlet（另立项）。

- [X] C1 PositionPipeline 协议 + 单元测试
- [X] C2 RTC 注入迁到 PositionPipeline
- [X] C3 ez-tree 风摆迁到 PositionPipeline stage
- [X] C4 HismLayer / 簇划分 + 逐实例视锥剔除
- [X] C5 LOD bucketing
- [X] C6 BVH 拾取 + 统一 `pick` / 高亮解包
- [ ] C7 第二个客户接入验证 API 通用性

  - 用非 vegetation 场景（岩石 / 建筑等）接入，确认不是 vegetation-specific。
  - 验证：新客户 < 200 行接入。
- [ ] C8 可选后续

  - 跨 Picker 共享 Raycaster / `ray.far` 递进裁剪（拾取性能）。
  - HISM 描边跟随 PositionPipeline 风摆顶点（当前描边贴合实例变换，不含顶点形变）。

## WebGPU 渲染模式

- [ ] 实现 WebGPU 渲染模式下的瓦片 LOD fade 过渡效果

  - 背景：WebGPU 模式下地球瓦片层级切换时直接 pop，没有 WebGL 版的丝滑淡入淡出。
  - 根因：`TilesFadePlugin` 依赖 Three.js `onBeforeCompile` GLSL 注入，WebGPURenderer 不支持该机制。
  - 详细分析与完善方向见 [notes/engineering/WebGPU下onBeforeCompile着色器机制失效坑点.md](notes/engineering/WebGPU下onBeforeCompile着色器机制失效坑点.md)。

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
