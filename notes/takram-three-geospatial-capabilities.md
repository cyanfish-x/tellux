# @takram/three-geospatial 能力备忘

本文档记录 Tellux 当前依赖的 `@takram/three-geospatial` 能力范围，便于后续评估地理数学、椭球、瓦片坐标、纹理加载和基础工具 API 的设计。

当前 Tellux 依赖版本：

- `@takram/three-geospatial`: `0.9.1`
- 上游定位：Three.js / R3F 中渲染 GIS 数据的基础函数和类型集合。
- Tellux 中主要入口：
  - `STBNLoader`
  - `DEFAULT_STBN_URL`

## 总体定位

`@takram/three-geospatial` 是 Takram 地理渲染包组的基础包。它提供椭球和大地坐标数学、瓦片坐标、矩形范围、基础 geometry、数据纹理 loader、typed array 解析、shader 工具、能力检测和 R3F 辅助组件。

对 Tellux 来说，它目前主要作为大气和云的间接基础依赖，并直接用于加载 STBN 3D 纹理。未来如果 Tellux 要统一地理坐标类型、瓦片范围、相机视角或自定义地球对象，可以优先评估这个包的能力。

## 包入口和边界

可用子入口：

- `@takram/three-geospatial`
  - 普通 Three.js 工具入口。
- `@takram/three-geospatial/r3f`
  - React Three Fiber 组件入口，Tellux 当前不使用。
- `@takram/three-geospatial/shaders`
  - shader 工具入口。
- `@takram/three-geospatial/webgpu`
  - WebGPU / TSL 入口，Tellux 当前不使用。

Tellux 当前已经依赖 `3d-tiles-renderer` 的 `Ellipsoid` 和 `GlobeControls`。因此如果引入 Takram 的地理数学 API，需要注意不要让公开 API 同时暴露两套语义相近但类型不同的坐标系统。

## 椭球能力

可用对象：

- `Ellipsoid`
- `Ellipsoid.WGS84`
- `EllipsoidGeometry`

`Ellipsoid` 主要能力：

- 保存椭球三轴半径。
- 计算最小/最大半径、扁率、离心率。
- 计算倒数半径和倒数半径平方。
- 将位置投影到椭球表面。
- 计算地表法线。
- 计算 East-North-Up frame。
- 计算 North-Up-East frame。
- 计算射线和椭球交点。
- 计算局部 osculating sphere center。
- 计算地平线相关法线。

`EllipsoidGeometry` 主要能力：

- 生成椭球几何。
- 可指定经纬分段数。
- 适合调试、背景球体或独立地球 mesh。

Tellux 当前状态：

- 当前公开相机和控制器主要依赖 `3d-tiles-renderer` 的椭球能力。
- `@takram/three-atmosphere` 和 `@takram/three-clouds` 内部默认使用 Takram 的 WGS84 椭球。
- 如后续需要统一大气、云、控制器和拾取的椭球，应评估二者的类型转换或统一封装。

## 大地坐标能力

可用对象：

- `Geodetic`
- `PointOfView`

`Geodetic` 主要能力：

- 表示 `longitude`、`latitude`、`height`。
- 支持 `set`、`clone`、`copy`、`equals`。
- 支持从 ECEF 位置计算大地坐标。
- 支持转换为 ECEF 位置。
- 可指定使用的 `Ellipsoid`。

`PointOfView` 主要能力：

- 表示面向地球目标点的视角。
- 支持从 camera 推导视角。
- 支持把 target、eye、quaternion、up 分解出来。
- 可用于类似 Cesium camera view 的表达。

Tellux 后续可扩展方向：

- 如果要新增内部统一的坐标对象，可参考 `Geodetic`。
- 如果要增强 `Camera.flyTo`、`Camera.setView`、`Camera.lookAt` 等接口，可参考 `PointOfView` 的拆解方式。
- 公开 API 层仍建议使用普通对象或 tuple，避免把第三方类强耦合给用户。

## 矩形和瓦片坐标

可用对象：

- `Rectangle`
- `TileCoordinate`
- `TilingScheme`

`Rectangle` 主要能力：

- 表示经纬范围。
- 提供最大范围常量。
- 支持 clone / copy / equals。
- 支持按归一化位置采样大地坐标。

`TileCoordinate` 主要能力：

- 表示 `x`、`y`、`z` 瓦片坐标。
- 支持 clone / copy / equals。
- 支持获取父瓦片。
- 支持遍历子瓦片。

`TilingScheme` 主要能力：

- 定义初始横向/纵向 tile 数和覆盖矩形。
- 根据层级计算瓦片网格尺寸。
- 根据大地坐标计算瓦片坐标。
- 根据瓦片坐标计算覆盖矩形。

Tellux 后续可扩展方向：

- 影像图层、瓦片 overlay、调试 tile bounds 时可参考这些类型。
- 如果 Tellux 自己要支持非 `3d-tiles-renderer` 的地理瓦片资源，可以用这些对象做内部工具。
- 对外 API 命名可继续对齐 Cesium / Mapbox，而内部可按需要复用这些工具。

## STBN 纹理加载

可用对象和常量：

- `STBNLoader`
- `DEFAULT_STBN_URL`
- `STBN_TEXTURE_WIDTH`
- `STBN_TEXTURE_HEIGHT`
- `STBN_TEXTURE_DEPTH`

主要能力：

- 加载 spatiotemporal blue noise 二进制资源。
- 返回 `THREE.Data3DTexture`。
- 供大气和云后处理减少采样噪声。

Tellux 当前用法：

- `AtmosphereManager.loadSTBNTexture(...)` 使用 `new STBNLoader().load(...)`。
- 加载完成后同时赋给：
  - `cloudsEffect.stbnTexture`
  - `aerialPerspectiveEffect.stbnTexture`
- URL 通过 `getTelluxAssetUrl(DEFAULT_STBN_URL)` 包装，支持用户替换内置资产根目录。
- 加载得到的纹理纳入 `loadedTextures`，在销毁时释放。

## 数据纹理和 typed array 加载

可用 loader：

- `ArrayBufferLoader`
- `TypedArrayLoader`
- `DataTextureLoader`
- `EXRTextureLoader`
- `EXR3DTextureLoader`

相关 typed array 工具：

- `typedArray`
- `typedArrayParsers`

主要能力：

- 从二进制资源创建 typed array。
- 从 typed array 创建 `DataTexture` 或 `Data3DTexture`。
- 加载 EXR / EXR 3D 纹理。

Tellux 当前状态：

- 云的 shape / shape detail 纹理当前由 Tellux 手动 fetch 并创建 `Data3DTexture`。
- 后续如要统一二进制纹理加载逻辑，可评估改用这些 loader。

## 基础 geometry 和序列化工具

可用对象和函数：

- `QuadGeometry`
- `EllipsoidGeometry`
- `toBufferGeometryLike`
- `fromBufferGeometryLike`

主要能力：

- 创建全屏 quad 或椭球几何。
- 在 `BufferGeometry` 和可序列化对象之间转换。

Tellux 后续可扩展方向：

- 自定义大气调试面片、屏幕 pass 或地球调试 mesh。
- Worker 中处理 geometry 后回传主线程。

## shader 和能力检测工具

可用能力：

- `capabilities`
- `resolveIncludes`
- `unrollLoops`
- `defineShorthand`
- `decorators`
- `math`
- `shaders` 子入口

主要用途：

- 检测渲染环境能力。
- 处理 shader include 和循环展开。
- 为对象定义 uniform / property shorthand。
- 提供地理相关 shader 数学函数。

Tellux 当前状态：

- 当前没有直接使用这些工具。
- 上游大气、云和 effects 包内部会使用部分基础能力。

## 与 3d-tiles-renderer 的关系

Tellux 当前同时依赖：

- `3d-tiles-renderer`
  - 3D Tiles 调度、GlobeControls、Cesium Ion 插件、影像 overlay、地形和表面生成。
- `@takram/three-geospatial`
  - Takram 大气/云/effects 的基础数学、纹理和 shader 工具。

注意点：

- 二者都提供椭球和地理数学能力。
- Tellux 当前公开地球控制和拾取更接近 `3d-tiles-renderer` 能力。
- Takram 的 `Ellipsoid` 主要服务于大气和云。
- 未来如要统一坐标类型，应先确定公开 API 使用普通 `longitude` / `latitude` / `height`，内部再做适配。

## 后续可扩展方向

- 用 `Geodetic` / `PointOfView` 辅助相机 API 内部实现。
- 用 `Rectangle` / `TilingScheme` 辅助 imagery layer 和 tile debug。
- 用 `DataTextureLoader` / `TypedArrayLoader` 统一云和 STBN 资产加载。
- 用 `EllipsoidGeometry` 提供 debug ellipsoid 或 fallback globe mesh。
- 增加内部适配层，统一 `3d-tiles-renderer` 和 Takram 的椭球/坐标对象。

