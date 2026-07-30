# 交互与拾取

Tellux 提供了从鼠标事件、屏幕拾取到高度采样三层递进的空间查询能力，覆盖"点击看坐标"、"画路径前采样地表高度"等典型 GIS 工作流。

## 两域拾取

| 域 | API | 说明 |
| --- | --- | --- |
| 地表坐标 | `viewer.pickCartographic(position)` | 经纬高查询；不并入对象拾取。 |
| 可选中对象 | `viewer.pick` / `viewer.pickAll` | 实体、HISM 实例、3D Tiles feature、Three.js 对象。 |

## 鼠标事件

通过 `viewer.on(type, listener)` 监听 canvas 上的鼠标事件。目前支持 `click` 和 `mousemove`：

```ts
const onClick = (event) => {
  console.log('像素坐标', event.position)
  console.log('经纬高', event.cartographic)
  console.log('最近命中', event.pick)
  console.log('全部命中', event.picks)
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
| `pick` | `ViewerPickResult \| null` | 最近命中的可选中对象。 |
| `picks` | `ViewerPickResult[]` | 命中列表。`click` 为完整 drill（近→远）；`mousemove` 仅为最近一条（与 `pick` 同构的单元素或空）。 |

事件中的实体拾取会对点和线使用默认屏幕空间容差：`click` 为 6 CSS 像素，`mousemove` 为 4 CSS 像素。3D Tiles、面实体和体实体仍使用原有精确拾取逻辑。

按类型读取命中：

```ts
viewer.on('click', (event) => {
  if (event.pick?.type === 'tilesFeature') {
    console.log(event.pick.feature.properties)
  } else if (event.pick?.type === 'entity') {
    console.log(event.pick.entity.entity.id)
  } else if (event.pick?.type === 'hismInstance') {
    console.log(event.pick.instance.instanceId)
  }
})
```

关于如何创建可被拾取的点、线、面实体，见「[实体绘制](./entities)」。

`mousemove` 事件触发频率较高：事件内只做 **nearest-only** 拾取（每层最近再比全局最近），避免每帧完整 drill。若业务需要完整叠层列表，可自行调用 `viewer.pickAll(event.position)`（建议节流）。

## 屏幕拾取

### `pickCartographic(position)`

把屏幕像素坐标转成经纬高。**优先命中已加载的 3D Tiles**，未命中时回退到 WGS84 椭球表面；两者都没命中返回 `null`。

```ts
const cartographic = viewer.pickCartographic({ x: 400, y: 300 })
if (cartographic) {
  console.log(cartographic.latitude, cartographic.longitude, cartographic.height)
}
```

适用于"点击空白处取坐标"这类需求。

### `pick(position, options?)` / `pickAll(position, options?)`

统一对象拾取。返回判别联合 `ViewerPickResult`：

```ts
type ViewerPickResult =
  | { type: 'entity'; distance: number; entity: PickedEntity }
  | { type: 'tilesFeature'; distance: number; feature: Picked3DTilesFeature }
  | { type: 'hismInstance'; distance: number; instance: HismPickResult }
  | { type: 'object'; distance: number; object: PickedObject }
```

- `pick`：每层只取最近命中，再取全局最近。
- `pickAll`：合并各层全部命中，每个逻辑对象只返回一次，再按距离由近到远排序。Entity、HISM 逻辑实例和 Object3D 分别按自身身份去重；3D Tiles 按对象与 feature 组合去重。

```ts
const hit = viewer.pick({ x: 400, y: 300 })
if (hit?.type === 'tilesFeature') {
  console.log(hit.feature.properties)
}

const hits = viewer.pickAll({ x: 400, y: 300 })
```

`ViewerPickOptions`：

| 字段 | 说明 |
| --- | --- |
| `layers` | 参与拾取的层：`'entity'` \| `'hismInstance'` \| `'tilesFeature'` \| `'object'`。 |
| `root` | object 层根节点；传入且未指定 `layers` 时，默认只测 `['object']`。 |
| `recursive` | object 层是否递归子节点。 |
| `tolerance` | 点 / 线实体屏幕容差（CSS 像素）。 |
| `limit` | `pickAll` 最多返回的非负整数条数；在跨层全局排序后截取，默认不限制。 |

**默认 `layers`**：`['entity', 'hismInstance', 'tilesFeature']`。未注册 HISM 图层时会自动跳过 `hismInstance`。无 `root` 时默认**不含** `object`，避免整 scene 拾取打到地形瓦片 mesh。

`limit` 只约束返回结果，不会提前终止各层的射线遍历。高频或大规模场景仍应收窄 `layers`，并对显式 `pickAll` 调用做节流。

收窄层（例如只要 HISM，或悬停只要 Tiles）：

```ts
viewer.pick(pos, { layers: ['hismInstance'] })
viewer.pick(pos, { layers: ['tilesFeature'] })
viewer.pick(pos, { root: model.root }) // 默认仅 object 层
```

`Picked3DTilesFeature` 主要字段：`layerId`、`tileset`、`object` / `point`、`faceIndex`、`featureId`、`properties`、`cartographic`。

> 拾取类方法都只针对**当前已加载到场景中的内容**。视角外或尚未加载的瓦片不会被请求。

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
| 点击查询可选中对象 | `event.pick` / `event.picks`，或 `viewer.pick` / `pickAll` |
| 只要某一类对象 | `pick(..., { layers: [...] })` |
| 点击模型根节点 | `pick(pos, { root: model.root })` |
| 完整叠层列表（含 mousemove） | `viewer.pickAll(event.position)`（建议节流） |
| 每帧让对象贴地（高频、当前视图内） | `sampleHeight` |
| 批量预计算路径地表高度（可能跨视图） | `sampleHeightMostDetailed` |

## 高亮

拾取之后若需要视觉选中态，使用统一门面 `viewer.highlight`：整对象走后处理描边，3D Tiles feature 走叠加几何，HISM 实例走 proxy 描边。`viewer.highlight.set(viewer.pick(pos))` 可直接传入 `ViewerPickResult`（`entity` 类型当前无高亮，会被忽略）。详见「[高亮](./highlight)」。

```ts
viewer.on('click', (event) => {
  if (event.pick) viewer.highlight.set(event.pick)
  else viewer.highlight.clear()
})
```
