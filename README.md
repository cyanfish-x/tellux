# Tellux

中文 | [English](./README.en.md)

[![npm version](https://img.shields.io/npm/v/tellux?style=flat-square)](https://www.npmjs.com/package/tellux) [![license](https://img.shields.io/npm/l/tellux?style=flat-square)](./LICENSE)

Tellux 是一个基于 Three.js 的开源 ESM TypeScript GIS viewer，用于在浏览器中构建数字地球、地形、影像和 3D Tiles 应用。

它以 Three.js 的渲染与互操作能力为基础，提供地球相机、Cesium quantized-mesh 地形、多源图层、3D Tiles、大气、体积云和后处理的一致 API，适合从轻量可视化到复杂三维地理场景。

![](https://picture.cyanfish.site/202607201519080.png)

---

[🌐 示例](https://tellux.cyanfish.site) | [📚 文档](https://tellux.cyanfish.site/docs/) | [🧪 Sandcastle](https://tellux.cyanfish.site/sandcastle.html) | [💻 GitHub](https://github.com/cyanfish-x/tellux)

---

## 🚀 开始使用

### npm

Tellux 是 ESM 包。使用 Vite、Webpack、Rollup 等模块打包器时，安装 Tellux 及其必需的 peer dependencies：

```bash
pnpm add tellux three 3d-tiles-renderer @takram/three-geospatial @takram/three-geospatial-effects @takram/three-atmosphere @takram/three-clouds postprocessing
```

使用 MVT 矢量瓦片时，再安装可选依赖：

```bash
pnpm add @mapbox/vector-tile pbf
```

创建一个具有非零尺寸的容器，然后初始化 Viewer：

```html
<div id="viewer"></div>

<style>
  #viewer {
    width: 100vw;
    height: 100vh;
  }
</style>
```

```ts
import tellux from 'tellux'

const viewer = new tellux.Viewer('viewer', {
  terrain: {
    url: 'https://example.com/terrain/'
  },
  layers: [
    {
      source: {
        type: 'xyz',
        url: 'https://example.com/imagery/{z}/{y}/{x}.png'
      }
    }
  ],
  camera: {
    longitude: 121.4737,
    latitude: 31.2304,
    height: 1200,
    pitch: -25
  }
})
```

### 📚 下一步

- 查看[快速开始](https://tellux.cyanfish.site/docs/guide/getting-started)，了解 Draco 解码器、资源路径和 Viewer 生命周期。
- 阅读[指南](https://tellux.cyanfish.site/docs/guide/viewer)，配置相机、交互、地形、影像、3D Tiles、模型、大气和后处理。
- 在 [Sandcastle](https://tellux.cyanfish.site/sandcastle.html) 中浏览并编辑可运行示例。
- 查看[公开 API](https://tellux.cyanfish.site/docs/api/viewer) 与[类型参考](https://tellux.cyanfish.site/docs/api/types)。
- 希望参与开发？请阅读[贡献指南](./CONTRIBUTING.md)，然后提交 Issue 或 Pull Request；提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/)。

## ⚖️ License

[MIT](./LICENSE)。Tellux 可用于商业和非商业项目。

## 🌍 地理内容从哪里来？

Tellux 是运行时和渲染库，不绑定或托管任何基础地理内容。你可以自由组合以下数据源：

- 自托管或公开服务提供的 Cesium quantized-mesh 地形、XYZ、WMS、WMTS、GeoJSON、MVT 和 3D Tiles。
- 通过 Cesium Ion token 访问的 terrain、imagery 和 3D Tiles 资源。
- 按经纬高放置的应用自有 glTF / GLB 模型和 Three.js 对象。

Cesium Ion 是可选的数据服务；Tellux 的地形、影像和 3D Tiles API 同时支持自托管 URL 与 Cesium Ion 资源。数据的授权、可用性与访问控制由使用方和数据提供方负责。

## ✨ 特性

- 在 WGS84 地球上使用经纬高、heading、pitch、roll 控制相机，并支持飞行定位、拾取和高度采样。
- 加载 Cesium quantized-mesh 地形、XYZ、WMS、WMTS、Cesium Ion 影像，以及 GeoJSON、MVT 贴地矢量 overlay。
- 加载 URL 或 Cesium Ion 3D Tiles，并处理 glTF / GLB 模型、动画和贴地放置。
- 使用大气天空、空气透视、体积云、昼夜光照、SMAA、镜头光晕和抖动等效果构建地理场景。
- 与 Three.js 场景、对象、坐标转换及自定义渲染循环互操作。
- 默认使用 WebGL；实验性的 WebGPU renderer 支持基础地球、地形、影像、3D Tiles、模型、拾取与大气，具体限制见[能力边界](https://tellux.cyanfish.site/docs/guide/limitations)。

## 🛠️ 开发

| 命令                    | 说明                           |
| ----------------------- | ------------------------------ |
| `pnpm dev`            | 启动示例站点与文档站点开发服务 |
| `pnpm type-check`     | 执行 TypeScript 类型检查       |
| `pnpm test:run`       | 运行测试                       |
| `pnpm build`          | 构建库产物和声明文件           |
| `pnpm build:examples` | 构建文档和示例站点             |
