# 日月湾 Ocean × Tellux WebGPU Sandcastle 实施计划

## 交付目标

在 Tellux Sandcastle 中提供固定于海南万宁日月湾的 WebGPU 海洋案例。真实流式地形决定陆地和岸线，岸线距离生成连续海床，近岸浅水求解驱动破浪、泡沫和焦散；外海视觉保留 `gpuocean` 的参数语义。

## 增量 1：引擎扩展

1. 以测试驱动新增 `ViewerEventDispatcher` 和 `preRender` 事件。
2. 新增 `TerrainTileLifecycleManager` 与公开 `TerrainRuntime` facade。
3. 接入地形 `load-model` / `dispose-model`，实现快照、同步 replay、过滤、reset 和 source revision。
4. 实现材质装饰器链、已加载模型重放、失败隔离、恢复和资源释放。
5. 同步公开导出、双语 JSDoc、Viewer/terrain 文档和 Tellux skill。

验收：相关 focused tests、`pnpm type-check`、完整单测通过；旧 `viewer.setTerrain()` 行为不变。

## 增量 2：地形场

1. 在 `examples/ocean/` 定义 `RiyueBayPreset`、参数 schema 和案例私有接口。
2. `TerrainCoastAdapter` 同步复制表面 geometry group，Worker 栅格化 `65 × 65` 高度页。
3. `TerrainFieldClipmap` 实现父级 fallback、完整子页替换、1.5 秒混合、revision 和 64MB LRU。
4. 派生 land mask、hysteresis、SDF、有效位和指数缓坡海床；只发布完整 revision。
5. 增加 height、land mask、SDF、revision、队列和耗时调试输出。

验收：纯逻辑测试覆盖 skirt 排除、虚拟子页、gutter、LOD 混合、LRU、SDF 和 bathymetry 连续性。

## 增量 3：海洋与近岸求解

1. 移植外海 WaveField、噪声、海面 NodeMaterial 和世界空间泡沫语义。
2. 实现 `LocalGridShoreSolver` 的 WebGPU/TSL compute 与 CPU 参考逻辑。
3. 接入谱波海侧松弛带、wet/dry、CFL/substep、泡沫平流和 terrain correction volume。
4. `TerrainOceanMaskAdapter` 装饰地形材质，在局部域内裁水侧、保陆侧，并渲染生成海床。
5. `OceanManager` 通过 Viewer `preRender` 更新全部状态，统一销毁 Worker、事件和 GPU 资源。

验收：静水平衡、正水深、质量漂移、LOD 假浪、暂停和泡沫测试通过；代码不访问 raw GPUDevice、不自建动画循环。

## 增量 4：案例、参数与验收

1. 新增日月湾独立 HTML/TS 示例和 Sandcastle registry 条目。
2. runner 仅在源码引用 `createRiyueBayOceanDemo` 时动态加载 ocean binding。
3. 参数面板保留原始全部参数，增加海平面、坡度、交接深度、LOD 混合、质量和调试项。
4. 地形使用自托管 URL 或 Cesium Ion；凭据/WebGPU 缺失时显示可操作错误。
5. 完成构建体积、1920 × 1080 视觉、LOD 压力、60 秒性能和十次销毁重建验收。

## 完成门槛

- `pnpm type-check`
- `pnpm test:run`
- `pnpm build`
- `pnpm build:examples`
- `git diff --check`
- Chrome console、网络和视觉无未解释错误；高质量档满足约定帧率与资源预算。
