# 3D Tiles

Tellux 支持加载独立的 3D Tiles 场景数据。该能力适合倾斜摄影、建筑群、点云和其他 3D Tiles 内容。

## 从 tileset.json 加载

```ts
const layer = viewer.tilesets.add({
  id: 'city',
  source: {
    type: 'url',
    url: 'https://example.com/tileset.json'
  }
})
```

摄影测量等街景模型通常需要更细的 LOD，并配合 `creasedNormals` 改善后处理光照：

```ts
const layer = viewer.tilesets.add({
  id: 'hk',
  source: {
    type: 'url',
    url: '/3dtiles/hk/tileset.json'
  },
  creasedNormals: true,
  tileLoading: {
    errorTarget: 4,
    loadSiblings: true
  }
})
```

`tileLoading.errorTarget` 是目标屏幕空间误差（像素），越小越细，默认 `16`。`loadSiblings` 可在相机移动时减少瓦片空洞，默认 `true`。

在浏览器 Network 面板里，3D Tiles 加载过程中常会出现大量状态为 `canceled` 的 `.b3dm` 请求。这通常是 LOD 细化时引擎主动中止不再需要的粗瓦片或兄弟瓦片下载，**不代表服务器错误或数据缺失**。只要最终画面能稳定显示细节，并且没有持续的 `404` / `CORS error`，就可以视为正常行为。

## 从 Cesium Ion 加载

```ts
const layer = viewer.tilesets.add({
  id: 'ion-tileset',
  source: {
    type: 'cesium-ion',
    assetId: 123456,
    apiToken: cesiumIonToken
  }
})
```

Cesium Ion 上的 Melbourne Point Cloud（asset `43978`）这类资源使用 legacy `pnts` 点云瓦片，且常带 Draco 压缩。Tellux 默认的 `/draco/` 完整 decoder 可以解码这类数据。

点云通过 Cesium 形 `pointCloudShading` 控制着色（实现跟 Tellux 大气管线，**不是**像素级复刻 Cesium）：

```ts
const layer = viewer.tilesets.add({
  source: {
    type: 'cesium-ion',
    apiToken,
    assetId: 43978
  },
  pointCloudShading: {
    attenuation: true,
    geometricErrorScale: 1,
    maximumAttenuation: 8,
    eyeDomeLighting: true,
    normalShading: true
  }
})

// 运行时
layer.pointCloudShading.eyeDomeLighting = false
```

| 字段 | Tellux 默认 | 说明 |
|------|-------------|------|
| `attenuation` | `false` | 按瓦片 `geometricError` 调屏幕点大小 |
| `eyeDomeLighting` | `false`（Cesium 文档常为 `true`） | 独立 mask + 深度 EDL；**仅 WebGL** |
| `normalShading` | `true` | 有几何 `normal` 时接受场景光照；无法线时始终 unlit，`false` 可强制 unlit |
| `baseResolution` | — | 瓦片缺少有效 `geometricError` 时的 attenuation 回退值 |
| `backFaceCulling` | — | 类型预留，当前 no-op |

Melbourne asset `43978` 的抽样 `pnts` 只声明 `POSITION` / `RGB`，没有 `NORMAL`；Cesium 对这类数据也不会重建法线，而是使用 unlit 材质。Tellux 采用相同语义：无法线点保留原始顶点色，不接受太阳、昼夜或大气辐照，也不让空气透视再次洗色；WebGL 全屏 AgX output pass 下会自动做显示色逆变换，避免 Viewer 曝光把点色冲白。该变换属于颜色管理，不会注入光照或改写点数据；体积感仍由可选的 attenuation 和深度 EDL 提供。完整示例见 [`point-cloud-3d-tiles.html`](../../point-cloud-3d-tiles.html)。

## 定位到 3D Tiles

`flyToTarget` 可以接收 3D Tiles renderer、Three.js 对象或经纬高点位。

```ts
viewer.flyToTarget(layer.tileset, {
  heading: 30,
  pitch: -35,
  distance: 1200,
  duration: 1.6
})
```

## 移除图层

```ts
layer.remove()

// 或按 id 移除
viewer.remove3DTileset('city')
```
