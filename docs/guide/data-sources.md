# 数据源

本章给出几类常见的数据源配置示例，覆盖地形、栅格影像、矢量图层和 3D Tiles。代码片段中的 `url` 统一使用占位域名 `example.com`；实际服务地址请替换为你自托管或已获授权的数据源。可运行示例与密钥配置见仓库 `examples/` 目录。

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
    url: 'https://example.com/terrain/layer.json'
  }
})
```

## 栅格影像

### ArcGIS World Imagery（XYZ）

全球卫星影像 XYZ 瓦片是最常用的底图之一。将 `url` 替换为你的 XYZ 服务地址：

```ts
viewer.overlays.add({
  name: 'World Imagery',
  source: {
    type: 'xyz',
    url: 'https://example.com/imagery/{z}/{y}/{x}',
    levels: 19
  }
})
```

### NASA GIBS（WMS）

科学 WMS 服务通常提供大量全球专题图层（土地覆盖、气溶胶、温度等）。下面以土地覆盖图层为例，通过 `preprocessURL` 追加 `TIME` 参数：

```ts
viewer.overlays.add({
  name: 'Land Cover',
  source: {
    type: 'wms',
    url: 'https://example.com/wms',
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

viewer.overlays.add({
  name: '天地图影像',
  source: {
    type: 'wmts',
    url: 'https://example.com/wmts',
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

> 部分 WMTS 服务（如天地图）的 `format` 使用 `tiles`，不是常见的 `image/png`。示例站点可通过环境变量 `VITE_TIANDITU_TOKEN` 配置密钥。

### Cesium Ion 影像

Cesium Ion 也提供 Bing 等影像底图（如 Bing 航空 asset id `2`）：

```ts
viewer.overlays.add({
  name: 'Bing aerial',
  source: {
    type: 'cesium-ion',
    apiToken: YOUR_CESIUM_ION_TOKEN,
    assetId: 2
  }
})
```

## 矢量图层

### MVT 矢量瓦片

MVT 适合大规模矢量数据叠加。配合 `getStyle` 回调按 MVT 内部图层名区分样式：

```ts
viewer.overlays.add({
  name: '矢量设施',
  source: {
    type: 'mvt',
    url: 'https://example.com/tiles/{z}/{x}/{y}.pbf',
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
viewer.overlays.add({
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

### 自托管 3D Tiles（URL）

自托管或已获授权的 3D Tiles 可直接用 `tileset.json` URL 加载：

```ts
const layer = viewer.tilesets.add({
  id: 'discrete-lod',
  source: {
    type: 'url',
    url: 'https://example.com/tileset.json'
  }
})

viewer.flyToTarget(layer.tileset, { distance: 1200 })
```

### Cesium Ion 3D Tiles

摄影测量、建筑群等大型 3D Tiles 通常托管在 Cesium Ion，通过 asset id 加载：

```ts
const layer = viewer.tilesets.add({
  id: 'photogrammetry',
  source: {
    type: 'cesium-ion',
    assetId: 75343,
    apiToken: YOUR_CESIUM_ION_TOKEN
  }
})
```

### 卫星 WMS 专题层

部分卫星 WMS 服务需要额外时间参数，且 BBOX 轴序与 WMS 1.3.0 默认约定不同。下面演示通过 `preprocessURL` 注入 `datetime` 并交换 BBOX 轴序：

```ts
function normalizeSatelliteWmsUrl(url: string): string {
  const next = new URL(url)
  next.searchParams.set('datetime', '202507081100') // UTC，YYYYMMDDhhmm

  const bbox = next.searchParams.get('bbox')?.split(',').map(Number)
  if (bbox?.length === 4 && bbox.every(Number.isFinite)) {
    // WMS 1.3.0 EPSG:4326 为 lat/lon；部分服务要求 lon/lat
    next.searchParams.set('bbox', [bbox[1], bbox[0], bbox[3], bbox[2]].join(','))
  }
  return next.toString()
}

viewer.overlays.add({
  name: '卫星红外',
  source: {
    type: 'wms',
    url: 'https://example.com/satellite/wms',
    layer: 'GEOS_IRX',
    version: '1.3.0',
    crs: 'EPSG:4326',
    format: 'image/png',
    levels: 3,
    contentBoundingBox: [-180, -90, 180, 90],
    preprocessURL: normalizeSatelliteWmsUrl
  },
  style: { opacity: 0.85 }
})
```

::: warning 卫星 WMS 使用注意
- 参数名须为小写（Tellux 会自动处理）。
- 全球粗分辨率拼图图层**BBOX 过小可能返回空白图**，建议 `levels` 设为 **3**（最细瓦片约 45°×45°）。`levels: 4` 时最细约 22.5°，放大后边缘区域容易出现空瓦片。
- 必须在 `preprocessURL` 中追加时间参数，并按服务要求调整 BBOX 轴序。
:::

### Google Photorealistic 3D Tiles

Google 的写实 3D Tiles 可通过 Cesium Ion 接入（需要在 Google Cloud / Cesium Ion 侧开通），加载方式同上，使用对应的 asset id 和令牌。

::: tip 跨域与令牌
公开 XYZ / WMS 服务可能有跨域（CORS）或访问频率限制；Cesium Ion 资源必须有有效令牌。自托管数据时，确保服务器开启了正确的 CORS 头。`preprocessURL` 可用于追加鉴权参数或签名。
:::
