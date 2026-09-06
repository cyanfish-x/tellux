# 坐标系与自定义对象

把外部 Three.js 对象（marker、标签、自定义几何）按经纬度放到地球上的方法。

## 坐标约定速记

| 量 | 单位 |
| --- | --- |
| 纬度 / 经度 | 度 |
| 高度 | 米（WGS84 椭球海拔） |
| heading / pitch / roll | 度，相对当地东北天（ENU） |
| 太阳/月亮角半径 | 弧度 |

经纬高输入两种形式可混用：

```ts
// 元组：[经度, 纬度, 高度]  —— 注意顺序与 GeoJSON 一致
const tuple: [number, number, number] = [121.4737, 31.2304, 50]

// 对象
const object = { longitude: 121.4737, latitude: 31.2304, height: 50 }
```

底层 Three.js 场景用 **ECEF 世界坐标系**（原点地心，单位米），通常不需直接接触。

## 经纬高 → 世界坐标

`cartographicToVector3(input)` 返回 ECEF 世界坐标（米），`THREE.Vector3`：

```ts
const position = viewer.cartographicToVector3([121.4737, 31.2304, 50])
```

## 经纬高 → 对象矩阵（最常用）

`cartographicToMatrix4(input, options?)` 返回适合 Three.js 对象的 4×4 矩阵，可直接赋给 `Object3D.matrix`。该矩阵的当地框架：**`+Y` 指向当地上方，`+Z` 指向对象前方**（贴合 glTF 朝向习惯）。

```ts
const matrix = viewer.cartographicToMatrix4(
  { longitude: 121.4737, latitude: 31.2304, height: 50 },
  { heading: 45, pitch: 0, roll: 0 }
)

object.matrixAutoUpdate = false      // 必须关，否则下一帧被 position/rotation 覆盖
object.matrix.copy(matrix)
```

## 放置 glTF 模型

直接用 `models.add`，内部已处理矩阵和 Draco：

```ts
const model = viewer.models.add({
  type: 'gltf',
  url: '/models/wind-turbine.glb',
  coordinates: { longitude: 121.4737, latitude: 31.2304, height: 0 },
  heading: 180,
  scale: 1
})
```

贴合地形时先查高度：`const h = viewer.sampleHeight([121.4737, 31.2304]); coordinates.height = h ?? 0`。

## 放置自定义 Three.js 对象

```ts
import * as THREE from 'three'

const marker = new THREE.Mesh(
  new THREE.SphereGeometry(50),
  new THREE.MeshBasicMaterial({ color: 0xff3333 })
)
marker.matrixAutoUpdate = false
marker.matrix.copy(viewer.cartographicToMatrix4([121.4737, 31.2304, 100]))
viewer.scene.raw.add(marker)   // 加到这里参与 Tellux 渲染
```

> **尺度单位是米**。地球半径约 637 万米，半径 50 的球在地表尺度只是一个点，要看得见需放大或贴近查看。

### 高斯泼溅示例侧集成

Spark 默认输出 sRGB，而 Tellux WebGL 最终对整帧应用曝光与 AgX。案例通过 `SplatColorTransform` 复用点云 AgX 逆 LUT，保留高斯显示色，不以降低全局曝光修复高斯偏白；透明混合区域需视觉核验。纹理翻转错缝另见 `notes/engineering/Spark纹理上传状态缓存冲突.md`，不要混为颜色问题。

`examples/gaussian-splat-3d-tiles.ts` 提供 SvirnasAlyt / Elevator 高斯 3D Tiles、Cesium ion 和 Spark 单文件切换。高斯 3D Tiles 走 `TilesRenderer` + `GaussianSplatPlugin`，ion 另注册鉴权插件；独立 SPZ/PLY 走 `SplatMesh` + `SparkRenderer`，用 `cartographicToMatrix4` 把父 Group 放到展示锚点。示例需要 WebGL，没有新增 Tellux 公开门面。无地理参考资源的锚点与缩放应明确标注，不能暗示为真实位置。

接入专用依赖后，同步 `examples/gaussian-splat/sandcastleBindings.ts` 与 `GAUSSIAN_SPLAT_RUNTIME_BINDING_NAMES`，避免 Sandcastle 剥离 import 后缺失运行时值。数据源切换需隔离过期异步结果、释放对象，并在 tileset 根目录加载完成后定位；`flyToTarget` 不返回定位成功布尔值。

滚轮接近高斯时相机突然推远，先区分缩放位移与高度修正：控制器从相机上方 100 km 向下拾取，Spark 2.1.0 WASM 的 f32 椭球求交会发生消减误差。2026-09-06 用户复现日志中，正常缩放约 0.53 m 后触发 59.18 m 推高，下一帧推高 76.25 m。仅把射线起点移到整块瓦片包围盒前并不充分：用户随后复现右键抖动，两次高度射线仅相差约 3.7 微米，高斯交点却相差约 0.196 m；鼠标停住后又下移约 0.178 m。球形高斯的长射线测试不足以覆盖细小各向异性高斯。

`stabilizeSplatRaycast` 现使用 `three-mesh-bvh` 对每个高斯的保守包围盒建立 CPU 索引，仅对候选高斯执行 JS 双精度求交。候选内再次重定位，以最近点形式计算椭球交点，保留 Spark 的薄椭圆盘、opacity、near/far 及入口面语义。代理三角形只编码包围盒，不参与渲染或三角形拾取；不通过关闭 `adjustHeight` 或全局高斯拾取掩盖问题。单文件初始化与 3D Tiles 的 `load-model` 均须接入，索引随 `mesh.dispose()` 释放。仅用于静态解码数据；视觉 LOD 使用完整源数据保持锚点稳定，显式 raycastIndices 子集回退到原始 Spark，分页数据不安装适配；动态变形或数据替换需要重建索引。额外 CPU 索引内存不属于原始高斯压缩文件大小。

`examples/gaussian-splat/stabilizeSplatRaycast.test.ts` 覆盖实际 Spark/WASM 长射线误差、细小各向异性高斯的微小方向变化、Packed/Ext、地心坐标变换、near/far、薄盘与透明度、候选裁剪及销毁；新增双精度修复后的真实浏览器右键操作仍待用户验收。

近距离拖动仍出现模型跳动时，另查插件的缓存坐标系。0.1.14 已有 `CameraRelativeSparkRenderer`，但它曾按当前有无可见高斯根节点选择渲染相机；瓦片切换时没有可见根节点，异步排序却仍可显示上一帧相机相对数据，导致 ECEF 世界相机与局部缓存混用。2026-09-06 渲染日志 3658 条中有两条相邻异常记录（同一帧重复渲染），`renderToViewPos` 从米级突变为约 637 万米；其余采样的变换参数量化估算误差为微米级，不能据此证明实际 GPU 每个像素的误差。`patches/3d-tiles-rendererjs-3dgs-plugin@0.1.14.patch` 使渲染始终使用 display 缓存记录的相对坐标系；`sparkCameraFrame.test.ts` 执行安装包的真实坐标转换代码，覆盖无可见根节点、待排序缓存以及 ECEF 矩阵恢复。它与 CPU 拾取精度修复是独立问题，不应再次开关 WebGPU 的 highPrecision 来修 WebGL 高斯路径。依赖补丁变更后刷新 Vite 预构建；此次缓存坐标系修复仍待真实页面验收。

官方 Redmond 资产的 token 留空时，案例使用 CesiumJS 公开评估 token；其他资产使用显式 token 或环境配置。Spark 2.1.0 ESM 的原生 `gl.pixelStorei` 会绕过 Three.js 缓存，使后续 Canvas 纹理翻转失效，仓库通过 pnpm patch 修复。瓦片错缝先区分 URL 索引、ImageBitmap 方向与 WebGL 上传状态，不要仅凭截图交换 x/y。

## 世界坐标 → 经纬高（反向）

通常通过拾取接口完成（见 interaction.md）：

- 屏幕点 → 经纬高：`viewer.pickCartographic({ x, y })`
- 屏幕点 → feature（含经纬高）：`viewer.pick({ x, y }, { layers: ['tilesFeature'] })`
