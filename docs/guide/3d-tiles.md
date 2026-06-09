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
