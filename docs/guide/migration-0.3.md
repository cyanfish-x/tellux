# 从 0.2 迁移到 0.3

公开 API 已收敛为稳定形状，随 **0.3** 发布。0.2 的顶层拍平方法、错误路径和分裂形状已删除，没有兼容层。本文给出旧写法到新写法的对照。

初始化路径与运行时路径同构：`postProcess.toneMappingExposure` 既是 `ViewerOptions.postProcess.toneMappingExposure`，也是 `viewer.postProcess.toneMappingExposure`。

## 领域门面

| 0.2 | 0.3 |
| --- | --- |
| `viewer.layers` | `viewer.overlays` |
| `ViewerOptions.layers` | `ViewerOptions.overlays` |
| `viewer.tileset`（裸球 / 地形 renderer） | `viewer.globe`（`show` / `ellipsoid` / `raw`） |
| `viewer.load3DTileset` / `get3DTileset` / `remove3DTileset` | `viewer.tilesets.add` / `.get` / `.remove` |
| `viewer.setTerrain(options)` / `setTerrain(null)` | `viewer.terrain.set(options)` / `viewer.terrain.clear()` |
| `viewer.addModel` | `viewer.models.add` |
| `viewer.highlight` | `viewer.highlighter` |
| `viewer.scene.highlight` | `viewer.highlighter.outline` / `.overlay` |
| `ViewerOptions.scene.highlight` | `ViewerOptions.highlighter` |
| `viewer.scene.postProcess` | `viewer.postProcess` |
| `ViewerOptions.scene.postProcess` | `ViewerOptions.postProcess` |
| `viewer.toneMappingExposure` | `viewer.postProcess.toneMappingExposure` |
| `viewer.threeScene` / `viewer.scene.threeScene` | `viewer.scene.raw` |
| `viewer.threeCamera` / `viewer.camera.threeCamera` | `viewer.camera.raw` |
| `viewer.renderer`（裸 Three.js 对象） | `viewer.renderer` 门面；原生对象是 `viewer.renderer.raw` |
| `viewer.resolutionScale` | `viewer.renderer.resolutionScale` |
| `ViewerOptions.resolutionScale` | `ViewerOptions.renderer.resolutionScale` |
| `viewer.addHismLayer` 等顶层方法 | `viewer.hism.add` / `.get` / `.remove` |
| `LayerManager.getAll()` | `viewer.overlays.list()` |
| `widgets.settingPanel` | `widgets.settingsPanel` |

原生对象出口统一为 `.raw`。`viewer.controls.raw === viewer.controls`（同一实例，只是类型未收窄）；`renderer.raw` / `globe.raw` / `scene.raw` / `camera.raw` 指向被门面包起来的另一个对象。

## 3D Tiles 数据源

图层级字段（`id` / `show`）与数据源拆开，和影像 overlay 一样用 `{ source }`：

```ts
// 0.2
viewer.load3DTileset({
  type: 'url',
  id: 'city',
  url: 'https://example.com/tileset.json',
  creasedNormals: true
})

// 0.3
viewer.tilesets.add({
  id: 'city',
  source: {
    type: 'url',
    url: 'https://example.com/tileset.json'
  },
  creasedNormals: true
})
```

Cesium Ion 同理：`source: { type: 'cesium-ion', assetId, apiToken }`。

## 地形与影像

URL 地形必须带 `type: 'url'`。天地图令牌字段从 `token` 改为 `apiToken`。影像 / 模型可见性字段从 `visible` 改为 `show`。

```ts
// 0.2
new Viewer(el, {
  layers: [{ source: { type: 'xyz', url } }],
  terrain: { url: 'https://example.com/terrain/' }
})
viewer.setTerrain(null)

// 0.3
new Viewer(el, {
  overlays: [{ source: { type: 'xyz', url } }],
  terrain: { type: 'url', url: 'https://example.com/terrain/' }
})
viewer.terrain.clear()
```

隐藏裸球 / 地形用 `viewer.globe.show = false`，不要写 `viewer.globe.raw.group.visible`。

## 相机

初始化 `camera.destination` 必须带高度（`LonLatHeightLike`）。运行时 `flyTo` / `setView` 的 `destination` 可以是无高度的 `LonLatLike`，此时保持当前高度。

```ts
// 0.2
camera: {
  longitude: 121.4737,
  latitude: 31.2304,
  height: 1200,
  pitch: -25,
  far: 3e7
}

// 0.3
camera: {
  destination: { longitude: 121.4737, latitude: 31.2304, height: 1200 },
  orientation: { pitch: -25 },
  projection: { far: 3e7 }
}
```

`camera.getState()` 已返回 `{ destination, orientation }`，可直接交给 `setView`。

## 坐标类型

| 0.2 | 0.3 |
| --- | --- |
| `CartographicInput` 等 | `LonLat` / `LonLatHeight` / `LonLatLike` / `LonLatHeightLike` |

`LonLat` 只有经纬度；`LonLatHeight` 高度必填。实现不会把缺省高度补成 `0`。采样入参是 `LonLatLike`（不要靠元组第三位当高度）。未命中返回 `undefined`，高度 `0` 是命中，用 `=== undefined` 判断 miss。

`sampleHeight` / `sampleHeightMostDetailed` 各有单点与批量两个重载：批量同步版与逐点结果逐元素相等。

## 实体描边与文字

描边是可选子对象：存在即开启，没有 `boolean` 联合，没有 `enabled`。`outline.width` 默认 `1`。

```ts
// 0.2
point: { color: '#38bdf8', outlineColor: '#0f172a', outlineWidth: 2 }
text: { fillColor: '#ffffff', outlineColor: '#0f172a', outlineWidth: 2 }
polygon: { outline: true, outlineColor: '#5eead4' }

// 0.3
point: { color: '#38bdf8', outline: { color: '#0f172a', width: 2 } }
text: { color: '#ffffff', outline: { color: '#0f172a', width: 2 } }
polygon: { outline: { color: '#5eead4' } }
```

文字运行时句柄是 `symbol.text.color`，不再使用 `fillColor`。点、多边形和文字的运行时描边统一为 `outline.color`，点与文字还支持 `outline.width`；旧 `outlineColor` / `outlineWidth` 已移除。初始化未提供描边时，运行时 `outline` 为 `undefined`，不可新增或替换；已配置的点和文字可用宽度 `0` 隐藏，改回正数恢复。

## 后处理与高亮

```ts
// 0.2
scene: {
  postProcess: { toneMappingExposure: 5, taa: true },
  highlight: { outline: { enabled: false } }
}
viewer.toneMappingExposure = 8
viewer.highlight.set(pick)

// 0.3
postProcess: { toneMappingExposure: 5, taa: true }
highlighter: { outline: { enabled: false } }
viewer.postProcess.toneMappingExposure = 8
viewer.highlighter.set(pick)
```

`fallbackAmbientLight` 的开关是 `enabled`，不是 `show`。

## 调试面板

`widgets.settingsPanel` 的初始值改为嵌套：`atmosphere` / `clouds` / `postProcess` / `renderer` / `showFps`。localStorage 键版本为 `v2`，旧扁平缓存不会自动迁移。

## 控制器

`viewer.controls` 的公开类型是 `ViewerControls`，只承诺交互开关、距离/俯仰、事件与生命周期。上游 `GlobeControls` 其余成员走 `viewer.controls.raw`。
