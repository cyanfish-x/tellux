# 能力边界与已知限制

本章集中说明 Tellux 当前版本的能力边界和已知限制，便于在选型和排查时快速判断"能不能做、为什么没生效"。其中部分限制源自底层依赖（Three.js、3d-tiles-renderer、Takram 生态），部分是 Tellux 封装层的现状。

## 渲染后端

### WebGL（默认）

完整支持 Tellux 的所有视觉能力：大气天空、空气透视、体积云、星空、后处理（SMAA、镜头光晕、抖动）、瓦片 LOD 淡入淡出。

### WebGPU（实验性）

WebGPU 是实验能力，以下能力在 WebGPU 模式下**不渲染或不支持**：

| 能力 | WebGPU 模式下的状态 |
| --- | --- |
| 体积云 | 不渲染（应设 `clouds.show: false`） |
| 星空 | 不渲染 |
| 后处理（SMAA / 镜头光晕 / 抖动） | 不渲染，调整开关无视觉效果 |
| 瓦片 LOD 淡入淡出 | 不可用，瓦片为直接切换（pop） |
| 大气散射调试参数 | 部分参数不映射，`light-source` 光照模式支持更完整 |

- WebGPU 模式**不会在不支持的环境上自动回退 WebGL**：不支持时 `renderer.init()` 会 reject，`Viewer.create(...)` 抛错。应用层需自行检测，或设置 `renderer.forceWebGL: true` 走 WebGL2 fallback backend。
- WebGPU renderer 需异步初始化，推荐用 `Viewer.create(...)`；用 `new Viewer(...)` 时先 `await viewer.ready`。

## 数据与图层

### 地形

- 仅支持 **Cesium quantized-mesh** 格式（自托管 URL 或 Cesium Ion）。不支持 GeoTIFF、高度图等其它地形格式。
- 地形裙边、法线生成等渲染参数通过 `terrain.tileLoading` / `TerrainRenderOptions` 配置。

### 影像图层

- 栅格影像支持 XYZ、WMS、Cesium Ion 三种栅格源；矢量图层支持 GeoJSON 和 MVT。
- GeoJSON / MVT 图层是**把矢量内容栅格化成纹理**贴到地表，不是矢量几何直接渲染。样式以像素为单位，受 `resolution` 影响；极度放大时会出现纹理模糊。
- 图层透明度 `opacity` 作用于整层；`color` 乘色作用于整层色调。

### 3D Tiles

- 3D Tiles 作为**独立场景数据**加载，不参与影像 overlay 管线（不能像影像那样贴到地形表面）。
- 支持 `tileset.json`（URL）和 Cesium Ion 两种加载方式；支持 glTF / GLB / B3DM 等常见瓦片，依赖 Draco 时需配置 `dracoDecoderPath`。
- 摄影测量瓦片的法线可能缺失，影响后处理光照，可用 `creasedNormals: true` 重新生成折痕法线。

## 交互与采样

### 拾取

- 拾取类方法（`pickCartographic`、`pick3DTilesFeature`、事件的 `cartographic` / `tilesetFeature`）**只使用当前已加载到场景中的内容**，不会为视角外的区域额外请求瓦片。
- `pickCartographic` 在未命中 3D Tiles 时回退到 WGS84 椭球表面；`pick3DTilesFeature` 不回退椭球，只查已加载 3D Tiles。

### 高度采样

- `sampleHeight` 是同步、即时的，**不请求视角外瓦片**，适合当前视图内的每帧贴地查询；视角外或未加载区域返回 `undefined`。
- `sampleHeightMostDetailed` 会主动加载所需层级瓦片：
  - 3D Tiles / 混合模式下临时添加的局部加载区域，采样完成后**保留在主场景缓存**中（升温），后续靠近时可复用，但也会占用缓存。
  - 当 `useDefaultRenderLoop` 为 `false` 时，**必须由调用方继续调用 `render()`** 推进采样，否则任务一直等待，最终超时返回 `undefined`。

## 坐标系

- 对外 API 统一使用**度和米**：纬度 / 经度 / heading / pitch / roll 为度，高度为米（WGS84 椭球海拔）。
- 经纬高元组输入顺序是 `[经度, 纬度, 高度]`（遵循 GeoJSON），与对象形式 `{ longitude, latitude, height }` 字段顺序相反，混用时易出错。
- heading / pitch / roll 相对**当地东北天（ENU）坐标系**。

## 资源与生命周期

- Tellux 不托管 Three.js 场景以外的 DOM；销毁 `Viewer` 释放 WebGL 资源、控制器、纹理和事件监听器，但容器元素本身由调用方管理。
- 页面卸载（`beforeunload`）时浏览器的同步资源释放不可靠，销毁应优先放在组件卸载 / 路由切换时机，`beforeunload` 仅作兜底。

## 不在 Tellux 能力范围内

以下能力 Tellux 目前**不提供**，需要应用层自行实现或评估后续是否纳入：

- 地形开挖、地形编辑、等高线生成等地形分析能力。
- 空间分析（缓冲区、叠加分析、可视域）。
- 时间轴动画、轨迹回放等业务级时间管理（`clock` 只驱动太阳方向）。
- 地理要素的属性表 UI、图层树 UI（`LayerManager` 只提供数据和状态，不提供界面）。
