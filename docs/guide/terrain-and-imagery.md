# 地形与影像

Tellux 可以在裸球、Cesium quantized-mesh terrain 或天地图 swdx `elv_c` 地形上叠加影像图层。地形负责几何表面，影像图层负责纹理或矢量内容。

## 天地图 swdx 地形

```ts
const tiandituToken = import.meta.env.VITE_TIANDITU_TOKEN ?? ''

const viewer = new tellux.Viewer(container, {
  terrain: {
    type: 'tianditu',
    apiToken: tiandituToken,
    tileLoading: {
      enableTileSplitting: true
    }
  },
  overlays: [
    {
      source: {
        type: 'xyz',
        url: `https://t0.tianditu.gov.cn/DataServer?T=img_w&x={x}&y={y}&l={z}&tk=${tiandituToken}`,
        levels: 18
      }
    }
  ]
})
```

也可以显式传入多子域 swdx URL 列表（与 Cesium `GeoTerrainProvider` 官方示例一致）：

```ts
viewer.terrain.set({
  type: 'tianditu',
  apiToken: tiandituToken,
  urls: ['0', '1', '2', '3', '4', '5', '6', '7'].map(
    (subdomain) =>
      `https://t${subdomain}.tianditu.gov.cn/mapservice/swdx?T=elv_c&tk=${tiandituToken}`
  )
})
```

## Cesium 地形

```ts
const viewer = new tellux.Viewer(container, {
  terrain: {
    type: 'url',
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
viewer.terrain.set({ type: 'url', url: 'https://example.com/terrain/' })
viewer.terrain.clear()
```

## 影像图层

所有影像图层通过 `viewer.overlays` 管理。`add(options)` 返回图层句柄，可以链式调用其方法。

### XYZ 影像

```ts
const layer = viewer.overlays.add({
  name: 'World imagery',
  source: {
    type: 'xyz',
    url: 'https://example.com/imagery/{z}/{y}/{x}',
    levels: 19
  }
})
```

### WMS 影像

```ts
viewer.overlays.add({
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

### WMTS 影像

WMTS 支持 KVP 服务根 URL（由库自动拼装 GetTile 参数）或 RESTful 瓦片 URL 模板。下面以天地图影像为例，通过 `preprocessURL` 注入 `tk` 密钥：

```ts
const tiandituToken = import.meta.env.VITE_TIANDITU_TOKEN ?? ''

viewer.overlays.add({
  name: '天地图影像',
  source: {
    type: 'wmts',
    url: 'http://t0.tianditu.gov.cn/img_w/wmts',
    layer: 'img',
    tileMatrixSet: 'w',
    style: 'default',
    format: 'tiles',
    projection: 'EPSG:3857',
    levels: 18,
    preprocessURL(url) {
      if (!tiandituToken) return url
      const next = new URL(url)
      next.searchParams.set('tk', tiandituToken)
      return next.toString()
    }
  }
})
```

### Cesium Ion 影像

```ts
viewer.overlays.add({
  name: 'Bing aerial',
  source: {
    type: 'cesium-ion',
    apiToken,
    assetId: 2
  }
})
```

## 图层管理

`viewer.overlays.add(...)` 返回的图层句柄（`ImageryLayer`）提供运行时控制能力；也可以通过 `viewer.overlays` 在管理器层面操作。

### 显隐切换

```ts
const layer = viewer.overlays.add({ source: { /* ... */ } })

// 通过句柄
layer.show = false
layer.setVisible(true)

// 通过管理器（按 id）
const layer = viewer.overlays.get('my-layer')
layer.show = false
```

### 样式调整

```ts
layer.setStyle({
  opacity: 0.5,
  color: '#ffffff'   // 颜色乘色，用于整体色调调整
})
```

`opacity` 是栅格影像图层最常用的样式参数，范围 `0` 到 `1`。`fill`、`stroke`、`strokeWidth`、`pointRadius`、`getStyle` 主要用于 GeoJSON 和 MVT 矢量图层（见下文）。

### 图层排序

图层在 viewer 中的渲染顺序由其在 `viewer.overlays` 中的位置决定。可以通过句柄或管理器调整顺序：

```ts
// 把图层移到最底层（最先绘制）
layer.moveTo(0)

// 通过管理器按 id 移动
viewer.overlays.move('my-layer', 2)
```

### 重命名

```ts
layer.setName('卫星影像')
viewer.overlays.get('my-layer')?.setName('卫星影像')
```

### 移除图层

```ts
// 通过句柄
layer.remove()

// 通过管理器按 id 移除
viewer.overlays.remove('my-layer')

// 一次移除全部
viewer.overlays.removeAll()
```

图层被移除后，原句柄会立即失效。继续调用 `setName`、`setVisible`、`setStyle` 或 `moveTo` 不会再修改句柄快照或 Viewer；重复调用 `remove()` 返回 `false`。即使之后添加了相同 id 的新图层，旧句柄也不能操作新图层。

### 遍历与查找

```ts
// 获取全部图层（返回副本，不会影响内部顺序）
const all = viewer.overlays.getAll()

// 按 id 查找，不存在时返回 null
const layer = viewer.overlays.get('my-layer')
```

## 矢量图层

除了 XYZ、WMS 等栅格影像，Tellux 还支持把矢量数据作为影像图层叠加到地形或裸球表面。矢量图层支持按 feature 配置填充、描边和点样式。

### GeoJSON

`geojson` 源可以直接传入 GeoJSON 对象，或通过 `url` 让 Tellux 在初始化时请求：

```ts
viewer.overlays.add({
  name: '行政区',
  source: {
    type: 'geojson',
    geojson: {
      type: 'FeatureCollection',
      features: [/* ... */]
    }
  },
  style: {
    fill: 'rgba(80, 140, 220, 0.4)',
    stroke: '#2c6fbb',
    strokeWidth: 2,
    pointRadius: 4
  }
})
```

需要按 feature 区分样式时，用 `getStyle` 回调，它接收 `(feature, properties)`，返回 `null` 表示不渲染该 feature：

```ts
viewer.overlays.add({
  source: {
    type: 'geojson',
    url: '/data/districts.geojson'
  },
  style: {
    getStyle: (feature, properties) => {
      const population = Number(properties?.population ?? 0)
      return {
        fill: population > 1_000_000 ? 'rgba(220, 80, 80, 0.5)' : 'rgba(80, 140, 220, 0.4)',
        stroke: '#333333',
        strokeWidth: 1
      }
    }
  }
})
```

### MVT（Mapbox Vector Tile）

`mvt` 源从瓦片 URL 模板加载矢量瓦片，适合大规模矢量数据：

```ts
viewer.overlays.add({
  name: '道路',
  source: {
    type: 'mvt',
    url: 'https://example.com/tiles/{z}/{x}/{y}.mvt',
    levels: 16
  },
  style: {
    getStyle: (layerName, properties) => {
      if (layerName === 'road') {
        return { stroke: '#ffaa33', strokeWidth: 2 }
      }
      return null
    }
  }
})
```

MVT 的 `getStyle` 接收 `(layerName, properties)`：`layerName` 是矢量瓦片内部的图层名，`properties` 为对应 feature 的属性；当 `properties` 为 `null` 时，回调仅用于查询该 MVT 图层的绘制顺序（`order` 字段）。

::: tip 栅格化矢量
Tellux 的 GeoJSON / MVT 图层是把矢量内容**栅格化**成纹理再贴到地形表面的，而不是矢量几何直接渲染。这意味着样式（描边宽度、点半径）以**像素**为单位，并受 `resolution`（纹理画布分辨率，默认 GeoJSON `256`、MVT `512`）影响。需要锐利的矢量线宽随缩放保持一致时，适当调高 `resolution`。
:::
