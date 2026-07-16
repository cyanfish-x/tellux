# 3D Tiles

Tellux 支持加载独立的 3D Tiles 场景数据。该能力适合倾斜摄影、建筑群、点云和其他 3D Tiles 内容。

## 从 tileset.json 加载

```ts
const layer = viewer.load3DTileset({
  type: 'url',
  id: 'city',
  url: 'https://example.com/tileset.json'
})
```

摄影测量等街景模型通常需要更细的 LOD，并配合 `creasedNormals` 改善后处理光照：

```ts
const layer = viewer.load3DTileset({
  type: 'url',
  id: 'hk',
  url: '/3dtiles/hk/tileset.json',
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
const layer = viewer.load3DTileset({
  type: 'cesium-ion',
  id: 'ion-tileset',
  apiToken: cesiumIonToken,
  assetId: 123456
})
```

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
