# 实体绘制

实体（Entity）是 Tellux 在地球上绘制点、线、面三类矢量图形的高层抽象。一个实体可以挂载任意组合的点、折线、多边形图形组件，共享同一个 id、位置和自定义属性，并参与拾取和半透明合成。适合标注兴趣点、绘制路径、规划区块这类典型场景。

所有实体通过 `viewer.entities` 管理和绘制。

## 实体与图形组件

一个 `Entity` 由以下字段组成：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 实体 id，缺省时自动生成；同一 Viewer 内不可重复。 |
| `position` | `CartographicInput` | 实体经纬高位置，点图形与 symbol 图形会跟随它。 |
| `point` | `PointOptions` | 点图形配置。 |
| `polyline` | `PolylineOptions` | 折线图形配置。 |
| `polygon` | `PolygonOptions` | 多边形图形配置。 |
| `symbol` | `SymbolOptions` | 图标 + 文字标签配置（屏幕空间）。 |
| `properties` | `Record<string, unknown>` | 自定义属性，会在拾取结果中回传。 |
| `show` | `boolean` | 是否可见，默认 `true`。 |

`point`、`polyline`、`polygon` 可以任意组合，也可以只挂其中一个：

```ts
viewer.entities.add({
  id: 'poi-1',
  position: [121.4737, 31.2304, 50],
  point: { pixelSize: 12, color: '#ffd166', outlineColor: '#0f172a', outlineWidth: 2 },
  properties: { kind: 'poi', label: '陆家嘴' }
})
```

::: tip position 只驱动点与 symbol 图形
`position` 目前只影响点图形（`point`）与 symbol 图形（`symbol`）。折线和多边形各自带 `positions` 顶点序列，位置在创建时确定；之后修改 `entity.position` 不会移动已有的折线 / 多边形。
:::

## 点（point）

点图形用圆形纹理渲染，**恒定像素大小**（不随相机远近变化）。带描边时由一个较大的外环点叠加一个较小的内核点实现。

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `pixelSize` | `8` | 像素直径。 |
| `color` | 白色 | 填充颜色。 |
| `outlineColor` | — | 描边颜色；仅 `outlineWidth > 0` 时生效。 |
| `outlineWidth` | `0` | 描边像素宽度，`0` 表示无描边。 |

```ts
viewer.entities.add({
  position: [121.4737, 31.2304, 50],
  point: { pixelSize: 12, color: '#38bdf8', outlineColor: '#0f172a', outlineWidth: 2 }
})
```

创建后可通过运行时句柄 `entity.point` 修改颜色和大小：

```ts
const entity = viewer.entities.getById('poi-1')
entity.point.color = '#ff5555'
entity.point.pixelSize = 16
```

## 折线（polyline）

折线有两种渲染模式：

- **绝对高**（默认）：用 `Line2` 渲染**恒定像素宽度**的粗线，`width` 单位为像素。
- **贴地**：通过 GPU 深度分类把折线贴合到地形 / 3D Tiles 表面，随地形起伏。此时 `width` 语义变为**米**（贴地 ribbon 宽度），不再是像素。

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `positions` | — | 顶点经纬高序列。 |
| `width` | `2` | 像素宽度（绝对高）或米宽度（贴地）。 |
| `color` | 白色 | 颜色。 |
| `clamp` | `false` | `true` 时贴合地形与 3D Tiles；仅 WebGL。 |

```ts
// 绝对高折线
viewer.entities.add({
  polyline: {
    positions: [[121.46, 31.23, 50], [121.48, 31.24, 50], [121.49, 31.22, 50]],
    width: 3,
    color: '#f472b6'
  }
})

// 贴地折线（贴合地形起伏）
viewer.entities.add({
  polyline: {
    positions: [[121.46, 31.23], [121.48, 31.24], [121.49, 31.22]],
    width: 6,        // 米
    color: '#f472b6',
    clamp: true
  }
})
```

绝对高折线支持运行时句柄 `entity.polyline`（修改 `color` / `width`）；**贴地折线不暴露运行时句柄**，如需修改请移除后重建。

## 多边形（polygon）

多边形有三种形态：

- **平面多边形**：只给 `positions` 和 `height`，渲染为贴在指定高度的平面。
- **拉伸体块**：同时给 `height`（底面）和 `extrudeHeight`（顶面），渲染为拉伸体。
- **贴地多边形**：`clamp: true`，贴合地形 / 3D Tiles 起伏，支持凹多边形。

平面与拉伸多边形在第一顶点的当地切平面内构建，使用不受光的材质；可选描边用边线绘制。

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `positions` | — | 外环顶点经纬高序列。 |
| `height` | `0` | 底面高度（米）。 |
| `extrudeHeight` | — | 拉伸顶面高度（米）；缺省时为平面。 |
| `fill` | `true` | 是否填充。 |
| `color` | 白色 | 填充颜色，支持 `rgba(...)` / `#rrggbbaa` 的 alpha。 |
| `outline` | `false` | 是否显示描边。 |
| `outlineColor` | — | 描边颜色。 |
| `clamp` | `false` | `true` 时贴合地形与 3D Tiles；仅 WebGL。 |

```ts
// 平面多边形
viewer.entities.add({
  polygon: {
    positions: [[121.46, 31.23], [121.48, 31.23], [121.48, 31.22], [121.46, 31.22]],
    height: 50,
    color: 'rgba(45, 212, 191, 0.35)',
    outline: true,
    outlineColor: '#5eead4'
  }
})

// 拉伸体块
viewer.entities.add({
  polygon: {
    positions: [[121.47, 31.229], [121.472, 31.229], [121.472, 31.231], [121.47, 31.231]],
    height: 50,
    extrudeHeight: 350,
    color: 'rgba(244, 114, 182, 0.55)',
    outline: true,
    outlineColor: '#f9a8d4'
  }
})

// 贴地多边形
viewer.entities.add({
  polygon: {
    positions: [[121.46, 31.23], [121.48, 31.23], [121.48, 31.22], [121.46, 31.22]],
    color: 'rgba(45, 212, 191, 0.5)',
    clamp: true
  }
})
```

与折线一样，平面 / 拉伸多边形支持运行时句柄 `entity.polygon`（修改 `color` / `outlineColor`）；**贴地多边形不暴露运行时句柄**。

::: warning 贴地多边形不支持 height / extrudeHeight / outline
贴地时 `height` 被忽略，`extrudeHeight` 和 `outline` 暂未支持（会告警并忽略）。需要拉伸体或描边时请使用绝对高模式。
:::

## 图标与文字标签（symbol）

Symbol 是点锚定的屏幕空间标注：一个图标（billboard）+ 一段文字标签，共享同一个锚点，始终面向屏幕。图标与文字用 **SDF（有符号距离场）** 渲染——任意缩放保持锐利，描边 / halo 距离化抗锯齿，颜色作为 shader uniform（改色不重建纹理）。对标 Mapbox GL `symbol` layer 与 Cesium `Billboard` / `Label`。

`icon` 与 `text` 可任意组合：仅图标、仅文字、或二者同在。二者同在时按 `textRelative` 排布，组合体按 `anchor` 对齐到实体 `position`。

```ts
viewer.entities.add({
  position: [121.4737, 31.2304, 50],
  symbol: {
    icon: { image: '/markers/poi.png', scale: 1, color: '#ef4444' },
    text: { text: '陆家嘴', fillColor: '#ffffff', outlineColor: '#0f172a', outlineWidth: 2 },
    anchor: 'bottom',
    textRelative: 'right',
  },
  properties: { kind: 'poi', label: '陆家嘴' },
})
```

::: tip 图标按 alpha 剪影渲染
SDF 方案下，图标按其 alpha 通道作为剪影生成距离场：可任意缩放保持锐利、用 `color` 染色、支持距离化描边。需要承载彩色照片的 billboard 不在此方案内（可后续扩展）。
:::

### 图标（icon）

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `image` | — | 图标来源：URL / `Image` / `Canvas` / `THREE.Texture`。URL 会跨实体共享同一张 SDF 纹理。 |
| `scale` | `1` | 缩放。 |
| `color` | 白色 | tint 染色；在 Symbol 后合成 pass 中直接显示目标色。 |
| `opacity` | `1` | 透明度。 |

### 文字（text）

文字用 canvas 光栅化（仅 alpha 覆盖）后生成 SDF 纹理：改 `fillColor` / `outlineColor` / `backgroundColor` 不重建纹理（即时生效），改 `text` / `fontSize` 才重建。

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `text` | — | 文本内容；支持 `\n` 手动换行。 |
| `font` | `'sans-serif'` | 字体族（复用浏览器系统字体，中文零成本）。 |
| `fontSize` | `16` | 字号（CSS 像素）。 |
| `fontWeight` | `'normal'` | 字重。 |
| `fillColor` | 白色 | 填充色（WYSIWYG）。 |
| `outlineColor` | — | 描边色；仅 `outlineWidth > 0` 生效。 |
| `outlineWidth` | `0` | 描边像素宽，字形外圈距离化抗锯齿。 |
| `backgroundColor` | 透明 | 背景色（圆角矩形）。 |
| `backgroundCornerRadius` | `0` | 背景圆角半径（CSS 像素）。 |
| `padding` | `[4, 2]` | 背景内边距 `[x, y]`（CSS 像素）。 |
| `lineHeight` | `1.2` | 行高倍数。 |
| `maxWidth` | — | 最大宽度（CSS 像素），超出按词换行；缺省不换行。 |
| `opacity` | `1` | 透明度，同时作用于文字与背景。 |

### 排布

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `anchor` | `'bottom'` | 组合体（icon+text）的哪个位置对齐到 `position`。 |
| `pixelOffset` | `[0, 0]` | 相对锚点的像素偏移 `[dx, dy]`（x 向右、y 向上）。 |
| `textRelative` | `'right'` | text 相对 icon 的方向（`left` / `right` / `top` / `bottom`）。 |
| `textIconSpacing` | `2` | icon 与 text 间距（CSS 像素）。 |
| `rotation` | `0` | 旋转（弧度，屏幕空间逆时针）。 |

### 运行时句柄

`entity.symbol` 返回 `SymbolGraphics` 句柄，可改 `rotation` / `pixelOffset`；其下的 `entity.symbol.icon`（`IconGraphics`）与 `entity.symbol.text`（`TextGraphics`）分别改图标与文字属性：

```ts
const entity = viewer.entities.getById('poi-0')
entity.symbol.text.fillColor = '#ff5555'   // 改色不重建纹理
entity.symbol.text.text = '新名称'          // 改文字会重建
entity.symbol.icon.scale = 1.2
```

::: tip 半透明与拾取
Symbol 由独立的锚点遮挡 pass 绘制：锚点被地形 / 3D Tiles / 模型遮挡时，整个图标与文字隐藏；锚点可见时，整个组合体显示。拾取按命中点 UV 采样 SDF alpha，透明像素不命中——点击图标的透明边距不会误选。
:::

## 贴地（clamp）

稳定 API 目前只在折线和多边形上提供布尔 `clamp`。`true` 会使用主场景深度把图形贴到 terrain 与 3D Tiles 的可见并集；缺省或 `false` 使用绝对椭球高。

| 取值 | 含义 |
| --- | --- |
| 缺省 / `false` | 绝对椭球高，不贴地。 |
| `true` | 贴合 terrain 与 3D Tiles 的可见并集。 |

```ts
// 贴地，terrain 与 3D Tiles 取可见并集
clamp: true
```

贴地通过 GPU 深度分类实现：片元着色器读取主场景深度纹理还原地表点，逐像素判定是否落在图形 footprint 内，因此能随地形 / 3D Tiles 起伏贴合，且几何不随地形 LOD 重建。**仅 WebGL 支持**（WebGPU 下无贴地 pass，会降级为绝对高并告警）。

当前实现进度：

| 能力 | 状态 |
| --- | --- |
| 折线 / 多边形 `clamp: true` | ✅ 已实现（WebGL） |
| 贴地多边形 `extrudeHeight` / `outline` | ❌ 不支持，告警忽略 |
| 点 / Symbol 贴地、正向偏移、分离深度源 | 🧭 路线图能力，尚未进入公开类型 |

## 实体管理

`viewer.entities` 提供增删查改接口：

```ts
// 新增（返回 Entity）
const entity = viewer.entities.add({ point: { /* ... */ } })

// 按 id 查询
const entity = viewer.entities.getById('poi-1')

// 是否存在
viewer.entities.contains('poi-1')

// 遍历所有实体
viewer.entities.values.forEach((e) => { /* ... */ })

// 移除（传 id 或实体）
viewer.entities.remove('poi-1')
viewer.entities.remove(entity)

// 清空全部
viewer.entities.removeAll()
```

实体本身的运行时属性：

- `entity.id` — 只读 id。
- `entity.show` — 显隐切换。
- `entity.position` — 经纬高；驱动点图形与 symbol 图形。
- `entity.properties` — 自定义属性对象，可读写，拾取时回传。
- `entity.point` / `entity.polyline` / `entity.polygon` / `entity.symbol` — 对应图形的运行时句柄，未挂载或贴地时为 `null`。

```ts
const entity = viewer.entities.getById('poi-1')
entity.show = false
entity.properties.label = '新名称'
```

## 颜色与半透明

颜色字段接受 `ColorInput`：数值 hex（`0xffd166`）、CSS 颜色字符串（`'#ffd166'`、`'rgba(...)'`）或 `THREE.Color` 实例。

Tellux 内置 AgX 色调映射。点、线、面在主色调映射链内渲染，因此通过 `resolveColor()` 做反求补偿；Symbol 位于后合成链，使用 `resolveDisplayColor()` 直接把输入颜色转换到显示空间。两条路径都保持所见即所得（WYSIWYG），调用侧无需手动补偿。

半透明填充（如 `rgba(...)` 或 `#rrggbbaa`）由实体专用的 OIT（顺序无关透明）pass 合成，避免多个半透明面相互穿插时的排序错误。透明模式在 `scene.entities.transparency.mode` 配置：

| 模式 | 说明 |
| --- | --- |
| `'auto'`（默认） | WebGL 下使用 weighted OIT，否则退回排序透明。 |
| `'weighted-oit'` | 强制 weighted blended OIT（仅 WebGL）。 |
| `'sorted'` | 使用 Three.js 默认透明排序。 |

```ts
const viewer = new tellux.Viewer(container, {
  scene: {
    entities: { transparency: { mode: 'weighted-oit' } }
  }
})
```

## 拾取

实体参与 Tellux 的拾取体系（详见「[交互与拾取](./interaction)」）：

- 鼠标事件 `event.pick` / `event.picks` 中 `type === 'entity'` 的项为实体命中；`click` 为完整列表，`mousemove` 仅为最近一条。
- `viewer.pick(position, { layers: ['entity'], tolerance })` 取最佳命中；`pickAll` 取列表。
- 点和线实体支持 `tolerance` 屏幕空间容差（CSS 像素），面实体和拉伸体走精确 raycaster。

点击实体时，其 `properties` 会随拾取结果回传，可用于关联业务数据：

```ts
viewer.on('click', (event) => {
  const hit = event.pick?.type === 'entity' ? event.pick.entity : null
  if (hit) {
    console.log(hit.entity.id, hit.entity.properties)
  }
})
```

## 限制与后续

当前实体模块的能力边界：

| 能力 | 状态 |
| --- | --- |
| 点 / 折线 / 多边形（绝对高） | ✅ |
| 折线 / 多边形真·贴地（`clamp: true`，WebGL） | ✅ |
| 半透明 OIT 合成（WebGL） | ✅ |
| 图标 + 文字标签（Symbol 实体，SDF 渲染） | ✅ |
| 点 / Symbol 贴地、正向偏移与分离深度源 | 🧭 路线图，未进入稳定 API |
| Symbol 米制尺寸与距离衰减 | 🧭 路线图，未进入稳定 API |

Symbol 实体已实现，详见上方「图标与文字标签」一节；设计取舍见 [Symbol 实体设计文档](../design/symbol-entity.md)。

贴地相关的实现细节与设计取舍见 [贴地设计文档](../design/ground-clamp.md)。
