# 日月湾 Ocean 实施清单

## 文档

- [x] 记录近岸现状、动态 LOD 冲突和全球演进方向
- [x] 锁定日月湾、WebGPU、地形源、性能和 API 决策
- [x] 新增架构 ADR
- [x] 新增实施计划与检查清单
- [x] 同步 Viewer/terrain 用户文档与 Tellux skill

## Tellux 引擎

- [x] `ViewerEventDispatcher` 与 `preRender`
- [x] `TerrainRuntime` 与 `TerrainTileLifecycleManager`
- [x] 地形 load/unload/reset/replay/filter/source revision
- [x] 受控材质装饰器链与资源恢复
- [x] 公开导出、双语 JSDoc 和兼容测试

## 地形场

- [x] `RiyueBayPreset` 与参数 schema
- [x] 表面 geometry 安全复制和 Worker 栅格化
- [x] `TerrainFieldClipmap`、父子 fallback、blend、LRU
- [x] land mask、hysteresis、SDF、bathymetry、validity
- [x] terrain reset、Worker 失败和调试指标

## 海洋

- [x] `OceanManager` 与 Viewer 单一循环
- [x] 外海 WaveField 与 NodeMaterial 水面
- [x] `LocalGridShoreSolver` 与 CPU 参考测试
- [x] 近岸泡沫、焦散和外海交接
- [x] `TerrainOceanMaskAdapter` 与水侧海床
- [x] 完整资源销毁

## Sandcastle 与验收

- [x] 独立日月湾示例
- [x] Sandcastle 动态 ocean binding
- [x] 全部原始参数和高级调试面板
- [x] 类型、单测、库构建、示例构建、diff 检查
- [x] 1920 × 1080 WebGPU 视觉与性能记录
- [x] 十次重建无监听、Worker 或 GPU 资源增长
