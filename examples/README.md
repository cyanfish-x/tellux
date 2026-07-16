# Tellux Examples

这些示例通过 Vite 从本仓库的 `src` 直接引入 Tellux，适合开发时验证源码行为。

示例默认使用 Tellux 源码内置的云、STBN 和星空资源，不需要额外设置 `tellux.baseUrl`。
如果需要验证 CDN、内网静态目录或非打包环境的资源覆盖路径，可以把
`local_weather.png`、`turbulence.png`、`shape.bin`、`shape_detail.bin`、`stbn.bin` 和 `stars.bin`
放到 `examples/public/tellux/`，再在示例入口中临时设置 `tellux.baseUrl = '/tellux/'`。

所有示例默认使用天地图卫星影像 XYZ 瓦片（`img_w`）作为底图，通过 `examples/shared.ts` 统一配置。请在项目根目录 `.env` 中配置天地图 `tk` 密钥：

```txt
VITE_TIANDITU_TOKEN=your_tianditu_token
```

所有普通示例会在检测到 `VITE_CESIUM_ION_TOKEN` 时默认加载 Cesium Ion 地形。默认地形
asset id 是 `1`（Cesium World Terrain），可以通过 `.env` 覆盖：

```txt
VITE_CESIUM_ION_TERRAIN_ASSET_ID=1
VITE_CESIUM_ION_TOKEN=your_token
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

`terrain.html` 演示 `ViewerOptions.terrain` 和 `viewer.setTerrain(...)`。默认使用天地图 swdx
`elv_c` 高程地形，也支持切换到 Cesium Ion terrain asset。

请在项目根目录 `.env` 中配置天地图 `tk` 密钥：

```txt
VITE_TIANDITU_TOKEN=your_tianditu_token
```

如需对比 Cesium Ion 地形，可额外配置：

```txt
VITE_CESIUM_ION_TERRAIN_ASSET_ID=1
VITE_CESIUM_ION_TOKEN=your_token
```

## Cesium 地形示例（Ion / URL）

Tellux 也支持 Cesium quantized-mesh URL 与 Cesium Ion 地形。未配置天地图 token 时，
`terrain.html` 会回退到 Cesium Ion 默认配置；也可以手动切换到 URL quantized-mesh：

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
