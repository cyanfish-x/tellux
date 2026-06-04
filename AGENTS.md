# AGENTS.md

## 项目概览

Tellux 是一个 ESM TypeScript 库，基于 Three.js 提供 GIS viewer，用于加载 Cesium Ion 3D Tiles，并包含地球控制器、大气、体积云和后处理效果。

公开包名是 `tellux`。发布内容来自 `dist`，包入口是 `dist/index.js`，类型入口是 `dist/index.d.ts`。

## 源码结构

- `src/index.ts`：公开 barrel export。
- `src/Viewer.ts`：主实现文件，包含主要公开 API 类型和类。
- `dist/`：生成的构建产物。只有需要刷新构建输出时才更新。
- `README.md`：面向用户的使用文档。

## 公开 API 方向

命名、API设计可参考对齐 Cesium、mapboxgl 风格。方便gis人快速理解迁移。

面向用户的 TypeScript API 需要添加中英双语 JSDoc 注释，中文在前，英文在后。

## 参考能力

能力实现需要参考 /docs/3d-tiles-renderer-capabilities.md 文档中的能力描述；本库主要做API使用侧的易用性封装。

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
