# 快速开始

Tellux 是一个 ESM TypeScript 库，公开包名为 `tellux`。它基于 Three.js 组织 GIS viewer，适合加载 Cesium 地形、影像图层、3D Tiles、大气、体积云和后处理效果。

## 安装

```bash
pnpm add tellux three 3d-tiles-renderer @takram/three-geospatial @takram/three-geospatial-effects @takram/three-atmosphere @takram/three-clouds postprocessing
```

`three`、`3d-tiles-renderer` 和 Takram 相关包是 Tellux 的 peer dependency。应用侧需要显式安装，便于你控制版本和打包策略。

## 创建 Viewer

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
        url: 'https://example.com/imagery/{z}/{y}/{x}',
        levels: 19
      }
    }
  ],
  camera: {
    latitude: 31.2304,
    longitude: 121.4737,
    height: 1200,
    pitch: -25
  }
})
```

## 资源路径

Tellux 默认从 `/draco/gltf/` 加载 Draco 解码器。如果你的应用把解码器放在其他公开目录，需要通过 `dracoDecoderPath` 指定：

```ts
const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: '/assets/draco/gltf/'
})
```

## 销毁

页面卸载或容器不再使用时，调用 `destroy()` 释放 WebGL、控制器、纹理和事件监听器。

```ts
window.addEventListener('beforeunload', () => {
  viewer.destroy()
})
```
