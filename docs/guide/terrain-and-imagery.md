# 地形与影像

Tellux 可以在裸球或 Cesium quantized-mesh terrain 上叠加影像图层。地形负责几何表面，影像图层负责纹理或矢量内容。

## Cesium 地形

```ts
const viewer = new tellux.Viewer(container, {
  terrain: {
    url: 'https://example.com/terrain/layer.json',
    tileLoading: {
      errorTarget: 1,
      imageryResolution: 256,
      enableTileSplitting: true
    }
  }
})
```

运行时可以切换或移除地形：

```ts
viewer.setTerrain({ url: 'https://example.com/terrain/' })
viewer.setTerrain(null)
```

## XYZ 影像

```ts
viewer.layers.add({
  name: 'World imagery',
  source: {
    type: 'xyz',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    levels: 19
  }
})
```

## WMS 影像

```ts
viewer.layers.add({
  name: 'Boundary',
  source: {
    type: 'wms',
    url: 'https://example.com/geoserver/wms',
    layer: 'workspace:layer',
    transparent: true
  },
  style: {
    opacity: 0.72
  }
})
```
