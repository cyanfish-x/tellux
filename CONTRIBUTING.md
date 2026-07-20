# Contributing to Tellux

[English](./CONTRIBUTING.en.md) | 中文

感谢你关注 Tellux 并愿意参与贡献。Tellux 是一个基于 Three.js 的 ESM TypeScript GIS viewer，欢迎通过 Issue、Pull Request、文档和示例改进项目。

Thank you for your interest in Tellux. Contributions are welcome through issues, pull requests, documentation, and examples.

## 🚀 开始开发

Tellux 使用 Node.js、pnpm、TypeScript、Vite 和 Vitest。

```bash
git clone https://github.com/cyanfish-x/tellux.git
cd tellux
pnpm install
```

常用命令：

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 同时启动示例站点和文档站点 |
| `pnpm type-check` | 执行 TypeScript 类型检查 |
| `pnpm test:run` | 运行测试 |
| `pnpm build` | 构建库产物和声明文件 |
| `pnpm build:examples` | 构建文档和示例站点 |
| `pnpm docs:build` | 只构建 VitePress 文档 |

## 🗂️ 项目结构

- `src/`：Tellux 源码和公开 API 实现。
- `examples/`：独立示例、主页和 Sandcastle。
- `docs/`：面向使用者的指南、API 和能力说明。
- `notes/`：维护者架构说明、调研资料和实现备忘。
- `dist/`：构建产物，仅在需要刷新发布内容时更新。

新增面向用户的教程、API 或能力说明时，请放入 `docs/`。项目架构、调研和维护记录请放入 `notes/`。`examples/public/docs/` 是文档构建输出，不要手动编辑。

## 📝 提交代码

1. 从最新的默认分支创建一个短期分支，分支名称应能说明改动目的。
2. 保持每个提交只包含一个清晰的逻辑变更。
3. 修改 TypeScript 行为后运行 `pnpm type-check`；修改测试后运行 `pnpm test:run`。
4. 修改构建产物、导出路径或发布内容时运行 `pnpm build`。
5. 提交 Pull Request 前检查 `git diff`，确认没有提交 `.env`、密钥、临时文件或无关格式化改动。

### 提交信息

项目使用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/)，提交信息由 commitlint 和 Husky 校验：

```text
<type>(<scope>): <subject>
```

常用类型包括：

- `feat`：新增功能
- `fix`：修复问题
- `docs`：文档变更
- `refactor`：重构
- `test`：测试变更
- `chore`：构建、工具或依赖变更

示例：

```text
feat(viewer): add runtime terrain switching
fix(camera): preserve pitch when flying to target
docs: clarify WebGPU limitations
```

## 🔀 Pull Request

Pull Request 描述应说明：

- 解决了什么问题，或新增了什么能力。
- 采用了什么实现方式，以及需要关注的兼容性或性能影响。
- 如何验证改动，列出实际运行过的命令。
- 是否涉及公开 API、文档、示例或构建产物。

涉及公开 API 时，请同时更新对应的 TypeScript JSDoc、`docs/api/` 或 `docs/guide/`，并确保示例中的 API 形状保持清晰。涉及示例站点或 Sandcastle 时，请先阅读[示例、文档和 Sandcastle 架构说明](./notes/架构/examples文档与Sandcastle架构.md)。

## 📚 文档与示例

Tellux 的示例同时用于功能展示和 API 教程。新增普通示例时，通常需要关注：

- `examples/<id>.html` 和 `examples/<id>.ts` 是否可以独立运行。
- `examples/vite.config.ts` 是否需要注册新的 HTML 入口。
- Sandcastle registry 是否需要补充分类、标题、描述或标签规则。
- 示例是否显式展示关键 Viewer 配置，避免把核心 API 隐藏在公共 helper 中。

## 🎨 代码风格

- 优先沿用现有模块边界、类型命名和配置分组方式。
- 对外 TypeScript API 添加中文在前、英文在后的双语 JSDoc。
- 坐标相关 API 遵循项目约定：数组形式为 `[longitude, latitude, height]`，单位为度和米。
- 只添加必要注释，重点解释不明显的设计原因，不重复代码本身的含义。

## 🐛 问题反馈

提交 Issue 时请尽量提供 Tellux 版本、Three.js 和相关 peer dependency 版本、运行环境、最小复现步骤，以及必要的控制台错误或截图。涉及 Cesium Ion、WMS、WMTS 等外部服务时，请同时说明数据源配置和授权条件。

## ⚖️ License

提交到 Tellux 的代码和文档将按照项目 [MIT License](./LICENSE) 发布。
