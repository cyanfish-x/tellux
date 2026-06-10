# AGENTS.md

## 项目概览

Tellux 是一个 ESM TypeScript 库，基于 Three.js 提供 GIS viewer，用于加载 Cesium Ion 3D Tiles，并包含地球控制器、大气、体积云和后处理效果。

公开包名是 `tellux`。发布内容来自 `dist`，包入口是 `dist/index.js`，类型入口是 `dist/index.d.ts`。

## 源码结构

- `src/index.ts`：公开 barrel export。
- `src/Viewer.ts`：Viewer 公开 API 门面和组合根，负责装配场景、相机、渲染器、tileset、图层、采样、模型等模块。
- `src/controls/`：控制器适配和交互控制相关内部模块。
- `src/models/`：模型图层、模型资源生命周期和模型加载相关内部模块。
- `src/sampling/`：高度采样、拾取采样、离屏采样等空间查询相关内部模块。
- `src/rendering/`：大气、后处理和渲染效果管理模块。
- `src/tiles/`：3D Tiles、地形、影像 overlay 和 tileset 生命周期管理模块。
- `dist/`：生成的构建产物。只有需要刷新构建输出时才更新。
- `README.md`：面向用户的使用文档。

## examples / docs / Sandcastle 架构入口

涉及项目主页、文档站点、示例站点或 Sandcastle 的改动前，优先阅读：

- `notes/examples-architecture.md`

该文档是维护者架构说明，用于快速理解：

- 项目主页：`examples/index.html`、`examples/index.ts`
- 项目文档页：`docs/`、`docs/.vitepress/config.ts`、`examples/public/docs/`
- 项目 Sandcastle：`examples/sandcastle.html`、`examples/sandcastle/app.ts`、`examples/sandcastle/registry.ts`、`examples/sandcastle/runner.ts`

判断规则：

- 面向用户的教程、API、能力说明放在 `docs/`。
- 项目级备忘、调研记录、架构草稿和维护说明放在 `notes/`。
- `examples/public/docs/` 是 VitePress 构建产物，不要手动编辑。
- 新增普通示例时，通常需要同时关注示例 HTML/TS、`examples/vite.config.ts` 的入口注册，以及 Sandcastle registry 的分类/标题/描述规则。
- 修改 Sandcastle 时先区分主应用和 runner：`app.ts` 负责编辑器、示例列表、运行控制和日志；`runner.ts` 负责 iframe 内执行当前 payload。

## notes 快速索引

`notes/` 存放项目级备忘、架构说明、能力调研和实现链路。遇到对应主题时，先读相关 notes，再进入源码细节。

- 涉及 Viewer 创建流程、每帧渲染流程、TilesetManager、地形 / 影像 / surface tileset 生命周期时，先读 `notes/project-architecture.md`。
- 涉及历史 bug、容易误判的实现方向、渲染循环抢占和高度采样副作用时，先读 `notes/project-pitfalls.md`。
- 涉及 `sampleHeightMostDetailed`、地形高度采样、离屏采样、采样专用 tileset、LoadRegionPlugin 或 raycast 高度求交时，先读 `notes/sample-height-most-detailed.md`。
- 涉及 3D Tiles 能力评估、数据格式、LOD、调试、性能、Cesium Ion、地形或影像瓦片能力时，先读 `notes/3d-tiles-renderer-capabilities.md`。
- 涉及 3D Tiles plugin / overlay 取舍、认证插件、GLTFExtensionsPlugin、QuantizedMeshPlugin、ImageOverlayPlugin、TilesFadePlugin、UpdateOnChangePlugin、MVT / GeoJSON overlay 时，先读 `notes/3d-tiles-renderer-plugins-and-overlays.md`。
- 涉及经纬高、椭球、大地坐标、瓦片坐标、STBN / typed array 资源加载或 geospatial shader 工具时，先读 `notes/takram-three-geospatial-capabilities.md`。
- 涉及天空大气、空气透视、太阳 / 月亮方向、光源式光照、星空材质或与云层合成时，先读 `notes/takram-three-atmosphere-capabilities.md`。
- 涉及体积云、云层建模、天气贴图、噪声纹理、程序化纹理、云影或云渲染性能时，先读 `notes/takram-three-clouds-capabilities.md`。
- 涉及镜头光晕、抖动、深度 / 法线效果、几何 pass、Hald LUT 或后处理管线集成时，先读 `notes/takram-three-geospatial-effects-capabilities.md`。
- 涉及项目主页、文档站点、示例站点或 Sandcastle 时，先读 `notes/examples-architecture.md`。

## 模块化与文件大小

- 避免继续膨胀 `src/Viewer.ts`。新增功能默认先判断是否属于 `controls/`、`models/`、`sampling/`、`rendering/`、`tiles/` 等高内聚模块；`Viewer` 只保留公开 API、生命周期编排和跨模块协调。
- 单文件超过约 800 行时应优先评估拆分；超过约 1000 行时，除非是生成文件或高度集中声明文件，新增逻辑前应先拆分出职责明确的类、函数或子模块。
- 拆分遵循面向对象设计原则和 Clean Code：单一职责、高内聚、低耦合、依赖显式注入、隐藏内部实现细节，避免模块之间互相读取不必要的私有状态。
- 新模块命名应表达领域职责，而不是技术步骤；优先使用 `*Manager`、`*Layer`、`*Sampler`、`*Controls` 等项目已有命名风格。
- 对外 API 的 JSDoc 和类型继续保留在公开入口或导出的类型上；内部模块只导出必要类型和类，避免把实现细节扩大成公共 API。
- 拆分时保持行为兼容，优先移动代码和收窄依赖，再做重构；不要把无关格式化、重命名或行为调整混入同一次改动。

## 公开 API 方向

命名、API设计可参考对齐 Cesium、mapboxgl 风格。方便gis人快速理解迁移。

面向用户的 TypeScript API 需要添加中英双语 JSDoc 注释，中文在前，英文在后。

公开 API 设计应优先建立清晰的领域边界，避免把不同能力的参数拍平到同一层：

- 新增公开配置前，先判断它属于哪个领域对象；不要为了少写一层对象直接加前缀字段。
- 当同一前缀字段出现第二个或第三个时，优先抽出分组对象，而不是继续命名补丁。
- 初始化配置和运行时控制入口应尽量保持同构，例如 `scene.clouds.quality` 对应 `viewer.scene.clouds.quality`。
- 对可能增长的能力，先设计稳定的领域边界，再填具体参数。
- 对外 API 不要直接反映内部实现步骤；它应该表达用户理解的领域概念。
- 快速迭代期发现公开 API 形状不对，要尽早破坏式修正。等示例、文档、面板、插件和用户代码扩散后，改动成本会远高于早期重构。
- 内部缓存结构可以为了历史数据暂时保留旧 key，但不能把旧 key 继续暴露成公开 API。

新增或调整公开 API 前，至少检查：

1. 这个字段属于哪个领域对象？
2. 未来同领域还会增加哪些参数？
3. 初始化配置和运行时 API 是否能使用同一套路径？
4. 字段名是否靠前缀弥补缺失的对象边界？
5. 这个 API 会不会扩散到 examples、docs、widgets、storage、dist 类型声明？
6. 如果半年后破坏式修改，它会影响多少文件？

## 参考能力

能力实现需要参考 /notes/3d-tiles-renderer-capabilities.md 文档中的能力描述；本库主要做API使用侧的易用性封装。

## 参考仓库

+ https://github.com/takram-design-engineering/three-geospatial
+ https://github.com/NASA-AMMOS/3DTilesRendererJS

## 常用命令

- `pnpm build`：构建库产物和声明文件。
- `pnpm type-check`：只做 TypeScript 类型检查，不生成文件。
- `pnpm clean`：删除 `dist`。

## 验证策略

默认不要在每次小改后都运行 `pnpm type-check` 或 `pnpm build`。

根据改动风险选择验证方式：

- 只修改文档时，通常不需要运行命令。
- 只修改 API 注释时，优先检查编辑后的文件；只有可能影响语法或声明产物时才运行命令。
- 修改 TypeScript 实现时，如果会影响类型或行为，运行 `pnpm type-check`。
- 需要刷新 `dist`、修改包产物、调整导出路径，或用户明确要求构建时，运行 `pnpm build`。
- 示例服务、浏览器打开和交互验证默认由用户自己执行；除非用户明确要求，不要启动服务或进行浏览器验证。

如果跳过了命令验证，并且这件事和本次改动有关，最终回复里需要简短说明。

## 编辑约定

- 改动范围保持在用户请求涉及的 API 或文档区域。
- 优先沿用 `src/Viewer.ts` 里的现有模式。
- 手动编辑文件时使用 `apply_patch`。
