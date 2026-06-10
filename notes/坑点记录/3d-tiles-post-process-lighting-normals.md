# 3D Tiles 后处理光照与法线坑点

本文记录 `google-photorealistic-3d-tiles` 示例在 `post-process` 光照模式下的排查结论。核心经验是：摄影测量 3D Tiles 要对齐 Takram 示例的 `NormalPass + creased normals + AerialPerspective` 路径，不要把深度重建法线当成首选修复。

## 现象

`google-photorealistic-3d-tiles` 在切到 `post-process` 光照后，模型光照一开始不稳定或看起来没有正确参与后处理光照。临时开启 `AerialPerspectiveEffect.reconstructNormal` 后，光照方向和明暗关系看起来变正确，但建筑和瓦片边缘出现很大的锯齿。

这类锯齿不是普通材质 basic/standard 切换问题。材质切换能保证后处理拿到正确 albedo，但不能保证 `NormalPass` 输出的法线缓冲足够稳定。

## 容易误判的方向

1. 误以为摄影测量数据就应该开启深度重建法线。

   `reconstructNormal` 可以绕过缺失几何法线的问题，但它从屏幕深度推导法线，深度断层和建筑轮廓处会产生很硬的 normal discontinuity。后处理光照会放大这些断层，表现为巨大锯齿。

2. 只关注 `TileCreasedNormalsPlugin`，忽略 `NormalPass` 缓冲精度。

   Takram 的示例不只是给瓦片重算法线，还把 `NormalPass.renderTarget.texture.type` 设成 `HalfFloatType`。如果 normal buffer 仍是低精度默认纹理，后处理光照边缘仍可能有明显量化和锯齿。

3. 把 creased normals 做成全局 scene 开关。

   全局开关会影响基础地表、地形、普通 3D Tiles、采样专用 tileset 等多条路径，边界太宽。Takram 示例是在当前 Google tiles renderer 上挂插件，Tellux 中应收敛为 `load3DTileset` 图层级选项。

## Takram 示例的真实做法

Takram Manhattan 示例实际使用的是后处理光照：

- `<AerialPerspective sunLight skyLight ... />`
- `EffectComposer enableNormalPass={normals}`，且 `normals` 默认 `true`
- `<SMAA />`
- `multisampling={0}`
- Google tiles renderer 上挂 `TileCreasedNormalsPlugin`

它没有使用 `reconstructNormal`。它依赖几何法线进入 `NormalPass`，再由 `AerialPerspective` 用 normal buffer 做后处理光照。

额外容易漏掉的一点：Takram 的 `EffectComposer` helper 会把 `NormalPass` 的 render target texture 改成 `HalfFloatType`，这是 Tellux 需要同步的关键细节。

## 当前修复策略

1. 移除未采用的 `atmosphereReconstructNormal` 公开 API 和设置面板入口。

   这条路径能临时改善光照方向，但不是 Takram Manhattan 示例的做法，并且会在摄影测量轮廓处引入明显锯齿。

2. 把 `creasedNormals` 收敛为 3D Tiles 图层级选项。

   推荐用法：

   ```ts
   viewer.load3DTileset({
     type: 'cesium-ion',
     assetId: 2275207,
     apiToken,
     creasedNormals: true
   })
   ```

   不再保留 `ViewerOptions.scene.creasedNormals` 这种全局入口。

3. `TileCreasedNormalsPlugin` 对齐 Takram 细节。

   - 插件优先级使用低优先级值，让它尽早处理 tile model。
   - 使用 `toCreasedNormals(..., 30 * DEG2RAD)`。
   - 修正退化三角形产生的零法线，把它们替换成非零 fallback normal。
   - 只有 `toCreasedNormals` 返回新 geometry 时才 dispose 旧 geometry。若原 geometry 已经是 non-indexed，`toCreasedNormals` 会原地返回同一个 geometry，不能 dispose 正在使用的 geometry。

4. `PostProcessingManager` 对齐 Takram normal buffer 精度。

   创建 `NormalPass` 后，将内部 render target texture 类型设为 `THREE.HalfFloatType`，再赋给 `AerialPerspectiveEffect.normalBuffer`。

## 快速排查清单

遇到 `post-process` 下 3D Tiles 光照或边缘异常时，按这个顺序查：

1. 当前光照模式是否确实是 `post-process`。
2. Viewer 管理的 tiles 和 models 是否已随光照模式切成 basic 材质。
3. 摄影测量 tiles 是否通过 `load3DTileset({ creasedNormals: true })` 开启图层级折痕法线。
4. `NormalPass` 的 render target texture 是否是 `HalfFloatType`。
5. `TileCreasedNormalsPlugin` 是否处理了退化三角形零法线。
6. 不要优先开启深度重建法线；它是 fallback，不是 Google photorealistic 这类数据的首选路径。

## 相关文件

- `src/TileCreasedNormalsPlugin.ts`
- `src/rendering/PostProcessingManager.ts`
- `src/tiles/TilesetManager.ts`
- `src/types.ts`
- `examples/google-photorealistic-3d-tiles.ts`
- `docs/guide/lighting.md`

## 维护准则

- 法线重建属于 3D Tiles 图层加载处理，不要放回 Viewer scene 全局配置。
- normal buffer 精度属于后处理管线配置，不要和 tileset 插件逻辑混在一起。
- 材质切换、法线重建、normal buffer 精度是三个独立问题，排查时不要互相替代。
- 对齐外部示例时要看完整链路：示例源码、helper、插件和 render target 配置都要看，不能只看 JSX 里的主组件。
