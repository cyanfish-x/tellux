# 核心 API：Viewer / 相机 / 图层 / 地形 / 3D Tiles / 模型

本文件覆盖使用 Tellux 的 80% 高频场景。示例代码中的 `url` 使用占位域名 `example.com`。

## 初始化 Viewer

```ts
import tellux from 'tellux'

const viewer = new tellux.Viewer('viewer', {
  // 初始影像图层（数组顺序 = 从下到上绘制）
  overlays: [
    {
      name: 'ArcGIS 影像',
      source: {
        type: 'xyz',
        url: 'https://example.com/imagery/{z}/{y}/{x}',
        levels: 19
      }
    }
  ],
  // Cesium Ion 世界地形（asset id 1）
  terrain: {
    type: 'cesium-ion',
    assetId: 1,
    apiToken: import.meta.env.VITE_CESIUM_ION_TOKEN,
    tileLoading: { enableTileSplitting: true }
  },
  // 初始相机：经纬度/姿态用「度」，高度用「米」
  camera: {
      destination: {
        longitude: 121.4737,
        latitude: 31.2304,
        height: 1200,
      },
      orientation: {
        pitch: -25,
      },
    },
  scene: {
    atmosphere: { lighting: { mode: 'light-source' } },
    clouds: { show: false }
  }
})

window.addEventListener('beforeunload', () => viewer.destroy())
```

### WebGPU 初始化（异步）

```ts
const viewer = await tellux.Viewer.create(container, {
  renderer: { type: 'webgpu' },
  scene: { clouds: { show: false } }   // 体积云在 WebGPU 下不渲染，建议关掉
})
```

### 顶层常用属性

```ts
viewer.scene          // 场景控制（大气/云/地表）— 见 scene-effects.md
viewer.camera         // 相机 — 见下文
viewer.overlays       // 影像图层管理器 — 见下文
viewer.tilesets       // 场景 3D Tiles
viewer.models         // glTF 模型
viewer.terrain        // 地形门面
viewer.globe          // 裸球 / 地形表面（show / ellipsoid / raw）
viewer.postProcess    // 后处理（曝光、Bloom、TAA）
viewer.highlighter    // 统一高亮
viewer.controls       // 地球交互控制器（拖拽/滚轮）；完整 API 在 .raw
viewer.clock          // 统一场景模拟时钟（内置驱动太阳、月亮和大气）
viewer.renderer       // 渲染器门面；原生对象是 renderer.raw
```

### 场景时钟

初始化时 `currentTime` 支持 `Date | string | number`；运行时只赋值有效 `Date`。读取和赋值都会复制 `Date`：

```ts
const viewer = new tellux.Viewer(container, {
  clock: {
    currentTime: new Date('2026-09-01T08:00:00Z'),
    shouldAnimate: true,
    multiplier: 3600
  }
})

viewer.clock.currentTime = new Date()
viewer.clock.shouldAnimate = false
viewer.clock.on('tick', ({ currentTime }) => {
  // 可在这里驱动应用自己的轨迹或业务时间状态
})
```

负 `multiplier` 表示倒放。Viewer 已在渲染循环中调用 `clock.tick()`，应用侧不要重复推进。

Timeline 显示和交互使用浏览器本地时区；`viewer.clock.currentTime` 本身仍是绝对时间点。
启用 Timeline 且未显式配置 Clock 时，默认从当前真实时间开始以 `1×` 流动；显式设置 `clock.shouldAnimate: false` 可保持暂停。

## 相机

视角用 经纬高 + heading/pitch/roll 描述，全用「度」，相对当地东北天（ENU）。

### 飞行定位 `camera.flyTo`

```ts
viewer.camera.flyTo({
  destination: { latitude: 39.9042, longitude: 116.4074, height: 1500 },
  orientation: { heading: 45, pitch: -30, roll: 0 },
  duration: 2,            // 秒；省略时按距离自动估算
  maximumHeight: 5000000, // 弧线飞行的最高高度，避免长距离贴地穿行
  complete: () => console.log('到达'),
  cancel: () => console.log('被打断')
})
```

### 飞向目标对象 `flyToTarget`

支持经纬高点位 / Three.js 对象 / 3D Tiles renderer（后两者用包围体中心）：

```ts
// 经纬高点位
viewer.flyToTarget(
  { latitude: 31.2304, longitude: 121.4737, height: 0 },
  { distance: 800, pitch: -30, duration: 2 }
)

// 3D Tiles 图层（根 tileset 未加载时会等加载完再飞）
viewer.flyToTarget(layer.tileset, { distance: 1200, heading: 30, pitch: -35 })

// 自定义 Three.js 对象
viewer.flyToTarget(customObject3D, { distance: 500 })
```

`distance` 默认 `max(包围体半径 × 2.8, 500)`，`heading` 默认 `0`，`pitch` 默认 `-30`。

### 瞬时切换 / 取消 / 读取

```ts
viewer.camera.setView({
  destination: { latitude: 39.9, longitude: 116.4, height: 2000 },
  orientation: { pitch: -45 }
})
viewer.camera.cancelFlight()                       // 取消进行中的飞行
const height = viewer.camera.getCurrentHeight()    // 当前海拔（米）
const state = viewer.camera.getState()             // 完整视角，可回传给 setView
const threeCam = viewer.camera.raw         // 底层 THREE.PerspectiveCamera
```

## 影像图层

全部通过 `viewer.overlays` 管理。`add()` 返回图层句柄，可链式调用。

### 数据源（`source.type`）

| type | 适用 | 关键字段 |
| --- | --- | --- |
| `xyz` | 栅格瓦片底图 | `url`（支持 `{x}{y}{z}`）、`levels`(默认20) |
| `wms` | WMS 服务 | `url`、`layer`、`crs`(默认 EPSG:4326)、`transparent` |
| `wmts` | WMTS 服务 | `url`、`layer`、`tileMatrixSet`、`projection`、`format` |
| `mvt` | 矢量瓦片 | `url`、`levels`、`resolution`(默认512)，需装 `@mapbox/vector-tile` `pbf` |
| `geojson` | 矢量边界 | `geojson`(对象) 或 `url`、`resolution`(默认256) |
| `cesium-ion` | Ion 影像 | `apiToken`、`assetId` |

```ts
// XYZ 底图
viewer.overlays.add({
  name: 'ArcGIS 影像',
  source: { type: 'xyz', url: 'https://example.com/imagery/{z}/{y}/{x}', levels: 19 }
})

// WMS（NASA GIBS 土地覆盖）
viewer.overlays.add({
  name: '土地覆盖',
  source: {
    type: 'wms',
    url: 'https://example.com/wms',
    layer: 'MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual',
    version: '1.1.1', crs: 'EPSG:4326', format: 'image/png',
    transparent: true, tileDimension: 512,
    contentBoundingBox: [-180, -90, 180, 90],
    preprocessURL(url) { const u = new URL(url); u.searchParams.set('TIME', '2024-01-01'); return u.toString() }
  },
  style: { opacity: 0.82 }
})

// WMTS（天地图影像，需 tk 密钥）
viewer.overlays.add({
  name: '天地图影像',
  source: {
    type: 'wmts',
    url: 'https://example.com/wmts',
    layer: 'img',
    tileMatrixSet: 'w',
    format: 'tiles',
    projection: 'EPSG:3857',
    levels: 18,
    preprocessURL(url) {
      const u = new URL(url)
      u.searchParams.set('tk', YOUR_TIANDITU_TOKEN)
      return u.toString()
    }
  }
})

// GeoJSON
viewer.overlays.add({
  name: '行政区',
  source: { type: 'geojson', url: '/data/districts.geojson', resolution: 1024 },
  style: { fill: 'rgba(20,184,166,0.14)', stroke: '#ff0000', strokeWidth: 3 }
})

// MVT（按图层名区分样式）
viewer.overlays.add({
  name: '电力设施',
  source: { type: 'mvt', url: 'https://example.com/tiles/{z}/{x}/{y}.pbf', levels: 15, resolution: 1024 },
  style: {
    getStyle(layerName, properties) {
      if (layerName === 'power_line') return { stroke: '#e6b800', strokeWidth: 2 }
      return { visible: false }
    }
  }
})
```

> GeoJSON / MVT 是把矢量**栅格化成纹理**贴地表，样式以像素为单位，受 `resolution` 影响，极度放大时会模糊。

### 图层管理（句柄方法）

```ts
const layer = viewer.overlays.add({ source: { /*...*/ } })

layer.show = false                    // 显隐（或 layer.setVisible(true)）
layer.setStyle({ opacity: 0.5 })      // 样式（opacity / color / fill / stroke...）
layer.moveTo(0)                       // 调整顺序到底层
layer.setName('新名字')
layer.remove()                        // 移除

// 管理器层面
viewer.overlays.get('id')               // 按 id 查找，不存在返回 null
viewer.overlays.getAll()                // 全部（返回副本）
viewer.overlays.move('id', 2)
viewer.overlays.remove('id')
viewer.overlays.removeAll()
```

### 矢量样式回调

| 图层类型 | getStyle 签名 | 返回 null 含义 |
| --- | --- | --- |
| geojson | `(feature, properties) => style \| null` | 不渲染该 feature |
| mvt | `(layerName, properties) => style \| null` | `properties` 为 null 时仅查询绘制 `order` |

## 地形

只支持 **Cesium quantized-mesh** 格式（自托管 url 或 cesium-ion）。运行时可热切换：

```ts
// 初始化
new tellux.Viewer(container, {
  terrain: { type: 'url', url: 'https://example.com/terrain/layer.json' }
  // 或 cesium-ion: { type: 'cesium-ion', assetId: 1, apiToken }
})

// 运行时切换 / 移除
viewer.terrain.set({ type: 'url', url: 'https://example.com/another/' })
viewer.terrain.clear()
```

`tileLoading` 调参：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `errorTarget` | 1 | 屏幕空间误差，越小越精细、越耗资源 |
| `imageryResolution` | 256 | 地形瓦片合成影像纹理的画布分辨率 |
| `enableTileSplitting` | false | 拆分地形瓦片贴合影像边界，提升清晰度 |

## 3D Tiles

作为**独立场景数据**加载，不参与影像 overlay 管线。

```ts
// 从 tileset.json
const layer = viewer.tilesets.add({
  id: 'city',
  source: {
    type: 'url',
    url: 'https://example.com/tileset.json'
  }
})

// 从 Cesium Ion
const layer = viewer.tilesets.add({
  id: 'photo',
  source: { type: 'cesium-ion', apiToken, assetId: 75343 }
})

// 定位过去
viewer.flyToTarget(layer.tileset, { distance: 1200, pitch: -35 })

// 句柄：TilesetLayer
layer.show = false
layer.remove()
viewer.tilesets.get('city')
viewer.tilesets.remove('city')
```

`materialMode` 和 `creasedNormals`：

- `materialMode: 'unlit'`：强制不受光材质，用于 post-process 光照场景（默认随光照模式）。
- `creasedNormals: true`：为摄影测量瓦片重生成折痕法线，改善后处理光照边缘（增加加载 CPU 成本）。

`pointCloudShading`（Cesium 形点云着色；Tellux 默认关闭 attenuation / EDL）：

```ts
viewer.tilesets.add({
  source: {
    type: 'cesium-ion',
    apiToken,
    assetId: 43978
  },
  pointCloudShading: {
    attenuation: true,
    eyeDomeLighting: true,
    maximumAttenuation: 8,
  },
})

layer.pointCloudShading.eyeDomeLightingStrength = 1.2
```

无法线点云按 unlit 处理：保留原始顶点色，不重建法线，也不接受场景光照。WebGL 全屏 AgX output pass 下由引擎自动做显示色逆变换，避免 Viewer 曝光把点色冲白；这属于颜色管理，不是光照。attenuation 调节点大小；EDL 仅按深度增强轮廓。EDL 依赖 WebGL 后处理，WebGPU 下不可用或降级；不宣称与 Cesium 渲染结果像素一致。

`tileLoading`（场景 3D Tiles LOD）：

```ts
viewer.tilesets.add({
  source: {
    type: 'url',
    url: '/3dtiles/hk/tileset.json'
  },
  creasedNormals: true,
  tileLoading: {
    errorTarget: 4,      // 目标屏幕空间误差（像素），越小越细，默认 16
    loadSiblings: true,  // 细化时一并加载兄弟瓦片，默认 true
  },
})
```

## 模型（glTF / GLB）

`models.add` 按经纬高放置，内部处理矩阵计算和 Draco 解码：

```ts
const model = viewer.models.add({
  type: 'gltf',
  url: '/models/wind-turbine.glb',
  coordinates: { longitude: 121.4737, latitude: 31.2304, height: 0 },
  heading: 180,
  scale: 1,
  animate: true,          // 加载完自动播第 0 通道
  animationChannel: 0
})

await model.ready         // 等待加载
viewer.flyToTarget(model.root, { distance: 500 })

model.playAnimation(1)    // 播指定通道
model.pauseAnimation()
model.stopAnimation()
model.show = false
model.remove()
```

`type` 固定 `'gltf'`，`url` 可指 `.gltf` 或 `.glb`。`scale` 支持数字（均匀）或 `[x,y,z]`。需要贴合地形时先用 `sampleHeight` 查高度再传入 `height`。

需要呈现建筑窗灯等夜间自发光时，使用 `lighting: 'local'`（`materialMode: 'preserve'` 时默认就是 local）保留 glTF 的 `emissiveMap` / 点光，并打开 `viewer.scene.atmosphere.lighting.photometric` 与 `viewer.postProcess.autoExposure`。`photometric` 只缩放 Takram 太阳。点光要挂在带 `scale` 的模型根上；若上游把 `gltf.scene` 做了 bbox 平移而灯是兄弟节点，写入未平移模型时要用 `L - offset`。intensity 随世界尺度按距离平方补偿（上游 Non-geospatial 是 `scale={0.01}` / `0.1`）。夜景不依赖 Bloom，不要关太阳。

## HISM 大规模实例化

面向森林、岩石场等大量重复静态 mesh。Tellux 负责簇分桶、视锥剔除、LOD、RTC 定位与 BVH 拾取。

```ts
import tellux, { createWindSwayLeavesMaterial, type HismArchetype } from 'tellux'

const layer = viewer.addHismLayer({
  id: 'forest',
  archetypes: [
    {
      name: 'oak',
      lodLevels: [
        {
          maxDistanceMeters: 600,
          parts: [
            { geometry: branchesGeo, material: branchesMat },
            { geometry: leavesGeo, material: leavesMat }
          ]
        },
        {
          maxDistanceMeters: Number.POSITIVE_INFINITY,
          parts: [{ geometry: impostorGeo, material: impostorMat }]
        }
      ]
    }
  ],
  instances: sampledPlacements.map((p) => ({
    coordinates: [p.longitude, p.latitude, p.height],
    heading: p.heading,
    scale: p.scale,
    archetype: p.presetIndex
  })),
  clusterCellSizeMeters: 512,
  referenceLongitude: centerLon,
  referenceLatitude: centerLat,
  onUpdate: (_dt, elapsed) => tree.update(elapsed)
})

// 拾取（坐标相对 canvas 左上角）
viewer.on('click', (e) => {
  const hit = viewer.pick(e.position, { layers: ['hismInstance'] })
  if (hit?.type === 'hismInstance') {
    console.log(hit.instance.layerId, hit.instance.instanceId)
    viewer.highlighter.set(hit)
  }
})

layer.remove()
viewer.getHismRuntimeStats() // 可见实例数、draw calls、LOD 分布
```

ez-tree 叶片风摆：`createWindSwayLeavesMaterial({ rtcUniforms: viewer.hism.rtcUniforms, ... })`。

完整说明见仓库 `docs/guide/hism.md`；性能 demo 见 `examples/hism/hism-forest.html`。

## 渲染循环

默认接管动画循环。接入外部循环时关掉并手动推进：

```ts
viewer.useDefaultRenderLoop = false
function animate(time: number) {
  viewer.render(time)
  requestAnimationFrame(animate)
}
requestAnimationFrame(animate)
```

像素比与色调曝光（顶层属性）：

```ts
viewer.renderer.resolutionScale = 1.5
viewer.postProcess.toneMappingExposure = 8
```
