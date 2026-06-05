# Tellux Examples

这些示例通过 Vite 从本仓库的 `src` 直接引入 Tellux，适合开发时验证源码行为。

`examples/public/tellux/` 存放示例使用的 Tellux 静态资源。Vite 会把 `examples/public`
作为开发服务器的静态资源根目录，示例会通过 `tellux.baseUrl = '/tellux/'`
加载本地的云和 STBN 纹理。

示例默认使用 `TemplateUrlResource` 加载 ArcGIS World Imagery：

```txt
https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
```

## 运行

```bash
pnpm examples
```

打开：

- `http://127.0.0.1:5173/`
- `http://127.0.0.1:5173/basic.html`
- `http://127.0.0.1:5173/fly-to.html`
- `http://127.0.0.1:5173/click.html`
- `http://127.0.0.1:5173/data-sources.html`
- `http://127.0.0.1:5173/3d-tiles.html`
- `http://127.0.0.1:5173/terrain.html`
- `http://127.0.0.1:5173/atmosphere.html`

## 3D Tiles 示例

`3d-tiles.html` 演示 `viewer.load3DTileset(...)`。3D Tiles 会作为独立场景数据加入 Viewer，
不参与影像 overlay 管线。示例支持直接加载 `tileset.json` URL，也支持加载 Cesium Ion 3D Tiles 资源。

可以在项目根目录 `.env` 中配置默认值：

```txt
VITE_3D_TILESET_URL=https://example.com/tileset.json
VITE_CESIUM_ION_3D_TILESET_ASSET_ID=123456
VITE_CESIUM_ION_TOKEN=your_token
```

## Cesium 地形示例

`terrain.html` 演示 `ViewerOptions.terrain` 和 `viewer.setTerrain(...)`。它支持输入 Cesium
quantized-mesh 地形根目录或 `layer.json` 地址，并通过左上角面板开关热切换地形。

可以在项目根目录 `.env` 中配置默认地形地址：

```txt
VITE_CESIUM_TERRAIN_URL=https://example.com/terrain/
```

## 体积云与大气示例

`atmosphere.html` 演示默认体积云、大气天空和后处理组合。左上角面板可以切换大气与云层，
并调整 UTC 时间、云覆盖率和渲染曝光。
