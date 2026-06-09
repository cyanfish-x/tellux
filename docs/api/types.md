# 类型入口

Tellux 的类型入口是 `dist/index.d.ts`，源码中的公开类型主要从 `src/types.ts` 导出。

## Viewer 配置

常用类型：

- `ViewerOptions`
- `AtmosphereLightingMode`
- `TerrainOptions`
- `ImageryLayerOptions`
- `Load3DTilesetOptions`
- `AddModelOptions`
- `SampleHeightOptions`
- `SampleHeightMostDetailedOptions`

## 坐标类型

```ts
type CartographicCoordinateTuple = [
  longitude: number,
  latitude: number,
  height?: number
]

interface CartographicCoordinates {
  latitude: number
  longitude: number
  height: number
}
```

数组输入顺序是 `[经度, 纬度, 高度]`。对象输入使用 `{ longitude, latitude, height }`。

## 事件类型

```ts
viewer.on('mousemove', (event) => {
  event.position
  event.cartographic
})
```

`event.position` 是相对于 canvas 左上角的像素坐标，`event.cartographic` 是命中的经纬高，未命中时为 `null`。
