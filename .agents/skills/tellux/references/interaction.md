# 交互：事件 / 拾取 / 高度采样

三层递进的空间查询能力：鼠标事件 → 屏幕拾取 → 按经纬度采样高度。

对象拾取与地表坐标分两域：`pick` / `pickAll` vs `pickCartographic`。

## 鼠标事件

`viewer.on(type, listener)` 监听 canvas 鼠标事件，目前支持 `click` 和 `mousemove`：

```ts
const onClick = (event) => {
  console.log(event.position)      // { x, y } 相对 canvas 左上角
  console.log(event.cartographic)  // 经纬高，未命中为 null
  console.log(event.pick)          // ViewerPickResult | null
  console.log(event.picks)         // ViewerPickResult[]
}
viewer.on('click', onClick)
viewer.off('click', onClick)
```

`ViewerMouseEvent` 字段：

| 字段 | 说明 |
| --- | --- |
| `type` | `'click'` \| `'mousemove'` |
| `originalEvent` | 原始 DOM MouseEvent |
| `position` | `{ x, y }` 相对 canvas 左上角像素坐标 |
| `cartographic` | 经纬高（度/米），未命中 3D Tiles 和椭球时为 `null` |
| `pick` | 最近命中的 `ViewerPickResult`，未命中为 `null` |
| `picks` | `click` 为完整 drill（近→远）；`mousemove` 仅为最近一条 |

> `mousemove` 触发频繁，事件内只做 nearest-only；完整叠层请自行 `viewer.pickAll(event.position)`（建议节流）。

## 屏幕拾取

### `pickCartographic(position)` —— 屏幕坐标 → 经纬高

**优先命中已加载 3D Tiles**，未命中回退 WGS84 椭球表面；都没命中返回 `null`。

```ts
const coord = viewer.pickCartographic({ x: 400, y: 300 })
if (coord) console.log(coord.latitude, coord.longitude, coord.height)
```

### `pick` / `pickAll` —— 统一对象拾取

```ts
const hit = viewer.pick({ x: 400, y: 300 })
// hit.type: 'entity' | 'tilesFeature' | 'hismInstance' | 'object'

const hits = viewer.pickAll({ x: 400, y: 300 }) // 近→远

viewer.pick(pos, { layers: ['tilesFeature'] })
viewer.pick(pos, { layers: ['hismInstance'] })
viewer.pick(pos, { root: model.root }) // 默认仅 object 层
```

- 默认 `layers`：`['entity', 'hismInstance', 'tilesFeature']`；无 HISM 图层时跳过 `hismInstance`。
- 传入 `root` 且未指定 `layers` → `['object']`（避免打到地形瓦片）。
- `pick` = 每层最近再比全局最近；`pickAll` = 全量合并。
- `tolerance`：点/线实体屏幕容差（CSS 像素）。

> **所有拾取方法只用当前已加载内容**，视角外或未加载区域可能返回椭球坐标或 `null`。

## 高度采样

反向问题：**给定经纬度，地表有多高**。不依赖鼠标位置。

### `sampleHeight(position)` —— 即时、同步

沿当地地表法线向下射线求交，只用已加载内容，**不请求视角外瓦片**，未命中返回 `undefined`。适合每帧查询（如 marker 贴地）。

```ts
const height = viewer.sampleHeight([121.4737, 31.2304])

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
    const [lon, lat, height] = result
    console.log(`${lat}, ${lon} 高度 ${height} 米`)
  } else {
    console.log(`${positions[i]} 未命中`)
  }
})
```

**关键副作用**：

- 3D Tiles / 混合模式下，临时添加的局部加载区域**采样后会留在主场景缓存**（升温）。
- **当 `useDefaultRenderLoop` 为 `false` 时，调用方必须继续调用 `viewer.render()` 推进采样**。

`SampleHeightMostDetailedOptions`：`source`、`resolution`(默认256)、`maxFrames`(默认120)、`debug`。

## 选型速查

| 需求 | 方法 |
| --- | --- |
| 点击/悬停取坐标 | `on('click'\|'mousemove')` 或 `pickCartographic` |
| 点击查可选中对象 | `event.pick` / `event.picks` 或 `viewer.pick` / `pickAll` |
| 收窄类型 | `pick(..., { layers })` |
| 模型根节点 | `pick(pos, { root: model.root })` |
| 每帧贴地（当前视图内） | `sampleHeight` |
| 批量预计算路径高度 | `sampleHeightMostDetailed` |

## 高亮

`viewer.highlight` 统一选中态视觉；可直接传入 `ViewerPickResult`（`entity` 当前无高亮、会被忽略）：

- `Object3D` / `type: 'object'` → WebGL 后处理描边
- `Picked3DTilesFeature` / `type: 'tilesFeature'` → 半透明叠加几何
- `HismPickResult` / `type: 'hismInstance'` → 不可见 proxy + 描边

```ts
viewer.on('click', (event) => {
  if (event.pick) viewer.highlight.set(event.pick)
  else viewer.highlight.clear()
})
viewer.highlight.setHover(event.pick)
viewer.highlight.clear()
```

WebGPU 下描边不可用；Tiles overlay 仍可用。建议 `hism: { showPickMarker: false }` 与描边并用。
