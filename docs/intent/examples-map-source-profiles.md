# 示例站图源 profile

2026-09-12 确认。覆盖 `examples/` 默认底图 / 地形如何按环境选择；不覆盖 Tellux 库的公开数据源 API。

## 意图

- Outcome: 线上示例默认跟本地 `local` 档一样，ArcGIS 底图 + Cesium Ion 地形
- User: 示例站访客，以及部署后验收
- Why now: 个人天地图 token 额度太少，线上示例站访客一多很快就会用完；生产因此也改走 Cesium，额度够了再切回天地图
- Success: 生产构建走 `local` 档；改 `productionMapSourceProfile` 再构建就能切回 `tianditu`
- Constraint: 现有 catalog / profile / 工厂逻辑保留，只补生产这一侧配置
- Out of scope: 不改引擎默认数据源、不把 profile 做成环境变量、不重构工厂、不动 `data-sources` 这种本身就是天地图能力演示的示例

## 做法

配置落在 `examples/map-sources.config.ts`：

- `localMapSourceProfile`：本地 `pnpm dev`
- `productionMapSourceProfile`：生产构建

两者默认都是 `"local"`。`resolveMapSourceProfile` 按 `import.meta.env.DEV` 二选一，不再把生产写死为 `"tianditu"`。

不采用环境变量读 profile。profile 是仓库策略不是密钥；本仓库没有可提交的 `.env.development` / `.env.production`，`.env.*` 还在 gitignore。组合继续写在 ts，密钥继续放 `.env`。

切回天地图：把对应档改成 `"tianditu"`。本地改完刷新即可；生产改完后重新构建 / 部署。
