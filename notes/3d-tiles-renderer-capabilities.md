# 3d-tiles-renderer 能力备忘

本文档记录 Tellux 当前依赖的 `3d-tiles-renderer` 能力范围，便于后续评估 API 设计、功能接入和问题排查。

当前 Tellux 依赖版本：

- `3d-tiles-renderer`: `^0.4.27`
- Tellux 中主要入口：
  - `TilesRenderer`
  - `GlobeControls`
  - `CesiumIonAuthPlugin`
  - `GLTFExtensionsPlugin`
  - `TilesFadePlugin`
  - `UpdateOnChangePlugin`
  - `GeneratedSurfacePlugin`
  - `ImageOverlayPlugin`

## 总体定位

`3d-tiles-renderer` 是一个 JavaScript 3D Tiles 渲染器，提供核心 tileset 调度、瓦片加载、缓存、LOD 选择、Three.js / Babylon.js / React Three Fiber 集成，以及插件扩展系统。

对 Tellux 来说，它承担的是 3D Tiles 数据层和地理瓦片调度层；Tellux 自身可以在它之上包装 Cesium 风格 API、地球控制器、大气、云、后处理和更稳定的公开接口。

## 核心 3D Tiles 能力

- 加载 3D Tiles tileset JSON。
- 遍历 tile tree，并根据相机和屏幕空间误差选择可见瓦片。
- 支持 `REPLACE` / `ADD` refinement。
- 支持视锥裁剪和 screen-space error 调度。
- 支持异步下载队列、解析队列和 tile 处理队列。
- 支持 LRU 缓存，按瓦片数量和字节大小控制缓存。
- 支持加载进度、加载统计、失败状态和失败重试。
- 支持事件：
  - `needs-update`
  - `load-tileset`
  - `load-root-tileset`
  - `tiles-load-start`
  - `tiles-load-end`
  - `tile-download-start`
  - `load-model`
  - `dispose-model`
  - `tile-visibility-change`
  - `update-before`
  - `update-after`
  - `load-error`

常用配置方向：

- `errorTarget`: 控制目标屏幕空间误差。
- `maxDepth`: 限制遍历深度。
- `maxTilesProcessed`: 控制单次遍历处理量。
- `loadSiblings`: 是否一起加载兄弟瓦片，减少快速移动时的空洞。
- `loadAncestors`: 是否加载祖先瓦片作为子瓦片加载前的回退显示。
- `displayActiveTiles`: 是否保留 active tiles，适合离屏阴影或额外相机渲染。
- `fetchOptions`: 配置请求参数。

## 支持的数据格式

Three.js 集成下可加载和解析：

- `b3dm`: Batched 3D Model。
- `i3dm`: Instanced 3D Model。
- `pnts`: Point Cloud。
- `cmpt`: Composite tile。
- glTF / GLB 内容。

同时支持 legacy 3D Tiles 的：

- `FeatureTable`
- `BatchTable`

这意味着后续如果要做 feature pick、属性查询或 batch metadata 读取，可以优先调查 loader 返回内容以及 `batchTable` / `featureTable` 的暴露方式。

## Three.js 集成能力

`TilesRenderer` 提供 Three.js 侧的渲染集成：

- `tileset.group`: 3D Tiles 内容容器，可加入 Three.js scene。
- `setCamera(camera)`: 注册相机参与瓦片选择。
- `setResolution(camera, width, height)`: 为相机设置分辨率。
- `setResolutionFromRenderer(camera, renderer)`: 从 renderer 读取尺寸设置分辨率。
- `deleteCamera(camera)`: 移除相机。
- `forEachLoadedModel(callback)`: 遍历已加载模型。
- `raycast(raycaster, intersects)`: 对已加载瓦片进行 Three.js raycast。
- `getBoundingBox(target)`: 获取 root bounding box。
- `getBoundingSphere(target)`: 获取 root bounding sphere。
- `getOrientedBoundingBox(targetBox, targetMatrix)`: 获取 root OBB。

Tellux 当前已经把 `tileset.group` 加入 scene，并在拾取逻辑里对 `tileset.group` 做 raycast。

## 地球与地理数学能力

`3d-tiles-renderer` 内置 `Ellipsoid` 和 WGS84 相关工具，可用于地球坐标转换和地球交互：

- 经纬高转 Cartesian。
- Cartesian 转经纬高。
- 计算 East-North-Up frame。
- 计算 object / camera frame。
- 椭球射线相交。
- 计算地表法线。
- 计算点到椭球面的高度。
- 估算地平线距离。

Tellux 当前依赖这些能力实现：

- `GlobeControls.setEllipsoid(...)`
- 鼠标拾取点转经纬高。
- 相机 Cesium 风格视角方法中的经纬高计算。

## 相机和控制器

可用控制器和辅助类：

- `EnvironmentControls`
  - 普通 3D 环境控制。
  - 支持拖拽、缩放、旋转、阻尼、飞行模式。
- `GlobeControls`
  - 面向地球/椭球的控制器。
  - 支持椭球 aware 的旋转、惯性、near/far 自动调整。
- `CameraTransitionManager`
  - 管理 perspective / orthographic camera 之间的过渡。

Tellux 当前使用 `GlobeControls`，并在 Tellux 自己的 `Camera` 包装类中提供 Cesium 风格视角方法。

## 认证与外部平台

可用认证插件：

- `CesiumIonAuthPlugin`
  - 解析 Cesium Ion asset endpoint。
  - 添加请求 token。
  - 可自动刷新授权。
  - 收集 attribution。
  - 可按 asset type 做自定义处理。
- `GoogleCloudAuthPlugin`
  - 面向 Google Photorealistic Tiles / Google Tiles API 场景。

Tellux 当前已经支持通过 `type: 'cesium-ion'` 数据源配置创建 Cesium Ion 影像图层，并通过 `CesiumIonAuthPlugin` 加载 Cesium Ion 3D Tiles 资源。

## glTF 扩展能力

`GLTFExtensionsPlugin` 可以给 tile 内容的 `GLTFLoader` 自动注册常见扩展：

- `CESIUM_RTC`
  - 处理 Cesium RTC center 偏移。
- `EXT_structural_metadata`
  - 读取结构化元数据。
  - 数据会挂到 `scene.userData.structuralMetadata` 和 mesh 上。
- `EXT_mesh_features`
  - 读取 mesh feature ID。
  - 数据会挂到 `mesh.userData.meshFeatures`。
- Draco compressed geometry。
- KTX2 compressed textures。
- Meshopt compressed meshes。

Tellux 当前已经传入 `DRACOLoader`，并开启默认 glTF 扩展能力。

后续可扩展方向：

- 鼠标拾取后读取 feature ID。
- 根据 feature ID 查询 property table。
- 支持结构化元数据展示。
- 暴露面向用户的 feature pick API。

## 影像和地图瓦片能力

`3d-tiles-renderer` 的影像能力分两类：生成瓦片表面，以及把影像 overlay 到已有 3D tile 表面。

### 影像瓦片插件

可用格式：

- `XYZTilesPlugin`
- `TMSTilesPlugin`
- `WMSTilesPlugin`
- `WMTSTilesPlugin`
- `DeepZoomImagePlugin`

相关能力：

- 平面投影。
- 椭球投影。
- EPSG:3857 / EPSG:4326 等投影配置。
- WMS / WMTS capabilities loader。

Tellux 当前不再通过影像瓦片插件作为公开入口；裸球由 `GeneratedSurfacePlugin({ shape: 'ellipsoid' })` 生成，影像统一通过 overlay 贴到裸球或地形表面。

### Image overlay 插件

`ImageOverlayPlugin` 可将一个或多个 overlay 复合到 3D tile 几何表面。

可用 overlay：

- `XYZTilesOverlay`
- `TMSTilesOverlay`
- `WMSTilesOverlay`
- `WMTSTilesOverlay`
- `CesiumIonOverlay`
- `GoogleMapsOverlay`
- `DeepZoomOverlay`
- `GeoJSONOverlay`
- `MVTOverlay`
- `PMTilesOverlay`

相关能力：

- 多 overlay 顺序控制。
- overlay opacity / color / alpha mask。
- URL 预处理，可用于 token 注入。
- 失败 overlay 重试。
- tile splitting，便于更贴合影像瓦片边界。

当前接入和后续可扩展方向：

- 已通过 `viewer.layers` 支持 xyz、Cesium Ion imagery、MVT、GeoJSON 和 WMS imagery layer。
- 后续支持 WMTS / TMS。
- 后续支持 GeoJSON / PMTiles 叠加。
- 继续增强多图层叠加、透明度和顺序控制。

## 地形能力

`QuantizedMeshPlugin` 支持 Cesium quantized-mesh terrain：

- 从 `layer.json` 加载 terrain 描述。
- 动态生成 3D Tiles tile content。
- 支持 skirt。
- 支持生成法线。
- 支持 solid closed mesh。
- 可应用推荐的 terrain 设置。

如果 Tellux 后续要支持 Cesium terrain 或独立地形图层，应优先评估该插件。

## 调试和可视化能力

`DebugTilesPlugin` 可用于调试 tileset：

- 显示 box / sphere / region bounding volume。
- 显示 parent bounds。
- 按 depth / error / distance / load order 等模式给瓦片着色。
- 支持 custom color callback。
- 支持 unlit 模式。

这适合做 Tellux 内部 debug 开关，不一定作为首批公开 API。

## LOD 过渡和按需更新

Tellux 当前已使用：

- `TilesFadePlugin`
  - LOD 切换时淡入淡出，减少 pop-in。
  - 有 `fade-change` / `fade-start` / `fade-end` 事件。
- `UpdateOnChangePlugin`
  - 没有相机变化、瓦片变化或显式更新需求时跳过 `TilesRenderer.update()`。
  - 适合按需渲染或事件驱动渲染。

## 内存和性能插件

可用插件：

- `UnloadTilesPlugin`
  - 瓦片不可见后释放 GPU geometry / texture / material。
  - CPU 数据仍保留在缓存中，可避免重新 fetch。
  - 提供 `estimatedGpuBytes`。
- `TileCompressionPlugin`
  - 压缩 geometry attribute。
  - 可禁用 texture mipmaps。
  - 能降低内存，但可能产生视觉损失。
- `BatchedTilesPlugin`
  - 使用 Three.js `BatchedMesh` 降低 draw calls。
  - 适合大量单材质、单 mesh 瓦片。
  - 与修改材质或依赖特殊 mesh 数据的插件存在兼容限制。

后续如果要做移动端优化或大 tileset 内存控制，可以优先评估 `UnloadTilesPlugin`，再考虑压缩和合批。

## 区域加载与几何处理

可用插件：

- `LoadRegionPlugin`
  - 通过 `SphereRegion` / `RayRegion` / `OBBRegion` 限制加载区域。
  - 支持 mask 模式，阻止区域外瓦片加载。
- `TileFlatteningPlugin`
  - 将瓦片顶点压到指定 mesh shape 表面。
  - 可用于道路、平台、局部平整等场景。
- `ReorientationPlugin`
  - 自动重定向和重置 tileset 原点。
  - 可按 lat/lon/height 放置 tileset。

这些能力适合未来扩展局部区域分析、裁切加载、局部工程场景放置等功能。

## 当前 Tellux 已接入能力

当前 `src/Viewer.ts` 中已接入：

- `TilesRenderer`
  - tileset 创建、更新、销毁。
  - tileset group 加入 scene。
  - camera / resolution 注册。
- `GLTFExtensionsPlugin`
  - 配置 Draco loader。
- `TileCreasedNormalsPlugin`
  - Tellux 本地插件，用于按 3D Tiles 图层重新生成折痕法线。
- `TilesFadePlugin`
  - LOD fade。
- `UpdateOnChangePlugin`
  - 按需更新。
- `GeneratedSurfacePlugin`
  - 无地形模式下生成椭球裸球表面。
- `ImageOverlayPlugin`
  - 将 imagery layer stack 贴到裸球或地形表面。
- `XYZTilesOverlay`
  - xyz imagery layer。
- `WMSTilesOverlay`
  - WMS imagery layer。
- `CesiumIonOverlay`
  - Cesium Ion imagery layer。
- `CesiumIonAuthPlugin`
  - Cesium Ion 3D Tiles asset 加载。
- `MVTOverlay`
  - 通过 `type: 'mvt'` 接入 Mapbox Vector Tile 数据源，并支持 feature 样式回调。
- `GlobeControls`
  - 地球控制。
- `Ellipsoid`
  - 经纬高转换和拾取。

## 适合 Tellux 后续优先评估的方向

1. Metadata / feature picking
   - 基于 `EXT_mesh_features` 和 `EXT_structural_metadata`。
   - 可为用户提供点击建筑/构件后读取属性的 API。

2. 更多 imagery layer source
   - WMTS / TMS。
   - GeoJSON / PMTiles 叠加。
   - 更多 layer style 能力和顺序控制。

3. Debug tooling
   - 暴露开发期开关，显示 bounding volume、LOD error、加载状态。

4. 内存控制
   - 引入 `UnloadTilesPlugin` 和 GPU memory stats。
   - 为大城市级 tileset 或移动端提供配置项。

5. 区域加载
   - 基于 `LoadRegionPlugin` 做局部区域加载、剖切式分析或查询区域优化。

6. Quantized mesh terrain
   - 支持 Cesium terrain / quantized-mesh 地形。

## 注意事项

- 插件能力很强，但不都适合直接公开为 Tellux API。公开 API 应继续保持 Cesium 风格命名，并避免引入 `GIS` 前缀。
- `BatchedTilesPlugin`、`TileCompressionPlugin`、`TileFlatteningPlugin` 等会改变渲染或几何数据，应先做独立验证，再包装为稳定选项。
- Metadata 相关能力依赖 tileset 数据本身是否包含对应 glTF 扩展。
- MVT / PMTiles overlay 依赖额外 optional peer dependencies，需要在文档和安装说明里单独说明。
- Google 相关能力涉及服务条款、API key 和 attribution，接入时需要单独设计配置和展示。
