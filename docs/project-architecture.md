# Tellux 项目架构

本文档说明 Tellux 当前源码架构、主要模块职责，以及从 `Viewer` 创建到画面渲染过程中各模块的协作方式。重点补充 `TilesetManager` 的内部结构和工作流程。

## 总体架构

Tellux 采用 `Viewer` 门面加内部 manager 的结构。用户侧主要接触 `Viewer`、`Camera`、`Scene`、`Clock`、`ImageryProvider` 和 `resources/*` 中的资源配置 helper；内部由不同 manager 分别管理瓦片、地形、影像、大气、云和后处理。

```mermaid
flowchart TB
  User["用户代码<br/>new tellux.Viewer"] --> Entry["src/index.ts<br/>包入口"]
  Entry --> Viewer["Viewer<br/>主门面 / 生命周期 / 公开 API"]

  Viewer --> Camera["Camera<br/>Cesium 风格视角 API"]
  Viewer --> Scene["Scene<br/>场景状态 / 开关"]
  Viewer --> Clock["Clock<br/>太阳时间"]
  Viewer --> Controls["GlobeControls<br/>地球交互"]
  Viewer --> Renderer["Three.WebGLRenderer<br/>canvas / render"]

  Viewer --> TilesetManager["TilesetManager<br/>surface / terrain / imagery / overlays"]
  Viewer --> AtmosphereManager["AtmosphereManager<br/>大气 / 云 / 光照 / 贴图"]
  Viewer --> PostProcessingManager["PostProcessingManager<br/>后处理 pass 组合"]

  TilesetManager --> TilesRenderer["3d-tiles-renderer<br/>TilesRenderer"]
  TilesetManager --> RendererPlugins["3d-tiles-renderer/plugins<br/>XYZ / Overlay / Terrain / Auth / Fade"]
  TilesetManager --> LocalPlugins["本地插件<br/>TerrainFetchPlugin<br/>TileCreasedNormalsPlugin"]
  TilesetManager --> Resources["resources/*<br/>CesiumIonResource<br/>TemplateUrlResource<br/>MVTResource"]

  AtmosphereManager --> Takram["@takram<br/>three-atmosphere / three-clouds"]
  PostProcessingManager --> Postprocessing["postprocessing<br/>EffectPass / NormalPass"]
```

## 模块职责

- `src/Viewer.ts`：主门面类。负责创建核心对象、启动默认渲染循环、转发公开 API、处理 resize、事件、拾取和销毁。
- `src/Camera.ts`：相机控制封装。提供 `setView`、`flyTo`、`getState` 等 Cesium 风格视角方法。
- `src/Scene.ts`：场景状态对象。维护云、大气、后处理阶段开关和云参数，状态变化时触发后处理重组。
- `src/Clock.ts`：太阳时间状态。`currentTime` 或 `hourUTC` 变化时通知大气模块更新太阳方向。
- `src/tiles/TilesetManager.ts`：瓦片和图层管理器。负责地球表面、地形、影像、叠加层、插件注册、热切换、每帧 tileset 更新。
- `src/rendering/AtmosphereManager.ts`：大气和云管理器。负责创建大气、云、太阳光、天空光，并加载云纹理和 STBN 资源。
- `src/rendering/PostProcessingManager.ts`：后处理管理器。根据 `Scene` 状态组合 normal pass、大气云 pass、lens flare、SMAA、dithering。
- `src/resources/*`：资源配置 helper。当前包含 Cesium Ion、模板 URL 和 MVT，后续 WMS、GeoJSON、PMTiles 等资源类型应继续放在该目录。

## Viewer 创建流程

```mermaid
sequenceDiagram
  participant U as 用户
  participant V as Viewer
  participant R as WebGLRenderer
  participant S as Scene
  participant A as AtmosphereManager
  participant T as TilesetManager
  participant C as Camera/GlobeControls
  participant P as PostProcessingManager

  U->>V: new Viewer(container, options)
  V->>R: 创建 renderer 并挂载 canvas
  V->>S: 创建 Scene 状态对象
  V->>A: 创建大气、云、太阳光、天空光
  A->>S: 将灯光加入 threeScene
  V->>T: 创建 TilesetManager
  T->>S: 将 surface / terrain group 加入 threeScene
  V->>C: 设置初始相机视角并创建 GlobeControls
  V->>P: 创建后处理管理器
  P->>R: renderer.setEffects(...)
  V->>A: 异步加载大气和云贴图
  V->>V: 注册 resize / click / mousemove
  V->>R: 默认启动 setAnimationLoop(render)
```

`Viewer` 构造函数里先创建 renderer、camera、scene 和 atmosphere，再创建 `TilesetManager`。这是因为 `TilesetManager` 需要 Three.js scene、camera、renderer、Draco loader 和透明 overlay fallback texture。创建完成后，`Viewer` 把相机设置到初始经纬高位置，再创建 `GlobeControls` 并绑定 `TilesetManager.surfaceTileset` 的 ellipsoid。

## 每帧渲染流程

```mermaid
sequenceDiagram
  participant R as WebGLRenderer
  participant V as Viewer
  participant C as GlobeControls
  participant T as TilesetManager
  participant TR as TilesRenderer
  participant S as Three.Scene

  R->>V: render(time)
  V->>V: resize()
  V->>C: controls.update()
  V->>T: tilesets.update()
  T->>TR: active tileset.update()
  TR->>TR: 根据相机和分辨率调度瓦片
  V->>R: renderer.render(S, camera)
```

`TilesetManager.update()` 只更新当前活动 tileset。启用地形时，活动 tileset 是 terrain tileset；未启用地形时，活动 tileset 是 surface tileset。这样可以避免无地形表面和地形同时参与瓦片调度。

## TilesetManager 架构

`TilesetManager` 是 Tellux 数据层和瓦片层的核心。它不直接暴露给用户，而是由 `Viewer` 持有并通过公开 API 转发调用。

```mermaid
flowchart TB
  Viewer["Viewer"] --> TM["TilesetManager"]

  TM --> State["内部状态<br/>currentImageryProvider<br/>currentImageryOverlays<br/>currentTerrain"]
  TM --> Surface["activeSurfaceTileset<br/>无地形地球表面"]
  TM --> Terrain["activeTerrainTileset<br/>quantized-mesh 地形，可为空"]

  TM --> Common["registerCommonTilesetPlugins"]
  Common --> GLTF["GLTFExtensionsPlugin<br/>Draco / glTF 扩展"]
  Common --> Fade["TilesFadePlugin<br/>LOD fade"]
  Common --> UpdateOnChange["UpdateOnChangePlugin<br/>按需更新"]
  Common --> Normals["TileCreasedNormalsPlugin<br/>可选折痕法线"]

  TM --> Imagery["影像注册"]
  Imagery --> XYZ["XYZTilesPlugin / XYZTilesOverlay"]
  Imagery --> Ion["CesiumIonAuthPlugin / CesiumIonOverlay"]
  Imagery --> MVT["MVTOverlay"]
  Imagery --> Overlay["ImageOverlayPlugin"]
  Imagery --> SurfaceGen["GeneratedSurfacePlugin"]

  TM --> TerrainProvider["地形注册"]
  TerrainProvider --> Quantized["QuantizedMeshPlugin"]
  TerrainProvider --> TerrainFetch["TerrainFetchPlugin"]
```

### 内部状态

`TilesetManager` 维护三类状态：

- `activeSurfaceTileset`：基础地球表面 tileset。无地形模式下它是可见且被更新的活动 tileset。
- `activeTerrainTileset`：地形 tileset。启用地形时存在；禁用地形时为 `null`。
- `currentImageryProvider`、`currentImageryOverlays`、`currentTerrain`：记录当前影像、叠加层和地形配置，用于热切换时重建 tileset。

对外只暴露三个 getter：

- `tileset`：当前活动 tileset，优先返回 terrain，否则返回 surface。
- `surfaceTileset`：基础地球表面 tileset，供控制器 ellipsoid 和椭球拾取使用。
- `terrainTileset`：当前地形 tileset，供地形优先拾取使用。

### 初始化逻辑

初始化时，`TilesetManager` 会：

1. 保存 `imageryProvider`、`imageryOverlays`、`terrain` 当前配置。
2. 创建 `activeSurfaceTileset`。
3. 将 `activeSurfaceTileset.group` 加入 Three.js scene。
4. 如果传入 `terrain`，创建 `activeTerrainTileset` 并加入 scene。
5. 调用 `syncSurfaceVisibility()`：有地形时隐藏 surface，无地形时显示 surface。
6. 调用 `syncActiveTilesetReference()`：把当前活动 tileset 写入 `camera.userData.tilesRenderer`，供 `Camera` 根据 ellipsoid 计算经纬高视角。

### Surface tileset 创建

`createSurfaceTileset(resource, overlays)` 用于无地形地球表面：

- 没有 overlays 时，通过 `registerImageryProvider(..., useOverlay=false)` 注册底图。
- 有 overlays 时，通过 `registerSurfaceImageryStack()` 创建可贴叠加层的地球表面。
- 最后统一调用 `registerCommonTilesetPlugins()` 注册通用插件和相机分辨率。

Surface 的典型用途是无地形模式下显示基础椭球地球。它也始终存在，用于控制器 ellipsoid 和椭球 fallback 拾取。

### Terrain tileset 创建

`createTerrainTileset(terrain, resource, overlays)` 用于 Cesium quantized-mesh 地形：

- 先通过 `normalizeTerrainUrl()` 把 terrain URL 归一到根目录。
- 通过 `registerTerrainProvider()` 注册 `QuantizedMeshPlugin` 和 `TerrainFetchPlugin`。
- 通过 `registerTerrainImagery()` 把底图和 MVT overlays 作为 `ImageOverlayPlugin` 叠加到地形表面。
- 最后同样注册通用插件、相机和分辨率。

地形模式下，terrain tileset 成为活动 tileset；surface tileset 保留在 scene 中但隐藏。

### 影像和叠加层策略

`TilesetManager` 当前支持三类 imagery resource：

- `template-url`：无地形 surface 使用 `XYZTilesPlugin` 生成椭球瓦片表面；地形或 overlay 模式使用 `XYZTilesOverlay`。
- `cesium-ion`：无 overlay 时通过 `CesiumIonAuthPlugin` 处理 Ion asset endpoint 和 token；overlay 模式使用 `CesiumIonOverlay`。
- `mvt`：通过 `MVTOverlay` 转成可贴到地球或地形表面的影像 overlay。

当 MVT overlay 暂时没有 texture 时，`createMVTOverlay()` 会返回透明 fallback texture，避免 overlay 缺失导致渲染链路拿到 `null`。

### 热切换工作方式

`setImageryProvider()`：

1. 更新 `currentImageryProvider`。
2. 重建 surface tileset。
3. 如果当前有 terrain，也重建 terrain tileset。
4. 替换旧 tileset，dispose 旧资源。
5. 同步 surface 可见性、活动 tileset 引用和分辨率。

`setImageryOverlays()`：

1. 更新 `currentImageryOverlays`。
2. 重建 surface tileset。
3. 如果当前有 terrain，也重建 terrain tileset。
4. 同步可见性、活动引用和分辨率。

`setTerrain()`：

1. 更新 `currentTerrain`。
2. 传入 terrain 时创建新的 terrain tileset；传入 `null` 时移除 terrain tileset。
3. 同步 surface 可见性和活动 tileset 引用。

热切换采用“创建新 tileset -> 从 scene 移除旧 group -> dispose 旧 tileset -> 加入新 group”的方式。这样实现简单、状态清晰，也能保留 `Viewer`、renderer、camera 和 controls 实例不变。

### 与 Viewer 的配合

`Viewer` 调用 `TilesetManager` 的位置主要有：

- 构造阶段：创建 `TilesetManager`，并把 `scene`、`camera`、`renderer`、`dracoLoader` 等依赖传入。
- `setImageryProvider()`：转发给 `tilesets.setImageryProvider()`，随后同步 controls ellipsoid。
- `setImageryOverlays()`：转发给 `tilesets.setImageryOverlays()`，随后同步 controls ellipsoid。
- `setTerrain()`：转发给 `tilesets.setTerrain()`。
- `render()`：每帧调用 `tilesets.update()`。
- `resize()`：尺寸变化时调用 `tilesets.resize()`。
- `pickCartographic()`：优先拾取 `tilesets.terrainTileset`，失败后拾取 `tilesets.surfaceTileset`，最后 fallback 到 surface ellipsoid。
- `destroy()`：调用 `tilesets.dispose()` 释放 tileset 资源。

### 扩展方向

后续新增数据源时，推荐遵循以下边界：

- 资源配置 helper 放到 `src/resources/`，例如 `WMSResource`、`GeoJsonResource`、`PMTilesResource`。
- TypeScript option 类型继续维护在 `src/types.ts`，通过 discriminated union 扩展 resource 类型。
- 资源到 3d-tiles-renderer plugin / overlay 的转换逻辑放在 `TilesetManager` 或进一步拆出的 imagery factory 中。
- 如果新增能力会改变 terrain/surface 创建流程，优先补充 `TilesetManager` 文档和对应示例。

当 `TilesetManager` 继续增长时，可以进一步拆出：

- `ImageryOverlayFactory`：专门处理 template-url、Cesium Ion、MVT、WMS、WMTS、GeoJSON 等资源到 overlay/plugin 的转换。
- `TerrainTilesetFactory`：专门处理 quantized-mesh、地形 URL、地形插件和地形影像。
- `SurfaceTilesetFactory`：专门处理无地形地球表面和 `GeneratedSurfacePlugin`。

这样可以继续保持 `Viewer` 简洁，同时避免 `TilesetManager` 变成新的大类。
