# Tellux

[English](./README.en.md) | 中文

Tellux 是一个基于 Three.js 的三维地理空间引擎，用 Three.js 构建数字地球、地形、影像与 3D Tiles 场景。

## 安装

```bash
npm install tellux three 3d-tiles-renderer postprocessing @takram/three-atmosphere @takram/three-clouds @takram/three-geospatial @takram/three-geospatial-effects @mapbox/vector-tile pbf
```

## 使用

```ts
import tellux from 'tellux'

const container = document.querySelector('#viewer') as HTMLElement

const viewer = new tellux.Viewer(container, {
  terrain: {
    url: 'https://example.com/terrain/'
  },
  imageryProvider: tellux.ImageryProvider.fromResource(
    tellux.TemplateUrlResource.fromUrl(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    )
  ),
  camera: {
    latitude: 35.6812,
    longitude: 139.8,
    height: 500
  }
})
```

`terrain.url` 支持 Cesium quantized-mesh 地形根目录，也可以直接传入 `layer.json` 地址。运行时可以热切换地形：

```ts
viewer.setTerrain({
  url: 'https://example.com/another-terrain/layer.json'
})

viewer.setTerrain(null)
```

也可以继续使用 Cesium Ion 资源：

```ts
new tellux.Viewer(container, {
  imageryProvider: tellux.ImageryProvider.fromResource(
    tellux.CesiumIonResource.fromAssetId(2275207, {
      apiToken: import.meta.env.VITE_CESIUM_ION_TOKEN
    })
  )
})
```

MVT 矢量瓦片可以通过 `MVTResource` 作为影像叠加层接入：

```ts
viewer.setImageryOverlays([
  tellux.MVTResource.fromUrl('https://example.com/tiles/{z}/{x}/{y}.pbf', {
    getStyle(layerName) {
      if (layerName.includes('water')) return { fill: '#38bdf8', order: 10 }
      if (layerName.includes('transportation')) return { stroke: '#facc15', strokeWidth: 1.4, order: 30 }
      return null
    }
  })
])
```

`MVTResource` 依赖 `3d-tiles-renderer` 的 MVT overlay 能力，运行时需要安装 `@mapbox/vector-tile` 和 `pbf`。

请确保容器具有非零尺寸：

```css
#viewer {
  width: 100vw;
  height: 100vh;
}
```

## Draco 解码器

Tellux 使用 `DRACOLoader` 加载 glTF tiles。默认情况下，解码器会从 `/draco/gltf/` 加载。

你可以将 `three/examples/jsm/libs/draco/gltf/` 中的解码器文件复制到应用的 public 目录，或传入自定义路径：

```ts
new Viewer(container, {
  dracoDecoderPath: '/assets/draco/gltf/'
})
```

## 静态资源目录

Tellux 默认会从上游资源地址加载云和 STBN 纹理。内网部署时，可以把
`local_weather.png`、`turbulence.png`、`shape.bin`、`shape_detail.bin` 和 `stbn.bin`
放到自己的静态目录，并在创建 Viewer 前设置 `tellux.baseUrl`：

```ts
import tellux from 'tellux'

tellux.baseUrl = '/assets/tellux/'

new tellux.Viewer(container)
```

## API

```ts
viewer.camera.setView({
  latitude: 31.2304,
  longitude: 121.4737,
  height: 1000,
  heading: -90,
  pitch: -15
})

viewer.scene.clouds.show = false
viewer.scene.skyAtmosphere.show = true
viewer.scene.postProcessStages.smaa.enabled = true
viewer.toneMappingExposure = 8
viewer.resolutionScale = 1.5

viewer.destroy()
```
