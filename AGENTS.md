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

## 参考能力

能力实现需要参考 /docs/3d-tiles-renderer-capabilities.md 文档中的能力描述；本库主要做API使用侧的易用性封装。

## 参考仓库

+ https://github.com/takram-design-engineering/three-geospatial
+ https://github.com/NASA-AMMOS/3DTilesRendererJS
+ takram仓库源码：D:\dev_work\three-geospatial

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
- 不要在公开导出名称里重新引入 `GIS` 前缀。
- 手动编辑文件时使用 `apply_patch`。
