# 数据源

本章给出几类常见的、可直接复制运行的公开数据源配置，覆盖地形、栅格影像、矢量图层和 3D Tiles。这些数据源来自公开服务，可作为快速上手和验证使用。

## 地形

### Cesium Ion 世界地形

Cesium Ion 提供全球 quantized-mesh 地形（asset id `1`），需要 Cesium Ion 账号和访问令牌：

```ts
const viewer = new tellux.Viewer(container, {
  terrain: {
    type: 'cesium-ion',
    assetId: 1,
    apiToken: YOUR_CESIUM_ION_TOKEN,
    tileLoading: {
      enableTileSplitting: true   // 提升影像与地形边界的贴合度
    }
  }
})
```

### 自托管 quantized-mesh

如果有自托管的 quantized-mesh 地形服务，传入根 URL 或 `layer.json` URL：

```ts
const viewer = new tellux.Viewer(container, {
  terrain: {
    url: 'https://your-server/terrain/layer.json'
  }
})
```

## 栅格影像

### ArcGIS World Imagery（XYZ）

全球卫星影像，无需令牌，是最常用的底图：

```ts
viewer.layers.add({
  name: 'ArcGIS World Imagery',
  source: {
    type: 'xyz',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    levels: 19
  }
})
```

### NASA GIBS（WMS）

NASA GIBS 提供大量全球科学图层（土地覆盖、气溶胶、温度等），走 WMS。下面以 MODIS 土地覆盖为例，通过 `preprocessURL` 追加 `TIME` 参数：

```ts
viewer.layers.add({
  name: 'NASA GIBS Land Cover',
  source: {
    type: 'wms',
    url: 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi',
    layer: 'MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual',
    version: '1.1.1',
    crs: 'EPSG:4326',
    styles: 'default',
    format: 'image/png',
    transparent: true,
    levels: 10,
    tileDimension: 512,
    contentBoundingBox: [-180, -90, 180, 90],
    preprocessURL(url) {
      const next = new URL(url)
      next.searchParams.set('TIME', '2024-01-01')
      return next.toString()
    }
  },
  style: { opacity: 0.82 }
})
```

### 天地图影像（WMTS）

天地图影像服务走 WMTS，需要申请 `tk` 密钥。Tellux 使用 KVP 模式：只传服务根 URL，由 `WMTSTilesOverlay` 自动拼装 GetTile 参数：

```ts
const tiandituToken = YOUR_TIANDITU_TOKEN

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
      const next = new URL(url)
      next.searchParams.set('tk', tiandituToken)
      return next.toString()
    }
  }
})
```

> 天地图 `format` 使用 `tiles`，不是常见的 `image/png`。示例站点可通过环境变量 `VITE_TIANDITU_TOKEN` 配置密钥。

### Cesium Ion 影像

Cesium Ion 也提供 Bing 等影像底图（如 Bing 航空 asset id `2`）：

```ts
viewer.layers.add({
  name: 'Bing aerial',
  source: {
    type: 'cesium-ion',
    apiToken: YOUR_CESIUM_ION_TOKEN,
    assetId: 2
  }
})
```

## 矢量图层

### OpenInfraMap（MVT）

OpenInfraMap 提供全球电力 / 能源设施的矢量瓦片，可作为 MVT 叠加层。配合 `getStyle` 回调按 MVT 图层名区分样式：

```ts
viewer.layers.add({
  name: 'OpenInfraMap 电力设施',
  source: {
    type: 'mvt',
    url: 'https://openinframap.org/tiles/{z}/{x}/{y}.pbf',
    levels: 15,
    resolution: 1024
  },
  style: {
    getStyle(layerName, properties) {
      if (layerName === 'power_line') {
        return { stroke: '#e6b800', strokeWidth: 2 }
      }
      if (layerName === 'power_tower' || layerName === 'power_pole') {
        return { fill: '#ffffff', stroke: '#000000', radius: 3 }
      }
      return { visible: false }
    }
  }
})
```

### 自托管 GeoJSON

GeoJSON 适合中量级矢量数据（行政区划、业务边界等），可以直接传对象或 URL：

```ts
viewer.layers.add({
  name: '行政区',
  source: {
    type: 'geojson',
    url: '/data/districts.geojson',
    resolution: 1024
  },
  style: {
    fill: 'rgba(20, 184, 166, 0.14)',
    stroke: '#ff0000',
    strokeWidth: 3
  }
})
```

## 3D Tiles

### 3D Tiles 样例仓库（URL）

Cesium 官方维护的 3D Tiles 样例仓库，托管在 GitHub raw 上，可直接用 URL 加载，无需令牌：

```ts
const layer = viewer.load3DTileset({
  id: 'discrete-lod',
  type: 'url',
  url: 'https://raw.githubusercontent.com/CesiumGS/3d-tiles-samples/main/1.0/TilesetWithDiscreteLOD/tileset.json'
})

viewer.flyToTarget(layer.tileset, { distance: 1200 })
```

### Cesium Ion 3D Tiles

摄影测量、建筑群等大型 3D Tiles 通常托管在 Cesium Ion，通过 asset id 加载：

```ts
const layer = viewer.load3DTileset({
  id: 'photogrammetry',
  type: 'cesium-ion',
  apiToken: YOUR_CESIUM_ION_TOKEN,
  assetId: 75343
})
```

### Google Photorealistic 3D Tiles

Google 的写实 3D Tiles 可通过 Cesium Ion 接入（需要在 Google Cloud / Cesium Ion 侧开通），加载方式同上，使用对应的 asset id 和令牌。

::: tip 跨域与令牌
公开 XYZ / WMS 服务可能有跨域（CORS）或访问频率限制；Cesium Ion 资源必须有有效令牌。自托管数据时，确保服务器开启了正确的 CORS 头。`preprocessURL` 可用于追加鉴权参数或签名。
:::
