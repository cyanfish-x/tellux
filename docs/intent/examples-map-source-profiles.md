# 示例站图源 profile

2026-09-12 确认，同日按线上底图合规性改为生产走 Cesium Ion 影像。覆盖 `examples/` 默认底图 / 地形如何按环境选择；不覆盖 Tellux 库的公开数据源 API。

## 意图

- Outcome: 线上示例默认 Cesium Ion Bing 航空影像 + Cesium World Terrain；本地开发仍用 ArcGIS 底图 + Cesium Ion 地形
- User: 示例站访客，以及部署后验收
- Why now: 个人天地图 token 额度太少，线上访客一多很快用完；匿名 ArcGIS World Imagery 瓦片也不符合 Esri 条款，所以生产改走带 token 的 Cesium Ion 影像和地形
- Success: 生产构建走 `cesiumIon` 档；改 `productionMapSourceProfile` 再构建就能切回 `tianditu` 或 `local`
- Constraint: catalog 可补 Cesium Ion 影像零件，工厂只加对应分支；不把 profile 做成环境变量
- Out of scope: 不改引擎默认数据源、不改本地 `local` 档、不动 `data-sources` 这种本身就是天地图能力演示的示例

## 做法

配置落在 `examples/map-sources.config.ts`：

- `localMapSourceProfile`：本地 `pnpm dev`，默认 `"local"`（ArcGIS + Ion 地形）
- `productionMapSourceProfile`：生产构建，默认 `"cesiumIon"`（Ion Bing 航空 asset `2` + Ion 地形 asset `1`）

`resolveMapSourceProfile` 按 `import.meta.env.DEV` 二选一。密钥用已有的 `VITE_CESIUM_ION_TOKEN`。

不采用环境变量读 profile。profile 是仓库策略不是密钥；本仓库没有可提交的 `.env.development` / `.env.production`，`.env.*` 还在 gitignore。组合继续写在 ts，密钥继续放 `.env`。

切回天地图：把对应档改成 `"tianditu"`。本地改完刷新即可；生产改完后重新构建 / 部署。
