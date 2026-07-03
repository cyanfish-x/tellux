# Tellux 待办事项

## 实体贴地（Ground Clamp）

完整设计见 [docs/design/ground-clamp.md](./docs/design/ground-clamp.md)。

- 背景：当前实体位置是绝对椭球高，无任何地形跟随；点 / 线 / 面需要真·贴地。
- 方案：GPU 阴影体 + 深度纹理逐片元分类（对标 Cesium `GroundPrimitive` / `GroundPolylinePrimitive`），**否决** CPU 采样重建的妥协路线。
- 渲染器：WebGL 优先全量实现；WebGPU 暂不处理（`onBeforeCompile` 在 WebGPU 失效，后续单独立项）。

- [ ] P0 深度分类管线 + 贴地线

  - 新增 `GroundClampPass`（effects pass，同 `EntityRenderManager` 形态），复用 `readBuffer.depthTexture` 作地表深度源。
  - port Cesium `createGroundPolylineGeometry`：沿椭球细分 + 墙体积几何（8 顶点 / 36 索引）。
  - port `PolylineShadowVolumeFS/VS`：片元读深度还原地表点 → 右 / 起 / 终平面 + 半宽判定。
  - 落实工程细节 1：`EncodedCartesian3` 高 / 低双精度拆分（抗地球尺度抖动）。
  - 落实工程细节 2：法向 `±EPSILON5` 微偏移治 z-fighting（不抬高度）。
  - API：`PolylineOptions.heightReference: 'CLAMP_TO_GROUND'`。

- [ ] P1 贴地面

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
