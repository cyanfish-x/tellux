# 交互：事件 / 拾取 / 高度采样

三层递进的空间查询能力：鼠标事件 → 屏幕拾取 → 按经纬度采样高度。

## 鼠标事件

`viewer.on(type, listener)` 监听 canvas 鼠标事件，目前支持 `click` 和 `mousemove`：

```ts
const onClick = (event) => {
  console.log(event.position)          // { x, y } 相对 canvas 左上角的像素坐标
  console.log(event.cartographic)      // 经纬高 { latitude, longitude, height }，未命中为 null
  console.log(event.tilesetFeature)    // 命中的 3D Tiles feature，未命中为 null
}
viewer.on('click', onClick)
viewer.off('click', onClick)           // 移除
```

`ViewerMouseEvent` 字段：

| 字段 | 说明 |
| --- | --- |
| `type` | `'click'` \| `'mousemove'` |
| `originalEvent` | 原始 DOM MouseEvent |
| `position` | `{ x, y }` 相对 canvas 左上角像素坐标 |
| `cartographic` | 经纬高（度/米），未命中 3D Tiles 和椭球时为 `null` |
| `tilesetFeature` | 命中的 `Picked3DTilesFeature`，只用已加载瓦片，未命中为 `null` |

> `mousemove` 触发频繁，回调内避免重计算 / 同步 DOM 操作。

## 屏幕拾取

不通过事件、用任意屏幕坐标拾取时直接调方法。

### `pickCartographic(position)` —— 屏幕坐标 → 经纬高

**优先命中已加载 3D Tiles**，未命中回退 WGS84 椭球表面；都没命中返回 `null`。

```ts
const coord = viewer.pickCartographic({ x: 400, y: 300 })
if (coord) console.log(coord.latitude, coord.longitude, coord.height)
```

### `pick3DTilesFeature(position)` —— 屏幕坐标 → 3D Tiles feature

只查已加载 3D Tiles，**不回退椭球**，**不额外请求高精度瓦片**；未命中返回 `null`。

```ts
const feature = viewer.pick3DTilesFeature({ x: 400, y: 300 })
if (feature) {
  console.log(feature.layerId)       // 命中的 3D Tiles 图层 id
  console.log(feature.featureId)     // feature id（数据未提供时为 null）
  console.log(feature.properties)    // 属性键值表
  console.log(feature.cartographic)  // 命中点经纬高
  console.log(feature.faceIndex)     // 三角面索引，不可用时为 null
}
```

> **所有拾取方法只用当前已加载内容**，视角外或未加载区域可能返回椭球坐标或 `null`。

## 高度采样

反向问题：**给定经纬度，地表有多高**。不依赖鼠标位置。

### `sampleHeight(position)` —— 即时、同步

沿当地地表法线向下射线求交，只用已加载内容，**不请求视角外瓦片**，未命中返回 `undefined`。适合每帧查询（如 marker 贴地）。

```ts
// 元组 [经度, 纬度, 高度?] 或对象
const height = viewer.sampleHeight([121.4737, 31.2304])

// 限定数据源和采样高度范围
const terrainHeight = viewer.sampleHeight(
  { longitude: 121.4737, latitude: 31.2304 },
  { source: 'terrain', minimumHeight: -1000, maximumHeight: 9000 }
)
```

`source` 取值：`'all'`（默认，地形+3D Tiles）/ `'terrain'` / `'tileset'`。

### `sampleHeightMostDetailed(positions)` —— 异步、批量、高精度

会**主动加载所需层级瓦片**，适合预计算路径地表高度（可能跨视图）：

```ts
const positions = [[121.4737, 31.2304], [116.4074, 39.9042], [113.2644, 23.1291]]
const results = await viewer.sampleHeightMostDetailed(positions)

results.forEach((result, i) => {
  if (result) {
    const [lon, lat, height] = result   // [经度, 纬度, 高度]
    console.log(`${lat}, ${lon} 高度 ${height} 米`)
  } else {
    console.log(`${positions[i]} 未命中`)
  }
})
```

返回结果与输入一一对应、顺序一致；未命中项为 `undefined`。

**关键副作用**（务必告知用户）：

- 3D Tiles / 混合模式下，临时添加的局部加载区域**采样后会留在主场景缓存**（升温），后续靠近可复用，但会占缓存。
- **当 `useDefaultRenderLoop` 为 `false` 时，调用方必须继续调用 `viewer.render()` 推进采样**，否则任务一直等待、最终超时返回 `undefined`。

```ts
// 手动渲染循环下的正确用法
viewer.useDefaultRenderLoop = false
const results = await viewer.sampleHeightMostDetailed(positions)
// 期间必须有人持续调用 viewer.render()，否则采样卡死
```

`SampleHeightMostDetailedOptions`：`source`、`resolution`(默认256)、`maxFrames`(默认120)、`debug`。

## 选型速查

| 需求 | 方法 |
| --- | --- |
| 点击/悬停取坐标 | `on('click'\|'mousemove')` 或 `pickCartographic` |
| 点击查 3D Tiles 属性 | `pick3DTilesFeature` |
| 每帧让对象贴地（当前视图内） | `sampleHeight` |
| 批量预计算路径高度（可能跨视图） | `sampleHeightMostDetailed` |

## 高亮

`viewer.highlight` 统一选中态视觉：

- `Object3D` → WebGL 后处理描边（`scene.highlight.outline`）
- `Picked3DTilesFeature` → 半透明叠加几何（`scene.highlight.overlay`）

```ts
viewer.on('click', (event) => {
  if (event.tilesetFeature) viewer.highlight.set(event.tilesetFeature)
  else viewer.highlight.clear()
})
viewer.highlight.setHover(featureOrNull)
viewer.highlight.clear()
```

WebGPU 下描边不可用；Tiles overlay 仍可用。HISM 单实例高亮尚未纳入本门面。

## 通用 Object3D 拾取

```ts
const hit = viewer.pickObject(position)                 // 整 scene
const hit = viewer.pickObject(position, model.root)     // 限定根节点
viewer.pickObjects(position, root?)                     // 全部命中，近→远
```

跳过 `userData.telluxPickingIgnore`。用于自定义 mesh / `addModel` 的 `model.root` 点击高亮等。
