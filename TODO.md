# Tellux 待办事项

## 实体贴地（Ground Clamp）

完整设计见 [docs/design/ground-clamp.md](./docs/design/ground-clamp.md)。

- 背景：当前实体位置是绝对椭球高，无任何地形跟随；点 / 线 / 面需要真·贴地。
- 方案：GPU 阴影体 + 深度纹理逐片元分类（对标 Cesium `GroundPrimitive` / `GroundPolylinePrimitive`），**否决** CPU 采样重建的妥协路线。
- 渲染器：WebGL 优先全量实现；WebGPU 暂不处理（`onBeforeCompile` 在 WebGPU 失效，后续单独立项）。

- [ ] P0 深度分类管线 + 贴地线

  - 新增 `GroundClampPass`（effects pass，同 `EntityRenderManager` 形态），复用 `readBuffer.depthTexture` 作地表深度源。
  - port Cesium `createGroundPolylineGeometry`：沿椭球细分 + 墙体积几何（8 顶点 / 36 索引）。
  - port `PolylineShadowVolumeFS/VS`：片元读深度还原地表点 → 右 / 起 / 终平面 + 半宽判定。
  - 落实工程细节 1：`EncodedCartesian3` 高 / 低双精度拆分（抗地球尺度抖动）。
  - 落实工程细节 2：法向 `±EPSILON5` 微偏移治 z-fighting（不抬高度）。
  - API：`PolylineOptions.heightReference: 'CLAMP_TO_GROUND'`。

- [ ] P1 贴地面

  - `GroundPolygonGraphic` 阴影体几何（port `PolygonGeometry` + `createShadowVolume`）。
  - 模板两遍材质（stencil-depth + color，port `ShadowVolumeAppearanceFS`）。
  - `PolygonOptions.heightReference: 'CLAMP_TO_GROUND'`。

- [ ] P2 点 heightReference

  - 接入 `HeightSampler`：add 即摆椭球高，`sampleHeightMostDetailed` resolve 后 snap。
  - LOD 变化去抖重采样（点仅 1 顶点）。
  - `PointOptions.heightReference: 'CLAMP_TO_GROUND'`。

- [ ] P3 terrain / 3D Tiles 深度分离

  - 主渲染插入 terrain-only 深度快照 → `CLAMP_TO_TERRAIN` / `CLAMP_TO_TILESET`。

- [ ] P4 RELATIVE_TO_GROUND + 打磨

  - `RELATIVE_TO_GROUND`（地表高 + height 偏移）；性能（scissor / 包络）、与 OIT 交互、拾取语义厘清。

## WebGPU 渲染模式

- [ ] 实现 WebGPU 渲染模式下的瓦片 LOD fade 过渡效果

  - 背景：WebGPU 模式下地球瓦片层级切换时直接 pop，没有 WebGL 版的丝滑淡入淡出。
  - 根因：`TilesFadePlugin` 依赖 Three.js `onBeforeCompile` GLSL 注入，WebGPURenderer 不支持该机制。
  - 详细分析与完善方向见 [notes/坑点记录/WebGPU下onBeforeCompile着色器机制失效坑点.md](./notes/坑点记录/WebGPU下onBeforeCompile着色器机制失效坑点.md)。
