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

`3d-tiles.html` 演示 `viewer.load3DTileset(...)`。3D Tiles 会作为独立场景数据加入 Viewer，
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

示例默认使用插件仓库中的样例 tileset。可以在项目根目录 `.env` 中替换默认地址：

```txt
VITE_GAUSSIAN_SPLAT_3D_TILESET_URL=https://example.com/3dgs/tileset.json
```

## 天地图地形示例

`terrain.html` 演示 `ViewerOptions.terrain` 和 `viewer.setTerrain(...)`，可在天地图
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

`threejs-interop.html` 演示通过 `viewer.addModel({ type: 'gltf', ... })` 加载 Three.js
官方 keyframes glTF / GLB 动画模型，放置到经度 `114`、纬度 `30` 的地表位置，并自动播放第
`0` 个动画通道。
