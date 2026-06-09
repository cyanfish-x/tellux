# 3D Tiles Renderer 能力参考

Tellux 基于 `3d-tiles-renderer` 提供 3D Tiles 和地形能力封装。这里先记录 Tellux 使用侧最相关的能力，完整调研可继续参考仓库中的能力文档。

## 当前关注点

- 3D Tiles 场景加载：`tileset.json`、Cesium Ion endpoint。
- Cesium quantized-mesh terrain：地形根目录或 `layer.json`。
- 影像 overlay：XYZ、WMS、GeoJSON、MVT 等图层贴到地形或裸球表面。
- LOD 与缓存：通过 tiles renderer 的更新流程参与主渲染循环。
- 采样：结合已加载瓦片、地形 availability 和临时局部加载区域做高度查询。

## Tellux 封装边界

Tellux 主要做 API 使用侧的易用性封装，不重新实现底层 3D Tiles 解析、瓦片调度或地理坐标转换核心。

更底层的插件、overlay 和 renderer 能力仍以 `3d-tiles-renderer` 文档和源码为准。
