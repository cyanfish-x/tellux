# 快速开始

Tellux 是一个基于 Three.js 的开源 ESM TypeScript 3D Earth Engine，公开包名为 `tellux`。它用于构建数字地球、数字孪生、三维地图及各类 3D Earth 应用。

Tellux 建立在 Three.js 的渲染能力与开源生态之上，提供统一 API 来组织地球相机、Cesium Quantized Mesh 地形、多源影像与矢量图层、3D Tiles、天空大气、体积云及后处理效果。

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

不再使用 Viewer 时（例如单页应用路由切换、组件卸载），调用 `destroy()` 释放 WebGL 资源、控制器、已加载纹理和事件监听器，避免 GPU 内存泄漏和事件回调残留。

```ts
// 单页应用 / 框架组件卸载时销毁（推荐时机）
viewer.destroy()
```

在 React / Vue 这类框架里，应在组件卸载生命周期里销毁：

```ts
// React 示例
useEffect(() => {
  const viewer = new tellux.Viewer(container, options)
  return () => {
    viewer.destroy()
  }
}, [])
```

::: tip 页面关闭时的兜底
页面卸载（`beforeunload` / `pagehide`）时浏览器已经在回收标签页，同步的 WebGL 资源释放通常不可靠，**不要把销毁只挂在页面关闭事件上**。优先在组件卸载或路由切换时销毁；如需兜底，可以额外监听 `pagehide`（比 `beforeunload` 更适合做清理）。
:::
