# 高亮

Tellux 提供统一的 `viewer.highlight` 门面：按目标类型自动选择实现，调用方不必关心是描边还是贴膜。

| 目标 | 视觉 | 实现 |
| --- | --- | --- |
| `Object3D`（模型根节点、自定义 mesh 等） | 轮廓描边 | WebGL 后处理 `OutlineEffect` |
| `HismPickResult`（单实例整原型） | 轮廓描边 | 不可见 proxy Mesh + `OutlineEffect` |
| `Picked3DTilesFeature` | 半透明叠加几何 | 按 featureId 抽三角面或整 mesh 贴膜 |

样式在 `scene.highlight`，与初始化配置同构。

## 快速上手

```ts
viewer.on('click', (event) => {
  if (event.tilesetFeature) {
    viewer.highlight.set(event.tilesetFeature)
    return
  }
  viewer.highlight.clear()
})

viewer.on('mousemove', (event) => {
  viewer.highlight.setHover(event.tilesetFeature)
})
```

整对象描边（常与 `pickObject` 配合）：

```ts
const hit = viewer.pickObject(event.position, model.root)
if (hit) viewer.highlight.set(model.root)
// 或显式：
viewer.highlight.set({ type: 'object', object: mesh })
```

HISM 单实例描边（描当前 LOD 下该实例的全部 parts）：

```ts
const pick = viewer.pickHism(event.position)
if (pick) viewer.highlight.set(pick)
else viewer.highlight.clear()
```

关闭黄色命中点标记（与描边并用时建议关闭）：

```ts
new tellux.Viewer(container, {
  hism: { showPickMarker: false }
})
```

## 配置

```ts
const viewer = new tellux.Viewer(container, {
  scene: {
    highlight: {
      outline: {
        enabled: true,
        color: '#7cff5b',
        hiddenColor: '#7cff5b',
        edgeStrength: 1.5,
        xray: true
      },
      overlay: {
        enabled: true,
        color: '#7cff5b',
        opacity: 0.55,
        hoverColor: '#38bdf8',
        hoverOpacity: 0.42
      }
    }
  }
})
```

运行时：

```ts
viewer.scene.highlight.outline.color = '#38bdf8'
viewer.scene.highlight.overlay.opacity = 0.4
```

## API

| 方法 | 说明 |
| --- | --- |
| `set(target)` | 设置选中高亮（单选，替换） |
| `clear()` | 清除选中 |
| `setHover(target \| null)` | 设置或清除悬停高亮 |
| `get()` / `getHover()` | 读取当前目标 |

`HighlightTarget` 可为：

- `THREE.Object3D`
- `HismPickResult`
- `Picked3DTilesFeature`
- `{ type: 'object', object }`
- `{ type: 'hismInstance', pick }`
- `{ type: 'tilesFeature', feature }`

## 能力边界

- **描边仅 WebGL**：WebGPU 下 `outline` 为 no-op；Tiles feature **叠加**仍可用。
- P0 为单选；悬停与选中可并存，悬停同一目标时不重复叠加。
- HISM 描边贴合实例变换矩阵，**不**同步 PositionPipeline 风摆顶点形变。
- 3D Tiles 叠加依赖瓦片几何上的 `_BATCHID` / `_FEATURE_ID_*` 等属性；没有 feature id 时退化为整 mesh 贴膜或包围盒。

完整交互示例见 [`examples/3d-tiles-picking.html`](../../examples/3d-tiles-picking.html)、[`examples/hism/hism-forest.html`](../../examples/hism/hism-forest.html)。
