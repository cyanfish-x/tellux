# 交互与拾取

Tellux 提供了从鼠标事件、屏幕拾取到高度采样三层递进的空间查询能力，覆盖"点击看坐标"、"画路径前采样地表高度"等典型 GIS 工作流。

## 鼠标事件

通过 `viewer.on(type, listener)` 监听 canvas 上的鼠标事件。目前支持 `click` 和 `mousemove`：

```ts
const onClick = (event) => {
  console.log('像素坐标', event.position)
  console.log('经纬高', event.cartographic)
  console.log('3D Tiles feature', event.tilesetFeature)
  console.log('Entities', event.entities)
}

viewer.on('click', onClick)

// 不再需要时移除
viewer.off('click', onClick)
```

`ViewerMouseEvent` 包含以下字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | `'click' \| 'mousemove'` | 事件类型。 |
| `originalEvent` | `MouseEvent` | 原始 DOM 鼠标事件。 |
| `position` | `ScreenPosition` | 相对 canvas 左上角的像素坐标 `{ x, y }`。 |
| `cartographic` | `CartographicCoordinates \| null` | 鼠标位置对应的经纬高。未命中 3D Tiles 或椭球时为 `null`。 |
| `tilesetFeature` | `Picked3DTilesFeature \| null` | 鼠标命中的 3D Tiles feature，只使用当前已加载瓦片，不额外请求高精度瓦片。 |
| `entities` | `PickedEntity[]` | 鼠标命中的实体列表，按距离从近到远排序。未命中时为空数组。 |

事件中的实体拾取会对点和线使用默认屏幕空间容差：`click` 为 6 CSS 像素，`mousemove` 为 4 CSS 像素。3D Tiles、面实体和体实体仍使用原有精确拾取逻辑。
如果只需要最佳命中实体，可使用 `event.entities[0] ?? null`。

关于如何创建可被拾取的点、线、面实体，见「[实体绘制](./entities)」。

`mousemove` 事件触发频率较高，监听回调里应避免重计算或同步 DOM 操作。

## 屏幕拾取

如果不通过事件，而是想用任意屏幕坐标做拾取，可以直接调用：

### `pickCartographic(position)`

把屏幕像素坐标转成经纬高。**优先命中已加载的 3D Tiles**，未命中时回退到 WGS84 椭球表面；两者都没命中返回 `null`。

```ts
const cartographic = viewer.pickCartographic({ x: 400, y: 300 })
if (cartographic) {
  console.log(cartographic.latitude, cartographic.longitude, cartographic.height)
}
```

适用于"点击空白处取坐标"这类需求。

### `pick3DTilesFeature(position)`

拾取屏幕位置对应的 **3D Tiles feature**。与 `pickCartographic` 不同，它**只检查已加载的 3D Tiles 内容**，不会回退到椭球表面，也不会额外请求更精细瓦片。未命中返回 `null`。

```ts
const feature = viewer.pick3DTilesFeature({ x: 400, y: 300 })
if (feature) {
  console.log('图层', feature.layerId)
  console.log('feature id', feature.featureId)
  console.log('属性', feature.properties)
  console.log('命中点经纬高', feature.cartographic)
}
```

`Picked3DTilesFeature` 主要字段：

| 字段 | 说明 |
| --- | --- |
| `layerId` | 命中的 3D Tiles 图层 id。 |
| `tileset` | 命中的底层 `TilesRenderer`。 |
| `object` / `point` | 命中的 Three.js 对象与世界坐标。 |
| `faceIndex` | 命中三角面索引，不可用时为 `null`。 |
| `featureId` | feature id，数据未提供时为 `null`。 |
| `properties` | feature 属性键值表。 |
| `cartographic` | 命中点经纬高。 |

> 拾取类方法都只针对**当前已加载到场景中的内容**。视角外或尚未加载的瓦片不会被请求，远处或未加载区域可能返回椭球表面坐标或 `null`。

### `pickEntity(position, options?)`

拾取屏幕位置对应的最佳实体。点和线实体可以通过 `tolerance` 扩大屏幕空间命中范围，单位为 CSS 像素；不传时为 `0`，只按图形自身可视宽度命中。未命中时返回 `null`。

```ts
const entityHit = viewer.pickEntity({ x: 400, y: 300 }, { tolerance: 6 })
if (entityHit) {
  console.log('实体 id', entityHit.entity.id)
  console.log('命中点世界坐标', entityHit.point)
}
```

`tolerance` 只影响点、线实体；面实体和体实体仍走原有 Three.js raycaster 拾取路径。

### `pickEntities(position, options?)`

拾取屏幕位置对应的实体列表。结果按距离从近到远排序；同一个实体如果有多个图形同时命中，只返回该实体距离最近的命中结果。未命中时返回空数组。

```ts
const entityHits = viewer.pickEntities({ x: 400, y: 300 }, { tolerance: 6 })
entityHits.forEach((hit) => {
  console.log('实体 id', hit.entity.id)
})
```

## 高度采样

高度采样回答的是相反方向的问题：**给定一个经纬度，地表有多高**。它不依赖鼠标位置，而是按经纬度查询。

### 即时采样：`sampleHeight`

`sampleHeight(position)` 沿当地地表法线向下发射射线，使用当前已加载的地形和 3D Tiles 求交。**不会为视角外的区域额外请求瓦片**，未命中返回 `undefined`。

```ts
const height = viewer.sampleHeight({
  latitude: 31.2304,
  longitude: 121.4737
})

// 也可以用元组输入：[经度, 纬度, 高度?]
const height2 = viewer.sampleHeight([121.4737, 31.2304])
```

`source` 控制参与采样的数据源：

| `source` | 说明 |
| --- | --- |
| `'all'`（默认） | 地形和 3D Tiles 都参与。 |
| `'terrain'` | 只采地形。 |
| `'tileset'` | 只采 3D Tiles。 |

```ts
// 只查询地形高度，忽略 3D Tiles
const terrainHeight = viewer.sampleHeight([121.4737, 31.2304], {
  source: 'terrain',
  minimumHeight: -1000,
  maximumHeight: 9000
})
```

`sampleHeight` 是同步的、轻量的，适合每帧查询（如让 marker 贴地）。

### 高精度异步采样：`sampleHeightMostDetailed`

`sampleHeightMostDetailed(positions)` 异步、批量、高精度地采样多个经纬度的地表高度。它会主动加载所需层级的瓦片：

- **地形模式**：按 quantized-mesh availability 直接加载最高可用层级并插值。
- **3D Tiles / 混合模式**：在主场景 tileset 上临时添加局部加载区域，等采样区域瓦片细化后再 raycast。采样完成后这些区域会**保留在主场景缓存中**（升温），后续视角靠近时可直接复用。
- 必要时会回退到采样专用 tileset。

```ts
const positions = [
  [121.4737, 31.2304],
  [116.4074, 39.9042],
  [113.2644, 23.1291]
]

const results = await viewer.sampleHeightMostDetailed(positions)

results.forEach((result, i) => {
  if (result) {
    const [lon, lat, height] = result
    console.log(`${lat}, ${lon} 地表高度 ${height} 米`)
  } else {
    console.log(`${positions[i]} 未命中地表`)
  }
})
```

返回结果与输入数组一一对应，顺序一致；未命中的项为 `undefined`。

::: warning 手动渲染循环下需自行推进
当 `viewer.useDefaultRenderLoop` 为 `false` 时，瓦片加载和细化不会自动推进。`sampleHeightMostDetailed` 依赖每帧的 tileset update，此时**必须由调用方继续调用 `viewer.render()`**，否则采样任务会一直等待，最终超时返回 `undefined`。
:::

`SampleHeightMostDetailedOptions` 常用参数：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `source` | `'all'` | 参与采样的数据源。 |
| `resolution` | `256` | 离屏采样相机的像素分辨率。 |
| `maxFrames` | `120` | 等待瓦片加载和细化的最大帧数。 |
| `debug` | `false` | 输出每个 batch 的诊断信息，便于排查采样慢或未命中的问题。 |

## 选型建议

| 需求 | 推荐方法 |
| --- | --- |
| 点击 / 悬停取坐标 | `on('click' \| 'mousemove')` 事件，或 `pickCartographic` |
| 点击查询 3D Tiles 属性 | `pick3DTilesFeature` |
| 点击 / 悬停查询单个实体 | `on('click' \| 'mousemove')` 事件的 `entities[0]`，或 `pickEntity` |
| 点击 / 悬停查询多个实体 | `on('click' \| 'mousemove')` 事件的 `entities`，或 `pickEntities` |
| 每帧让对象贴地（高频、当前视图内） | `sampleHeight` |
| 批量预计算路径地表高度（可能跨视图） | `sampleHeightMostDetailed` |
