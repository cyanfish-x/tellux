# 地形与影像

Tellux 可以在裸球、Cesium quantized-mesh terrain 或天地图 swdx `elv_c` 地形上叠加影像图层。地形负责几何表面，影像图层负责纹理或矢量内容。

## 天地图 swdx 地形

```ts
const tiandituToken = import.meta.env.VITE_TIANDITU_TOKEN ?? ''

const viewer = new tellux.Viewer(container, {
  terrain: {
    type: 'tianditu',
    token: tiandituToken,
    tileLoading: {
      enableTileSplitting: true
    }
  },
  layers: [
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
viewer.setTerrain({
  type: 'tianditu',
  token: tiandituToken,
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

## 流式地形运行时

需要让植被、近岸海洋或分析模块消费动态 LOD 时，使用 `viewer.terrain`，不要直接依赖 3d-tiles-renderer 的内部 Tile 对象：

```ts
viewer.terrain.set({ type: 'cesium-ion', assetId: 1, apiToken })

const stop = viewer.terrain.observeTiles((event) => {
  if (event.type === 'load') {
    console.log(event.tile.id, event.tile.parentId, event.tile.rectangle)
  } else if (event.type === 'unload') {
    // snapshot.model 即将失效
  } else {
    // 地形源切换、移除或 Viewer 销毁
    console.log('terrain reset', event.sourceRevision)
  }
}, {
  replay: true,
  rectangle: { west: 110.1, south: 18.5, east: 110.3, north: 18.8 }
})
```

`load` 快照按父级优先同步 replay，包含不透明 `id`、`parentId`、`sourceRevision`、LOD 深度、几何误差、虚拟瓦片标记、度制地理矩形、米制高程范围和只读 `model`。跨日期变更线的矩形允许 `west > east`。模型、材质、geometry 与 ArrayBuffer 始终归 Tellux 所有；观察者只能读取或复制，不能修改、销毁或转移。

### 受控材质装饰器

需要裁水、调试着色等材质级扩展时，使用装饰器返回新材质，不修改输入：

```ts
const removeDecorator = viewer.terrain.addMaterialDecorator(({ tile, mesh, material }) => {
  const decorated = createDecoratedMaterial(tile, mesh, material)
  return {
    material: decorated,
    dispose: () => decorated.dispose()
  }
})
```

多个装饰器按注册顺序组合。注销会先释放当前结果，再从原始材质重建剩余链；瓦片卸载、terrain reset 和 `viewer.destroy()` 也会恢复并释放装饰结果。单个装饰器失败不会破坏该 Mesh 上一层有效材质。

::: warning 所有权边界
装饰器不得修改传入材质、Mesh 或 geometry。只有自己返回的材质和资源由自己的 `dispose` 回调释放。
:::

## 影像图层

所有影像图层通过 `viewer.layers` 管理。`add(options)` 返回图层句柄，可以链式调用其方法。

### XYZ 影像

```ts
const layer = viewer.layers.add({
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

### WMTS 影像

WMTS 支持 KVP 服务根 URL（由库自动拼装 GetTile 参数）或 RESTful 瓦片 URL 模板。下面以天地图影像为例，通过 `preprocessURL` 注入 `tk` 密钥：

```ts
const tiandituToken = import.meta.env.VITE_TIANDITU_TOKEN ?? ''

viewer.layers.add({
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
viewer.layers.add({
  name: 'Bing aerial',
  source: {
    type: 'cesium-ion',
    apiToken,
    assetId: 2
  }
})
```

## 图层管理

`viewer.layers.add(...)` 返回的图层句柄（`ImageryLayer`）提供运行时控制能力；也可以通过 `viewer.layers` 在管理器层面操作。

### 显隐切换

```ts
const layer = viewer.layers.add({ source: { /* ... */ } })

// 通过句柄
layer.show = false
layer.setVisible(true)

// 通过管理器（按 id）
const layer = viewer.layers.get('my-layer')
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

图层在 viewer 中的渲染顺序由其在 `viewer.layers` 中的位置决定。可以通过句柄或管理器调整顺序：

```ts
// 把图层移到最底层（最先绘制）
layer.moveTo(0)

// 通过管理器按 id 移动
viewer.layers.move('my-layer', 2)
```

### 重命名

```ts
layer.setName('卫星影像')
viewer.layers.get('my-layer')?.setName('卫星影像')
```

### 移除图层

```ts
// 通过句柄
layer.remove()

// 通过管理器按 id 移除
viewer.layers.remove('my-layer')

// 一次移除全部
viewer.layers.removeAll()
```

图层被移除后，原句柄会立即失效。继续调用 `setName`、`setVisible`、`setStyle` 或 `moveTo` 不会再修改句柄快照或 Viewer；重复调用 `remove()` 返回 `false`。即使之后添加了相同 id 的新图层，旧句柄也不能操作新图层。

### 遍历与查找

```ts
// 获取全部图层（返回副本，不会影响内部顺序）
const all = viewer.layers.getAll()

// 按 id 查找，不存在时返回 null
const layer = viewer.layers.get('my-layer')
```

## 矢量图层

除了 XYZ、WMS 等栅格影像，Tellux 还支持把矢量数据作为影像图层叠加到地形或裸球表面。矢量图层支持按 feature 配置填充、描边和点样式。

### GeoJSON

`geojson` 源可以直接传入 GeoJSON 对象，或通过 `url` 让 Tellux 在初始化时请求：

```ts
viewer.layers.add({
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
viewer.layers.add({
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
viewer.layers.add({
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
