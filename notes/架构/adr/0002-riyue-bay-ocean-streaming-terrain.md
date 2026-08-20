# 日月湾海洋采用流式地形场与世界固定近岸网格

## 状态

已接受，2026-08-20。

## 背景

`gpuocean` 的 `ChainSim`、岸线 ribbon 和薄水泡沫以固定程序化岸线的列编号作为状态身份。Tellux 的 Cesium Quantized Mesh 地形会随相机逐级加载父子瓦片，岸线可能移动、分裂或合并；反复重建 ribbon 会让水体、速度和泡沫历史错位，并让地形 LOD 产生非物理压力脉冲。Cesium 海侧还可能保留接近海平面的地形网格，直接叠加透明水面会遮挡生成海床和焦散。

## 决定

日月湾首版保持局部 ENU 海面，但从第一天消费 Tellux 的流式地形生命周期。Tellux 增加通用 `preRender`、分组 `viewer.terrain`、只读瓦片观察和可注销材质装饰器；海洋案例以 `TerrainCoastAdapter` 将瓦片复制为分块高度页，以 `TerrainFieldClipmap` 吸收父子 LOD，再由世界固定的 `LocalGridShoreSolver` 维护近岸状态。外海波浪使用 Three.js WebGPU、TSL、NodeMaterial 和 `renderer.compute()`，不访问 `renderer.backend.device`。海侧原地形通过受控材质装饰器裁剪，调用方不修改 Tellux 所有的模型或几何。

## 替代方案

- 将 raw WebGPU 全量复刻到 Tellux：会绕过 Three.js 资源和管线管理，并把 Three.js 内部变化扩散到整个海洋系统，否决。
- 重构为 WebGL2：Tellux 已有 WebGPU 模式，且视觉与融合质量优先，当前没有降级硬约束，否决。
- 每次 LOD 重建 `ChainSim`/ribbon：状态身份和泡沫历史无法稳定迁移，否决。
- 一次性抓取最高精度地形：无法响应真实流式 LOD，全球化仍需重写，否决。
- 通过只读瓦片观察偷偷修改地形材质：破坏所有权契约并积累隐式依赖，改为受控装饰器。

## 后果

首版工作量高于固定海岸移植，需要实现 page、SDF、wet/dry、守恒改床、GPU 资源调度和调试指标；换来的好处是地形 LOD 不改变模拟状态身份，日月湾与未来全球分块沿同一条架构演进，Three.js、Tellux 地形实现和海洋渲染之间也保留可测试的防腐层。
