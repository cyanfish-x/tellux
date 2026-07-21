# HISM 大规模实例化

HISM（Hierarchical Instanced Static Mesh）是 Tellux 内置的大规模静态网格实例化框架，面向森林、岩石场、城市道具等「同一套几何 + 大量重复放置」的场景。它在 `InstancedMesh` 之上提供：

- **空间簇分桶**与**视锥剔除**，减少无效 draw call
- **簇级 LOD 切换**，远距离自动降级 mesh 部件
- **RTC 高精度定位**，与 Tellux 椭球坐标系一致
- **BVH 加速拾取**，点击可命中具体实例

完整性能演示见示例 [`hism/hism-forest.html`](../../hism/hism-forest.html)（Sandcastle 中「HISM Forest」）。

## 快速上手

```ts
import tellux, { createWindSwayLeavesMaterial, type HismArchetype } from 'tellux'
import * as THREE from 'three'

const viewer = new tellux.Viewer('viewer', {
  terrain: { type: 'cesium-ion', assetId: 1, apiToken: token },
  scene: {
    atmosphere: { lighting: { mode: 'light-source' } }
  }
})

// 1. 定义原型（archetype）：一次放置会同步渲染其全部 mesh 部件
const archetypes: HismArchetype[] = [
  {
    name: 'tree',
    parts: [
      { geometry: branchesGeometry, material: branchesMaterial },
      { geometry: leavesGeometry, material: leavesMaterial }
    ]
  }
]

// 2. 采样地表高度后写入实例列表
const heights = await viewer.sampleHeightMostDetailed(
  placements.map((p) => [p.longitude, p.latitude])
)

const layer = viewer.addHismLayer({
  id: 'forest',
  archetypes,
  instances: placements.map((p, i) => ({
    coordinates: [p.longitude, p.latitude, heights[i]![2]],
    heading: p.heading,
    scale: p.scale,
    archetype: 0
  })),
  clusterCellSizeMeters: 512,
  referenceLongitude: centerLon,
  referenceLatitude: centerLat
})

// 3. 不再需要时移除
layer.remove()
```

`coordinates` 数组顺序为 `[经度, 纬度, 高度]`，与 GeoJSON 一致。

## 多 LOD 原型

当单个原型需要远近不同 mesh 时，用 `lodLevels` 代替 `parts`（二者互斥）：

```ts
const archetypes: HismArchetype[] = [
  {
    name: 'tree',
    lodLevels: [
      {
        maxDistanceMeters: 600,
        parts: [
          { geometry: branchesGeometry, material: branchesMaterial },
          { geometry: leavesGeometry, material: leavesMaterial }
        ]
      },
      {
        maxDistanceMeters: Number.POSITIVE_INFINITY,
        parts: [{ geometry: impostorGeometry, material: impostorMaterial }]
      }
    ]
  }
]
```

Tellux 按**簇中心到相机**的距离选择 LOD 级别。`maxDistanceMeters` 从小到大排列；超出最后一级距离时使用最后一级。

## 风摆与 Position Pipeline

ez-tree 等程序化植被的叶片风摆可通过 `createWindSwayLeavesMaterial` 接入 HISM。材质会自动挂载 Tellux Position Pipeline，与 RTC 实例化 stage 组合：

```ts
import { createWindSwayLeavesMaterial } from 'tellux'

const leavesMaterial = createWindSwayLeavesMaterial({
  map: ezLeavesMaterial.map,
  color: ezLeavesMaterial.color,
  alphaTest: 0.5,
  rtcUniforms: viewer.hism.rtcUniforms
})

viewer.addHismLayer({
  // ...
  onUpdate: (_delta, elapsed) => {
    tree.update(elapsed) // 驱动 ez-tree 风摆 uniform
  }
})
```

`onUpdate` 在每帧 HISM 更新阶段调用，适合同步外部动画系统。

## 拾取

`viewer.pickHism(position)` 接受**相对 canvas 左上角**的像素坐标（与 `viewer.on('click')` 事件中的 `event.position` 相同）：

```ts
viewer.on('click', (event) => {
  const hit = viewer.pickHism(event.position)
  if (!hit) {
    viewer.highlight.clear()
    return
  }

  viewer.highlight.set(hit) // 后处理描边：整实例全部 parts
  console.log(hit.layerId)        // 图层 id
  console.log(hit.instanceId)     // InstancedMesh 实例索引
  console.log(hit.archetypeIndex) // 原型索引
  console.log(hit.lodIndex)       // 当前 LOD 级别
  console.log(hit.point)          // 世界坐标命中点
})
```

默认会在命中点显示黄色标记（`HismPickMarker`）。与 `viewer.highlight` 描边并用时建议关闭：

```ts
new tellux.Viewer(container, {
  hism: { showPickMarker: false }
})
```

拾取仅检测**当前可见**的 HISM mesh（已做视锥剔除后的簇），不会触发额外瓦片加载。描边解析则按 active LOD 取 parts，**不**依赖 frustum，避免选中对象稍出屏就丢轮廓。

> 注意：描边贴合实例变换；PositionPipeline 风摆造成的顶点形变不会进入轮廓。

## 运行时统计

```ts
const stats = viewer.getHismRuntimeStats()
// stats.layerCount, stats.totalInstances, stats.visibleInstances
// stats.visibleClusters / stats.clusterCount
// stats.drawCalls
// stats.activeLodCounts['0'] — 各 LOD 可见实例数
```

也可通过 `viewer.hism.getRuntimeStats()` 访问同一数据。

## 图层管理

```ts
viewer.getHismLayer('forest')   // 获取图层句柄
viewer.removeHismLayer('forest') // 按 id 移除
viewer.hism.list()               // 列出全部图层
viewer.hism.rtcUniforms          // RTC uniform 桥（自定义材质时传入）
```

每个 `HismLayer` 句柄提供 `show` / `remove()` 等运行时控制。

## 与自定义 InstancedMesh 的关系

若你已在用 `viewer.applyRTCInstancing()` 手动管理 `InstancedMesh`，可以继续这样做。HISM 适合需要**多原型、多 LOD、簇剔除、统一拾取与统计**的场景；简单单层实例化不必强行迁移。

Tellux 内部 RTC 实例化已复用 HISM 的 `createRTCPositionPipeline()`，两套路径共享同一套 RTC shader stage。

## 能力边界

| 能力 | 支持情况 |
| --- | --- |
| 多图层并存 | ✅ |
| 每图层多原型 | ✅ |
| 簇级视锥剔除 | ✅ |
| 簇级 LOD | ✅ |
| BVH 实例拾取 | ✅（依赖 `three-mesh-bvh`） |
| 风摆 / Position Pipeline | ✅（叶片等自定义 stage） |
| 动态增删单个实例 | ❌ 需重建图层或自行管理 InstancedMesh |
| 与 Entity 系统混排 | 实例不在 Entity 树内，需用 `pickHism` 单独拾取 |
| WebGPU | 未单独验证；建议 WebGL 下使用 |

## 相关示例

| 示例 | 说明 |
| --- | --- |
| [`vegetation.html`](../../vegetation.html) | **Legacy** 入门：InstancedMesh + RTC 实例化森林 |
| [`hism/hism-forest.html`](../../hism/hism-forest.html) | **HISM** 能力演示：LOD、拾取、岩石第二层 |
| [`hism/hism-compare.html`](../../hism/hism-compare.html) | **Legacy vs HISM 对比**：手动设置 1–1000 万实例并测速 |

## 性能对比（Legacy vs HISM）

[`hism/hism-compare.html`](../../hism/hism-compare.html) 专门用于对比，与 `vegetation`（Legacy）和 `hism-forest`（HISM 演示）分离：

1. 输入实例数量（**1 – 10,000,000**）
2. 选择 **Legacy InstancedMesh** 或 **HISM**
3. 点击「生成并测速」——分别跑两种模式后，右上角表格会保留最近一次 Legacy / HISM 结果对比

大规模自动策略：

| 规模 | 行为 |
| --- | --- |
| ≤ 5000 | 泊松散布 + 可选地形采样 |
| > 5000 | 快速随机散布 + 高度 0 |
| > 50,000 | 单树种模板，缩短构建时间 |
| 半径 / 簇大小 | 随数量自动放大 |

命令行批量基准（需 `pnpm dev` + `pnpm exec playwright install chromium`）：

```bash
pnpm benchmark:hism
pnpm benchmark:hism -- --counts 5000,10000 --modes legacy,hism
```

## 性能基准（Benchmark）

仓库内置可复现基准脚本，自动扫描不同树规模并输出 CSV：

```bash
# 1. 启动示例服务
pnpm dev

# 2. 另开终端运行基准（默认 5k / 10k / 20k / 50k，仅树、无岩石）
pnpm benchmark:hism

# 自定义规模
pnpm benchmark:hism -- --counts 5000,10000,15000
```

结果写入 `benchmark-results/hism-benchmark-<timestamp>.csv`，字段包括：

| 列 | 含义 |
| --- | --- |
| `treeCount` | 目标树数量 |
| `loadMs` | 从散布到场景就绪的加载耗时 |
| `fpsAvg` / `fpsMin` / `fpsMax` | 相机到位后 warmup 8s、采样 3s 的 FPS |
| `visiblePercent` | 可见实例占比（HISM 簇剔除效果） |
| `drawCalls` | 当前帧 HISM draw call 数 |
| `clusterCount` / `visibleClusters` | 总簇数 / 可见簇数 |
| `lod0` / `lod1` | 各 LOD 可见实例数 |
| `error` | 失败原因（采样超时等） |

也可手动打开对比页：

```
http://127.0.0.1:5173/hism/hism-compare.html
http://127.0.0.1:5173/hism/hism-compare.html?autorun=1&trees=10000&mode=hism
```

::: tip 首次运行
需先安装 Playwright 浏览器：`pnpm exec playwright install chromium`
:::

::: warning 结果解读
脚本默认使用 headless + SwiftShader 软渲染，FPS **低于**你本机 Chrome 硬加速的真实值，但不同规模之间的**相对趋势**仍有参考价值。要测真实帧率，请直接在浏览器打开上述 URL 看 HUD。
:::
