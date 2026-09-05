# AGENTS.md

Tellux 是基于 Three.js 的 ESM TypeScript 3D Earth Engine。公开包名 `tellux`，发布面是 `dist/`（`dist/index.js` / `dist/index.d.ts`）。公开 barrel 是 `src/index.ts`，组合根是 `src/Viewer.ts`。

## 1.0 公开 API 施工中

正在落地 `notes/架构/API稳定版破坏式变更方案.md`。完工并同步文档 / skill 之前：

- **目标形状以该方案为准**，不以当前 `src/`、`docs/`、`examples/` 或 `notes/` 里的旧公开路径为准。
- 下列文档只描述施工前现状或已被取代的设计，不是目标契约：`notes/架构/项目架构.md`、`notes/实现链路/sampleHeightMostDetailed实现链路.md`、`notes/架构/highlight统一高亮方案.md`。`.agents/skills/tellux/` 与用户目录 `tellux-use` skill 仍是 0.2 API，实现本库时不要调用。
- **不要**在每一批源码改动后同步 `docs/`、skill、README。统一放到方案待办第 13 条。

## 硬约束

- 默认用中文回答。
- 面向用户的 TypeScript API 用中英双语 JSDoc，中文在前。
- 公开 API 按领域对象分组，初始化路径与运行时路径同构（例如 `scene.clouds.quality` ↔ `viewer.scene.clouds.quality`）。不要用前缀字段弥补缺失的对象边界；对外 API 表达领域概念，不反映内部实现步骤。
- 改 TypeScript 行为时跑 `pnpm type-check`；改 `dist` / 导出路径时跑 `pnpm build`。不要每次小改都跑这两条。不要自行启动示例服务或做浏览器验证，除非用户明确要求。跳过了与本次改动相关的验证时，在回复里说明。
- 改源码后检查是否需要更新文档和 skill。**1.0 施工期间例外**：见上一节。
- 提交信息用中文 Conventional Commits（`feat` / `fix` / `refactor` / `test` / `docs` / `chore`），不要加签名 trailer。细则见 `.cursorrules`。

## 按需阅读

`notes/` 是深处上下文，按主题打开，不要整目录预加载：

- `架构/`：项目架构、子系统、公开 API 方案
- `依赖能力备忘/`：3d-tiles-renderer、takram-*、打包策略
- `实现链路/`：核心算法与流程
- `坑点记录/`：易踩坑；总览是 `坑点记录/项目坑点记录.md`

改项目主页、文档站、示例或 Sandcastle 时，先读 `notes/架构/examples文档与Sandcastle架构.md`（面向用户的说明放 `docs/`，维护者备忘放 `notes/`，不要手改 `examples/public/docs/`）。
