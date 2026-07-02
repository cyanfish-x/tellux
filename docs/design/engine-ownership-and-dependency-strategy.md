# 引擎能力边界与依赖管理策略

> 状态：**架构思考，方向已定，具体实现待启动**（2026-07-02）
> 范围：明确 Tellux 应当自主掌握（own）的层级、可继续依赖外部开源库的层级，以及对应的依赖管理策略。
> 触发场景：vegetation 案例的实例化森林暴露出 shader 注入冲突与 LOD/culling 缺失；项目演进到"vegetation 只是第一个客户"的通用引擎能力需求；第三方库（3d-tiles-renderer / ez-tree / takram）的定制化深度持续增加。

---

## 0. 背景

### 0.1 三个相互关联的问题

随着 Tellux 功能迭代，以下三个问题同时浮现，且同源：

1. **Shader 注入冲突**：vegetation 案例中 ez-tree 的风摆 shader 与 Tellux 自研 RTC（globe-scale 相对相机坐标）注入逻辑同时改写 Three.js `<project_vertex>` chunk，已存在两方字符串 patch 字符串的脆弱状态。任何第三层位置管线贡献者（GPU 实例剔除、impostor billboard、LOD 等）的加入都会使脆弱度成倍上升。详见 [ez-tree风摆与RTC争抢project_vertex坑点](../../notes/坑点记录/ez-tree风摆与RTC争抢project_vertex坑点.md)。

2. **通用实例化系统需求**：vegetation 案例最初按窄类设计，但实际需求是"通用高性能实例化系统给整个引擎用，vegetation 只是第一个客户"。这意味着 culling / LOD / 排序 / 拾取 / shader 组合必须做成引擎级能力，不能在 vegetation 内部硬编码。

3. **依赖管理策略缺失**：第三方库（3d-tiles-renderer / ez-tree / takram 等）的定制深度增加，团队面临"是否 vendor 源码"的决策，但缺少统一判断标准。

三者同源：**Tellux 没有清晰定义自己应当 own 哪些层**。本文给出这个定义。

### 0.2 核心原则

> 引擎应当 own 那些**多个客户都需要、且各客户需求会相互冲突**的层。只被特定场景使用、或与外部生态强绑定的层，继续靠依赖。

按此原则划分：

| Own 的层 | 理由 |
|---|---|
| **Shader 组合协议** | 多个材质贡献者（RTC / 风 / 剔除 / billboard / 客户自定义）都要改 position 管线，没有组合层就只能字符串 patch 字符串 |
| **空间索引与实例化调度** | culling / LOD / 排序 / 拾取在 vegetation / 草地 / 建筑 / 鸟群 / 车流等场景通用 |
| **Globe-scale 坐标变换** | RTC 是 Tellux 区别于通用 Three.js 项目的基础能力，不能外包 |

| 依赖的层 | 库 |
|---|---|
| 3D Tiles 规范解析与调度 | 3d-tiles-renderer |
| 地形瓦片加载 | 3d-tiles-renderer + Ion/Cesium 协议 |
| Procedural 几何生成 | ez-tree（仅 geometry 生成部分） |
| Three.js 渲染原语 | three |
| BVH / 空间查询原语 | three-mesh-bvh |

### 0.3 边界例外：ez-tree

ez-tree 本身属于"几何生成"，但它的实现跨进了"shader"层（在 `createLeavesGeometry` 里直接 `new MeshPhongMaterial + onBeforeCompile` 注入风摆）。这部分需要 Tellux 接管，详见 §3.3。

---

## 1. Shader 组合层（PositionPipeline）

### 1.1 现状

vegetation 案例中 vertex shader 的 `<project_vertex>` chunk 被两方先后 patch：

- **ez-tree**：在 `onBeforeCompile` 整段替换 include，注入 view 空间风摆位移，并顺手删除 `instanceMatrix * mvPosition` 块（其设计假设是非实例化 mesh）。
- **Tellux RTC**：跳过 `modelViewMatrix`，改用 `positionHigh/Low - cameraHigh/Low + viewMatrixRTE` 把绝对 ECEF 平移从 instanceMatrix 转移到高/低解码通道。

Tellux RTC 对 ez-tree 叶子材质只能走 [src/rendering/applyRTCInstancing.ts:96-111](../../src/rendering/applyRTCInstancing.ts) 的 else 分支：用正则匹配 ez-tree 字面输出做二次 patch + 手动补回 instancing 块。

### 1.2 问题

字符串级 patch 链：

- 依赖 ez-tree 输出格式不变，库升级会**静默失效**（不报错，shader 退化）
- 加入第三、第四方贡献者（GPU 剔除 / impostor / LOD / 未来客户）会越套越脆
- 调试极困难：最终 GLSL 看不出哪段来自谁
- 在 WebGPU 渲染模式下整个 `onBeforeCompile` 机制失效（见 [WebGPU下onBeforeCompile着色器机制失效坑点](../../notes/坑点记录/WebGPU下onBeforeCompile着色器机制失效坑点.md)）

### 1.3 设计：PositionPipeline 协议

引擎层建一个 position 管线协议，**所有位置贡献者通过 stage 注册**，引擎拥有 `<project_vertex>` 的最终输出，单一 `onBeforeCompile` 按 order 拼接：

```ts
interface PositionPipelineStage {
  name: string
  // 在 view 空间对 mvPosition 做变换的 GLSL 片段
  transform: (mvPosition: string, ctx: StageContext) => string
  // 优先级，决定 stage 之间的执行顺序
  order: number
  // 需要的 GLSL define
  requiredDefines?: string[]
  // 需要注入的 uniform / attribute 声明
  declarations?: string
}
```

### 1.4 路径选择

| 路径 | 描述 | 工作量 | 评估 |
|---|---|---|---|
| **A** | 自建 GLSL 组合层（PositionPipeline 协议） | 5-6 周 | **推荐**：兼容现状，渐进迁移 |
| **B** | 迁 TSL / NodeMaterial，在其上建 culling | 3-4 个月 | 长期正确，但工作量极大，ez-tree 需 fork |
| **C** | 集成 InstancedMesh2 当地基 | 4-6 周 | 不推荐：把组合层控制点让给第三方 |

**采用 A → B 渐进**：先做 A 拿到能服务多客户的 v1，协议字段设计成能 1:1 映射到 TSL PositionNode，未来切 B 时只换 stage 实现不换协议。

### 1.5 待确认事项

C1 启动前需拍板：

1. 协议除了 `transform(mvPosition)`，是否预留 `vertexPosition`（pre-project）/ `clipPosition`（post-project）两个钩子？这决定未来能不能做 GPU 实例剔除（需要 pre-project 钩子）。
2. WebGPU 兼容性：协议字段必须按 TSL PositionNode 的形态设计，方便未来 B 路径迁移。
3. ez-tree 风摆迁移策略：是 fork ez-tree 改 stage，还是完全提取重写（见 §3.3）。

---

## 2. 通用实例化系统

### 2.1 范围

不是 vegetation-specific，是引擎级能力。第一个客户是植被，后续客户预计包括草地、岩石、建筑、鸟群、车流等。

### 2.2 子问题分解

| 子问题 | 难度 | 现成方案 |
|---|---|---|
| 空间加速（BVH / 网格） | 简单 | [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) |
| Per-instance frustum culling | 简单 | 标准算法 |
| LOD bucketing | 简单 | 距离驱动重分桶 |
| 排序 / 拾取 / 蒙皮 | 中等 | InstancedMesh2 已踩平坑，可参考源码 |
| **Shader 组合** | **硬** | **本文 §1** |

culling / LOD / 排序是已知问题，算法教科书都有。**真正难的是 shader 组合**——这是本文 §1 单独成章的原因，也是为什么"集成 InstancedMesh2"路径不推荐（它把组合层控制点让给第三方）。

### 2.3 明确砍掉的功能

- **HZB 遮挡剔除**：在 WebGL2 下需 `gl.readPixels` 拉 depth buffer（卡 GPU pipeline 30-100ms），或用 transform feedback 多 pass 模拟。当前场景规模（植被 + 地形）下 ROI 极低，砍掉。植被是相对稀疏的几何，不是高遮挡城市/室内。
- **UE5 Nanite 级 GPU-driven meshlet 渲染**：需 WebGPU + compute shader + indirect draw，工作量极大（3-4 个月），当前不立项。

### 2.4 实现路线（chunk 化交付）

| Chunk | 范围 | 验证标准 | 周期 |
|---|---|---|---|
| **C1** | PositionPipeline 协议 + 单元测试（不接业务） | 给 fake stage 组合后 GLSL 正确 | 1 周 |
| **C2** | RTC 注入迁到 PositionPipeline | vegetation 视觉等价 | 1 周 |
| **C3** | ez-tree 风摆迁到 PositionPipeline stage | 风摆视觉等价 | 1.5 周 |
| **C4** | `InstancedSceneObject` 通用类 + 簇划分 + frustum culling | draw call 数下降，画面等价 | 2 周 |
| **C5** | LOD bucketing + 简化几何管线 | 远距离帧率提升 | 1.5 周 |
| **C6** | 拾取（集成 three-mesh-bvh） | 鼠标点树能选中 | 1 周 |
| **C7** | 第二个客户接入验证 API 通用性 | 新客户 < 200 行接入 | 1 周 |

**总计 9-10 周（全职折算）**，实际执行可能 3-4 个月。

每个 chunk 都有"画面等价"或"可测量指标"的验证标准，可独立 merge、独立回滚。这对 AI agent 执行尤其重要：每个 chunk 能自验、能局部化失败、不会陷在"shader 看起来对但画面错"的泥潭。

---

## 3. 依赖管理策略

### 3.1 Vendor 是光谱，不是二元选择

```
1. 硬依赖       npm i X                    ← 默认，跟着上游跑
2. 局部补丁     patch-package               ← 改一两个文件，仍跟上游
3. Fork         git submodule / 私有 fork    ← 已经分叉，定期 rebase
4. 整库 vendor  拷源码进 repo               ← 完全自己掌控，自己维护
5. 提取重写     学算法、丢代码               ← 真正吸收成自己的
```

每升一级，灵活性 ↑，维护成本也 ↑。决策按"我到底要改多少 + 上游多活跃 + 库多大"来定，**不是一刀切**。

### 3.2 决策矩阵

| 库 | 规模 | 上游活跃度 | 定制深度 | 推荐 |
|---|---|---|---|---|
| **3d-tiles-renderer** | 大（几万行） | 活跃（gkjohnson） | 插件级（已能扩展） | 保持依赖，必要时 vendor 单个 plugin 文件 |
| **ez-tree** | 小（~2300 行 minified） | 稳定（算法库） | shader 级深度改造 | **提取重写**（不整库 vendor） |
| **three-mesh-bvh** | 中 | 活跃 | 工具级（不注入 shader） | 保持依赖 |
| **three** | 大 | 极活跃 | 不定制 | 保持依赖 |
| **takram** | 待确认 | 待确认 | 待确认 | 待评估（见 §3.5） |

### 3.3 各库具体决策

#### 3d-tiles-renderer：保持依赖

太大、太活跃、太核心。Vendor 等于自找维护负担——每个 3D Tiles spec 更新、性能优化、bug fix 都得跟。

已验证插件扩展够用：[WebGPUTerrainOverlayPlugin](../../src/tiles/WebGPUTerrainOverlayPlugin.ts) 空覆盖父类的 `_wrapMaterials` 然后自己实现贴图逻辑，未动上游代码。这套思路对其他插件（fade、terrain 等）同样适用。

**例外**：某个 plugin 已被全改时，可把该文件拷进 repo（如 `src/tiles/vendored/FadePlugin.ts`），主库仍是依赖。

#### ez-tree：提取重写（不是整库 vendor）

做更激进的提取重写：

- **保留依赖**：`Tree` 类的几何生成（L-system、参数、`generate()` 输出 `branchesMesh.geometry` / `leavesMesh.geometry`）——这部分不需要改。
- **丢弃路径**：它的材质构建（`createLeavesGeometry` 里直接 `new MeshPhongMaterial + onBeforeCompile`）。
- **自己实现**：风摆 shader、叶子材质，作为 PositionPipeline 的 stage。

这样不是"维护一个 ez-tree fork"，而是"用 ez-tree 的算法出几何，材质体系归 Tellux"。与 §1 的 PositionPipeline 设计天然契合。

#### three-mesh-bvh：保持依赖

它是工具库（射线 / 包围查询），**不做 shader 注入**，零冲突风险。可放心作为引擎 spatial 层的基础。

### 3.4 陷阱与缓解

#### 陷阱 1：vendor 后忘记上游

Vendor 一旦做，主动跟上游的责任到了 Tellux 这边。AI agent 不会自动提醒 ez-tree 出了新版本。建议每个 vendored 库建 `VENDORED.md`：

```
来源: https://github.com/dgreenheck/ez-tree @ v0.x.x
提取日期: 2026-07-02
本地修改:
  - 移除 createLeavesGeometry 中的材质 onBeforeCompile
  - 暴露 geometry 生成 API 给 PositionPipeline
定期检查上游: 每季度一次
```

#### 陷阱 2：vendor 让 AI agent 失去边界感

`node_modules` 是天然的"别动这里"屏障。源码进了 `src/` 后 AI agent 改业务代码时会顺手"优化"vendor 进来的库，污染责任边界。

缓解：

- 放专门目录：`src/vendored/<lib>/`
- 目录加 `README.md` 标明"外部源码，不要随意重构，本地修改列在 VENDORED.md"
- eslint 配 ignore 或加注释 `// @vendored — do not refactor`

#### 陷阱 3：vendor 替代架构思考

"我改不动这个库的 shader → 我 vendor 它"是症状，不是病因。病因是引擎缺一层 shader 组合协议。Vendor 让你绕过问题，但下次再加新库、新客户、新效果，同样问题还会冒出来。

正确顺序：**先做 §1 的 PositionPipeline，再看 ez-tree 在新框架下还缺什么**。缺失部分用 vendor 或提取重写补上。反过来"先 vendor 了再想办法"会让 vendor 的代码反噬架构。

### 3.5 takram 待评估

takram 出过多个开源库（如 `@takram/planetary-engine` 等地球引擎类），规模差异巨大。待用户确认具体依赖的子包后单独评估：

- 若是大库且与 Tellux 高度重合 → 不建议 vendor
- 若是某个小工具库 → 按 ez-tree 的逻辑判断

---

## 4. AI agent 执行策略

本架构的实现预计高度依赖 AI agent 协作。针对 AI agent 的失败模式，约定如下：

### 4.1 优势场景（多用 agent）

- 写自我包含、范围明确的 chunk（C1-C7 拆分即为此设计）
- 吸收第三方库源码后重新实现（提取重写）
- 单元测试与可量化验证（draw call 数、画面等价性）

### 4.2 劣势场景（少用或人工介入）

- 调试 shader 注入冲突：GPU 报错信息稀缺且不指向责任库，agent 倾向加 workaround 而非重构。**这正是 PositionPipeline 要解决的问题**——把 N 方博弈降为一方编排。
- 第三方库版本/API 漂移检测：agent 不会主动感知，需要 CI 校验
- shader 输出快照比对：建议加 hash 校验

### 4.3 chunk 化原则

每个 chunk 必须：

1. 有"画面等价"或"可测量指标"的验证标准（agent 能自验）
2. 可独立 merge、独立回滚
3. 不依赖未来 chunk 才能验证（避免大爆炸式集成）

---

## 5. 关联文档

- 坑点：[ez-tree风摆与RTC争抢project_vertex坑点](../../notes/坑点记录/ez-tree风摆与RTC争抢project_vertex坑点.md)
- 坑点：[WebGPU下onBeforeCompile着色器机制失效坑点](../../notes/坑点记录/WebGPU下onBeforeCompile着色器机制失效坑点.md)
- 案例：[vegetation.ts](../../examples/vegetation.ts)（第一个客户）
- 现有 RTC 实现：[src/rendering/applyRTCInstancing.ts](../../src/rendering/applyRTCInstancing.ts)、[src/rendering/RTCAutoUniforms.ts](../../src/rendering/RTCAutoUniforms.ts)
- 同目录设计文档：[ground-clamp.md](./ground-clamp.md)
