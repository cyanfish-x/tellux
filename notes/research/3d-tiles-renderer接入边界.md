# 3d-tiles-renderer 接入边界

> 2026-09-06 静态核对：`package.json`、瓦片工厂、采样 adapter 与拾取实现。范围是当前 Tellux 如何使用依赖，不是上游完整能力表，也不代表运行验收。

## 先区分三件事

`Plugin` 介入 tileset 的请求、解析、模型处理、遍历或释放；`Overlay` 提供某个地理范围的纹理；`ImageOverlayPlugin` 将 overlay 与瓦片几何、材质和 UV 连接。`GeneratedSurfacePlugin` 生成可贴图的椭球表面，本身不是影像源。

公开 `viewer.overlays` 当前作用于 surface / terrain。上游 overlay 可以扩展到场景 3D Tiles，不代表 Tellux 的公共集合已经支持这种用途。Water Area 使用案例自己的 mask adapter，不能把隐藏 mask 当普通影像显示。纯配置入口与类型约定见 [数据源指南](../../docs/guide/data-sources.md)，不在此维护第二份 API 清单。

## 当前接入与所有者

| 任务 | 当前源码入口 | 必须保留的边界 |
| --- | --- | --- |
| 创建、更新和释放 tileset | [TilesetManager](../../src/tiles/TilesetManager.ts) | 活动地球表面与可见场景 tileset 都需更新；公共集合不等于内部 manager |
| 裸球与地形 | [SurfaceTilesetFactory](../../src/tiles/SurfaceTilesetFactory.ts)、[TerrainTilesetFactory](../../src/tiles/TerrainTilesetFactory.ts) | 已接入 quantized-mesh；不能再把地形支持写成未来计划 |
| XYZ、Ion、WMS、WMTS、MVT、GeoJSON | [ImageryOverlayFactory](../../src/tiles/ImageryOverlayFactory.ts) | GeoJSON 与 MVT 栅格化为纹理，仍有 canvas 成本；空 MVT 纹理有透明 fallback |
| Ion 认证 | `TilesetManager`、`TerrainTilesetFactory` | `CesiumIonAuthPlugin` 从 `3d-tiles-renderer/core/plugins` 引入；Ion imagery overlay 与 3D Tiles asset 加载分开 |
| glTF、Draco、feature metadata | `TilesetManager`、`src/sampling/TilesetFeaturePicker.ts` | GLTF 扩展已注册，feature 拾取已存在；能否读取属性仍由数据里的 batch / feature / structural metadata 决定 |
| 详细高度采样 | [采样实现链路](../architecture/sampleHeightMostDetailed实现链路.md) | 已使用 LoadRegion / RayRegion；`mask`、采样相机和缓存归属随路径不同 |
| 折痕法线 | `src/TileCreasedNormalsPlugin.ts` | Tellux 本地插件，按场景 3D Tiles 图层启用；不是全局地表开关 |

`GLTFExtensionsPlugin` 使用 `autoDispose: false`，Draco loader 归 Viewer。默认 `/draco/` 使用完整 decoder，不能用只支持 glTF mesh 的精简版本替换点云所需 decoder。具体压缩扩展是否可用还要核对 loader 是否装配，不能从上游“支持 KTX2 / Meshopt”推断 Tellux 已全部配置。

## 后端与升级风险

- `TilesFadePlugin` 虽已注册，其 GLSL `onBeforeCompile` 路径不能证明 WebGPU 有淡入淡出。[WebGPU shader 边界](../engineering/WebGPU下onBeforeCompile着色器机制失效坑点.md)解释原因。
- WebGPU terrain/surface 使用 [WebGPUTerrainOverlayPlugin](../../src/tiles/WebGPUTerrainOverlayPlugin.ts) 的直接纹理适配；保留 [ImageBitmap 上传方向](../engineering/WebGPU影像ImageBitmap二次翻转坑点.md) 的后端条件，不能对所有 Canvas 纹理一律翻转。
- 采样对上游内部字段的读取集中在 [TilesetSamplingAdapter](../../src/tiles/TilesetSamplingAdapter.ts)。请求队列空不等于射线路径达到最高细节；升级应核对 readiness、active tile raycast 与资源复用。
- Water Area 使用 `_wrapMaterials`、`meshParams`、`layer_uv_0` 等内部协议，见 [固定提交调研](<three-geospatial WebGPU Water Area案例调研.md>)。semver 兼容不担保这些内部字段不变。
- 卸载、压缩、合批和压平是不同变更：压缩会影响 attribute 精度，合批会影响材质身份和 feature picking，压平会改变几何与采样。旧备忘中的“建议优先接入”均不是产品排期；新增前用具体用例确认收益和兼容性。

TMS、PMTiles、通用 debug view 等上游能力不等于已支持的公共 source。当前支持范围由 `src/types/imagery.ts` 与工厂共同决定；添加能力要同时处理状态、取消、纹理释放、后端和公开文档。

## 证据与复核

依赖声明为 `^0.4.27`，精确安装版本读锁文件或 `node_modules/3d-tiles-renderer/package.json`。不要把声明范围写成安装版本，也不要把旧文档里的 `0.4.28` 当作永久基线。

升级时从实际使用的插件及 overlay 源码开始，而不是重新抄写上游参数表；本次合并删除了两份重复能力清单，原记录定位见 [审查记录](../archive/2026-09-06-知识重建记录.md)。本次没有重跑影像、地形或 feature picking 的浏览器验收。
