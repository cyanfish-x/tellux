# AGENTS.md

## 项目概览

Tellux 是一个基于 Three.js 的开源 ESM TypeScript 3D Earth Engine，用于在浏览器中构建数字地球、数字孪生、三维地图以及各类 3D Earth 应用，并提供地球控制器、Cesium Quantized Mesh 地形、多源图层、3D Tiles、大气、体积云和后处理效果。

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

- `notes/架构/examples文档与Sandcastle架构.md`

该文档是维护者架构说明，用于快速理解：

- 项目主页：`examples/index.html`、`examples/index.ts`
- 项目文档页：`docs/`、`docs/.vitepress/config.ts`、`examples/public/docs/`
- 项目 Sandcastle：`examples/sandcastle.html`、`examples/sandcastle/app.ts`、`examples/sandcastle/registry.ts`、`examples/sandcastle/runner.ts`

判断规则：

- 面向用户的教程、API、能力说明放在 `docs/`。
- 项目级备忘、调研记录、架构草稿和维护说明放在 `notes/`。
- `examples/public/docs/` 是 VitePress 构建产物，不要手动编辑。
- 新增普通示例时，通常需要同时关注示例 HTML/TS、`examples/vite.config.ts` 的入口注册，以及 Sandcastle registry 的分类/标题/描述规则。
- 有控件的示例页使用 `createTelluxPanel`（`examples/example-panel-leva.ts` + `leva-vanilla`）。新增或改示例面板时按现有 schema / `effect()` / `statusPath` 契约扩展，并同步 `notes/架构/examples文档与Sandcastle架构.md`。不要再给独立示例页加 HTML `.example-panel`。
- 修改 Sandcastle 时先区分主应用和 runner：`app.ts` 负责编辑器、示例列表、运行控制和日志；`runner.ts` 负责 iframe 内执行当前 payload。

## notes 快速索引

`notes/` 按主题分四组存放项目级备忘、架构说明、能力调研和实现链路：

- `架构/`：项目级架构、历史债务清理、子系统架构
- `依赖能力备忘/`：第三方库（3d-tiles-renderer、takram-three-*）能力调研与打包策略
- `实现链路/`：核心算法 / 流程链路梳理
- `坑点记录/`：易踩坑合集，`坑点记录/项目坑点记录.md` 是总览

遇到对应主题时，先读相关 notes，再进入源码细节。

- 涉及 Viewer 创建流程、每帧渲染流程、TilesetManager、地形 / 影像 / surface tileset 生命周期时，先读 `notes/架构/项目架构.md`。
- 涉及历史 bug、容易误判的实现方向、渲染循环抢占和高度采样副作用时，先读 `notes/坑点记录/项目坑点记录.md`。
- 涉及 3D Tiles 点云颜色发白、法线、unlit、`pointCloudShading`（EDL / attenuation）时，先读 `notes/坑点记录/点云unlit与post-process大气坑点.md`。
- 涉及 WebGPU 影像瓦片颠倒、错缝或 `WebGPUTerrainOverlayPlugin` 贴图时，先读 `notes/坑点记录/WebGPU影像ImageBitmap二次翻转坑点.md`。
- 涉及 WebGPU ECEF 大数坐标抖动、Three.js `highPrecision`、`InstancedMesh` / `SkinnedMesh` 精度边界时，先读 `notes/坑点记录/WebGPU地球大数坐标精度抖动坑点.md`。
- 涉及 `Scene` 运行时控制对象、`AtmosphereManager` 状态同步、大气用户态和底层 effect/light 状态边界时，先读 `notes/坑点记录/Scene与AtmosphereManager双状态坑点.md`。
- 涉及实体（点 / 折线 / 多边形）颜色显示偏色、`toneMapped` 失效、`setEffects` 后处理管线或 AgX 反求补偿时，先读 `notes/坑点记录/实体颜色被AgX色调映射压扁坑点.md`。
- 涉及 `sampleHeightMostDetailed`、地形高度采样、离屏采样、采样专用 tileset、LoadRegionPlugin 或 raycast 高度求交时，先读 `notes/实现链路/sampleHeightMostDetailed实现链路.md`。
- 涉及 3D Tiles 能力评估、数据格式、LOD、调试、性能、Cesium Ion、地形或影像瓦片能力时，先读 `notes/依赖能力备忘/3d-tiles-renderer能力备忘.md`。
- 涉及 3D Tiles plugin / overlay 取舍、认证插件、GLTFExtensionsPlugin、QuantizedMeshPlugin、ImageOverlayPlugin、TilesFadePlugin、UpdateOnChangePlugin、MVT / GeoJSON overlay 时，先读 `notes/依赖能力备忘/3d-tiles-renderer插件与影像叠加能力备忘.md`。
- 涉及经纬高、椭球、大地坐标、瓦片坐标、STBN / typed array 资源加载或 geospatial shader 工具时，先读 `notes/依赖能力备忘/takram-three-geospatial能力备忘.md`。
- 涉及天空大气、空气透视、太阳 / 月亮方向、光源式光照、星空材质或与云层合成时，先读 `notes/依赖能力备忘/takram-three-atmosphere能力备忘.md`。
- 涉及体积云、云层建模、天气贴图、噪声纹理、程序化纹理、云影或云渲染性能时，先读 `notes/依赖能力备忘/takram-three-clouds能力备忘.md`。
- 涉及镜头光晕、抖动、深度 / 法线效果、几何 pass、Hald LUT 或后处理管线集成时，先读 `notes/依赖能力备忘/takram-three-geospatial-effects能力备忘.md`。
- 涉及项目主页、文档站点、示例站点或 Sandcastle 时，先读 `notes/架构/examples文档与Sandcastle架构.md`。
- 涉及 `viewer.highlight`、后处理描边 Outline、3D Tiles feature 叠加高亮时，先读 `notes/架构/highlight统一高亮方案.md`。
- 涉及打包策略、`external` / `noExternal`、peerDependencies 取舍、three 单例或第三方依赖是否打入产物时，先读 `notes/依赖能力备忘/前置依赖打包策略备忘.md`。

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

新增或调整公开 API 前，至少检查：

1. 这个字段属于哪个领域对象？
2. 未来同领域还会增加哪些参数？
3. 初始化配置和运行时 API 是否能使用同一套路径？
4. 字段名是否靠前缀弥补缺失的对象边界？
5. 如果半年后破坏式修改，它会影响多少文件？设计时应考虑可拓展性

## 参考能力

能力实现需要参考 `notes/依赖能力备忘/3d-tiles-renderer能力备忘.md` 文档中的能力描述；本库主要做API使用侧的易用性封装。

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

## Git 提交规范

提交信息必须使用中文，并遵循 Conventional Commits 风格：

```text
<type>: <中文描述>
```

允许的 `type`：

- `feat`：新增功能
- `fix`：修复问题
- `refactor`：重构且不改变功能
- `test`：新增或修改测试
- `docs`：仅文档变更
- `chore`：工具、依赖或配置变更

提交应保持单一职责；正文可选，用于说明变更原因或重要背景。

## 强制规则

+ 除非用户指定了输出语言，否则默认用中文回答
+ 改动源码后检查是否需要更新文档和skill
+ 提交信息使用中文，且不得包含签名 trailer
