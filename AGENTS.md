# AGENTS.md

Tellux 是基于 Three.js 的 ESM TypeScript 3D Earth Engine。公开包名 `tellux`，发布面是 `dist/`（`dist/index.js` / `dist/index.d.ts`）。公开 barrel 是 `src/index.ts`，组合根是 `src/Viewer.ts`。

当前公开 API 以 1.0 稳定面为准：领域门面（`overlays` / `tilesets` / `models` / `terrain` / `globe` / `renderer` / `postProcess` / `highlighter` / `controls`）、`LonLat*` 坐标，以及初始化与运行时同构。从 0.2 升级见 `docs/guide/migration-1.0.md`。破坏式变更的设计记录在 `notes/架构/API稳定版破坏式变更方案.md`。

`notes/架构/项目架构.md`、`notes/实现链路/sampleHeightMostDetailed实现链路.md` 若仍写旧公开路径，以源码与迁移指南为准。`notes/架构/highlight统一高亮方案.md` 是 0.2 设计背景；实现高亮时用 `viewer.highlighter`。

## 硬约束

- 默认用中文回答。
- 面向用户的 TypeScript API 用中英双语 JSDoc，中文在前。
- 公开 API 按领域对象分组，初始化路径与运行时路径同构（例如 `scene.clouds.quality` ↔ `viewer.scene.clouds.quality`）。不要用前缀字段弥补缺失的对象边界；对外 API 表达领域概念，不反映内部实现步骤。
- 改 TypeScript 行为时跑 `pnpm type-check`；改 `dist` / 导出路径时跑 `pnpm build`。不要每次小改都跑这两条。不要自行启动示例服务或做浏览器验证，除非用户明确要求。跳过了与本次改动相关的验证时，在回复里说明。
- 改源码后检查是否需要更新文档和 skill。用户可见行为、公开路径或示例变化时，同步 `docs/`、`.agents/skills/tellux/` 与 `README*.md`。
- 提交信息用中文 Conventional Commits（`feat` / `fix` / `refactor` / `test` / `docs` / `chore`），不要加签名 trailer。细则见 `.cursorrules`。

## 按需阅读

`notes/` 是深处上下文，按主题打开，不要整目录预加载：

- `架构/`：项目架构、子系统、公开 API 方案
- `依赖能力备忘/`：3d-tiles-renderer、takram-*、打包策略
- `实现链路/`：核心算法与流程
- `坑点记录/`：易踩坑；总览是 `坑点记录/项目坑点记录.md`

改项目主页、文档站、示例或 Sandcastle 时，先读 `notes/架构/examples文档与Sandcastle架构.md`（面向用户的说明放 `docs/`，维护者备忘放 `notes/`，不要手改 `examples/public/docs/`）。
