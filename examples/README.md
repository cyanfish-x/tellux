# Tellux Examples

这些示例通过 Vite 从本仓库的 `src` 直接引入 Tellux，适合开发时验证源码行为。

示例默认使用 Tellux 源码内置的云、STBN 和星空资源，不需要额外设置 `tellux.baseUrl`。
如果需要验证 CDN、内网静态目录或非打包环境的资源覆盖路径，可以把
`local_weather.png`、`turbulence.png`、`shape.bin`、`shape_detail.bin`、`stbn.bin` 和 `stars.bin`
放到 `examples/public/tellux/`，再在示例入口中临时设置 `tellux.baseUrl = '/tellux/'`。

本地 `pnpm dev` 默认使用 **ArcGIS 卫星影像 + Cesium Ion 地形**，不请求天地图，避免消耗额度。生产构建仍使用天地图。

GIS 数据源集中在 `examples/map-sources.config.ts`：改 `localMapSourceProfile` 后刷新即可切换全部示例。

```ts
export const localMapSourceProfile = "local"     // ArcGIS + Cesium Ion
// export const localMapSourceProfile = "tianditu" // 天地图影像 + swdx
// export const localMapSourceProfile = "cesiumUrl" // ArcGIS + VITE_CESIUM_TERRAIN_URL
```

本地走天地图时，Vite 会把瓦片 / 地形 / 行政区划请求转到代理，并把 Referer 改写成已备案域名（默认 `https://tellux.cyanfish.site/`）。白名单域名不同时覆盖：

```txt
TELLUX_TIANDITU_DEV_REFERER=https://tellux.cyanfish.site/
```

密钥仍放在项目根 `.env`（模板见 `.env.example`）：

```txt
VITE_CESIUM_ION_TOKEN=your_token
VITE_TIANDITU_TOKEN=your_tianditu_token
```

`data-sources.html` 示例额外演示天地图 WMTS、卫星 WMS 与 GeoJSON 图层；GeoJSON 通过单次 `v2/administrative` 请求加载成都市边界（`156510100`），同样需要 `VITE_TIANDITU_TOKEN`。

## 运行

```bash
pnpm examples
```

打开：

- `http://127.0.0.1:5173/`
- `http://127.0.0.1:5173/basic.html`
- `http://127.0.0.1:5173/fly-to.html`
- `http://127.0.0.1:5173/data-sources.html`
- `http://127.0.0.1:5173/3d-tiles.html`
- `http://127.0.0.1:5173/3d-tiles-picking.html`
- `http://127.0.0.1:5173/gaussian-splat-3d-tiles.html`
- `http://127.0.0.1:5173/point-cloud-3d-tiles.html`
- `http://127.0.0.1:5173/terrain.html`
- `http://127.0.0.1:5173/atmosphere.html`
- `http://127.0.0.1:5173/threejs-interop.html`

## 3D Tiles 示例

`3d-tiles.html` 演示 `viewer.tilesets.add(...)`。3D Tiles 会作为独立场景数据加入 Viewer，
不参与影像 overlay 管线。示例支持直接加载 `tileset.json` URL，也支持加载 Cesium Ion 3D Tiles 资源。

默认加载 `data.cyanfish.site` 的香港 3D Tiles：开发服务器下经 Vite proxy（`/3dtiles -> https://data.cyanfish.site`）
避免跨域，打包构建后直连 `https://data.cyanfish.site/3dtiles/hk/tileset.json`。可以在项目根目录 `.env` 中覆盖：

```txt
VITE_3D_TILESET_URL=https://example.com/tileset.json
VITE_CESIUM_ION_3D_TILESET_ASSET_ID=123456
VITE_CESIUM_ION_TOKEN=your_token
```

## 点云 3D Tiles 示例

`point-cloud-3d-tiles.html` 演示从 Cesium Ion 加载 pnts 点云，默认 asset 是 Melbourne Point Cloud（`43978`）。需要 `VITE_CESIUM_ION_TOKEN`，也可以换成其他点云 asset id：

```txt
VITE_CESIUM_ION_POINT_CLOUD_ASSET_ID=43978
VITE_CESIUM_ION_TOKEN=your_token
```

## 高斯泼溅 3D Tiles 示例

`gaussian-splat-3d-tiles.html` 在示例侧直接集成
`3d-tiles-rendererjs-3dgs-plugin` 和 `@sparkjsdev/spark`，通过底层
`TilesRenderer` 加载带 `KHR_gaussian_splatting` / SPZ 压缩扩展的 3DGS
tileset，并挂到 Tellux 的 Three.js 场景中。

面板提供四个预设，可切换后自动加载，也可修改连接配置再点「加载 / 重试」：

| 预设 | 加载方式 | 说明 |
| --- | --- | --- |
| SvirnasAlyt（默认） | 高斯 3D Tiles | 约 100 MiB，按需加载 |
| Elevator | 高斯 3D Tiles | 约 269 MiB，按需加载 |
| Cesium ion / Redmond | ion 鉴权 + 高斯 3D Tiles | 默认 Asset ID 4547222，Token 留空使用 CesiumJS 公开评估 token |
| Spark / Butterfly | 单文件 SPZ | 约 4 MB；展示锚点为 142.8343°E、38.5822°S、椭球高度 120 米，缩放至约 12 米，无真实地理参考 |

GitHub 样例固定到上游提交 e5abce2422ff72eae8576c814babbec20ed8fe34。来源：[插件样例](https://github.com/WilliamLiu-1997/3D-Tiles-RendererJS-3DGS-Plugin)、[Cesium 官方教程](https://cesium.com/learn/cesiumjs-learn/3d-guassian-splat-tilesets-lods/)、[Spark](https://github.com/sparkjsdev/spark)。

官方资产 4547222 的 Token 留空时使用 CesiumJS 内置公开评估 token，无需用户自己的 token。这与官方教程一致，仍是带 token 的请求，并非匿名访问。2026-09-06 已验证 endpoint、tileset 和首层 GLB 均返回 200，包含当前插件支持的高斯/SPZ 扩展。显式输入 token 优先；切换其他 Asset ID 时，留空使用 VITE_CESIUM_ION_TOKEN。公开 token 仅供评估，生产应用使用自己的凭据。

「细节误差」越低，瓦片细节越高、加载量越大；单文件模式不显示该控件。可分别切换高斯和地球显示，并用「定位资源」返回目标。3D Tiles 在目录加载后根据包围球定位。Spark 模式支持修改为其他可解码的单文件 URL，仍使用上述展示锚点与尺度归一化。

案例使用 WebGL。独立页与 Sandcastle 共用案例源码，Spark / 高斯插件仅在需要时加载。切源会取消单文件下载、隔离旧请求结果并释放场景资源。

「保留数据颜色」默认开启：高斯 sRGB 颜色通过与点云共用的 AgX 逆变换 LUT 补偿最终曝光与色调映射，不改变底图曝光。关闭可对照旧输出。该补偿发生在透明混合前，半透明边缘与其他物体混合后的结果不保证与 Cesium 逐像素一致；实际外观仍需同视角核验。

Spark 2.1.0 的 ESM 上传路径通过 `pnpm-workspace.yaml` 应用 `patches/@sparkjsdev__spark@2.1.0.patch`：三处 `UNPACK_FLIP_Y_WEBGL` 写入改走 Three.js 的状态缓存接口，避免高斯排序更新后 Canvas 底图纹理上下翻转、瓦片错缝。ArcGIS 的 URL 顺序仍为 `{z}/{y}/{x}`。升级 Spark 时运行 `sparkPixelStore.test.ts` 核验上游是否已修复；应用补丁后若开发页面仍使用旧预构建，执行 `pnpm exec vite optimize --force --config examples/vite.config.ts` 并硬刷新，必要时重启已有开发服务。

保留自定义 3D Tiles 入口，在项目根目录 .env 设置后默认选中它：

```txt
VITE_GAUSSIAN_SPLAT_3D_TILESET_URL=https://example.com/3dgs/tileset.json
VITE_CESIUM_ION_TOKEN=your_token
```

## 天地图地形示例

`terrain.html` 演示 `ViewerOptions.terrain` 和 `viewer.terrain.set(...)`，可在天地图
swdx `elv_c` 与 Cesium Ion terrain 之间切换。本地默认跟 `map-sources.config.ts`
一样走 Cesium Ion；把 `localMapSourceProfile` 改成 `'tianditu'` 后，默认地形改为
天地图 swdx（经 Vite 代理改写 Referer）。

请在项目根目录 `.env` 中配置：

```txt
VITE_TIANDITU_TOKEN=your_tianditu_token
VITE_CESIUM_ION_TOKEN=your_token
```

## Cesium 地形示例（Ion / URL）

Tellux 也支持 Cesium quantized-mesh URL 与 Cesium Ion 地形。本地默认使用 Ion；
若要用 URL 地形，把 `localMapSourceProfile` 改成 `'cesiumUrl'` 并配置：

```txt
VITE_CESIUM_TERRAIN_URL=https://example.com/terrain/
```

## 体积云与大气示例

`atmosphere.html` 演示默认体积云、大气天空和后处理组合。左上角面板可以切换大气与云层，
并调整日期、云覆盖率和渲染曝光。

## Three.js 原生互操作示例

`threejs-interop.html` 用 `Viewer.create` 走 WebGPU（`postProcess.taa` 开启，描边关闭），
通过 `viewer.models.add({ type: 'gltf', ... })` 加载 Three.js 官方 keyframes glTF / GLB
动画模型，放置到经度 `114`、纬度 `30` 的地表位置，并自动播放第 `0` 个动画通道。需要浏览器支持 WebGPU。
